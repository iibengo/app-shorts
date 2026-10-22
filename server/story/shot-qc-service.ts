import type {
  StoryQC,
  StoryQCErrorCode,
  StoryQCIssue,
  StoryQCShotResult,
  StoryQCVarietyPair,
} from '~/models/story'
import type { QCSceneExpectation, StoryFrameExtractor, StoryQCEvaluator } from './qc-types'
import type { ReelShotRecord, ReelStoryRecord } from './reel-repository'
import type { ReelCostGuard } from './reel-cost'
import { QCFramesGlobalError } from './qc-frames'
import { hammingDistance } from './qc-frames'
import {
  aggregateShotQc,
  compareShot,
  shotIssue,
  sortShotIssues,
  technicalShotIssues,
} from './shot-qc-checker'
import type { ShotQcContext } from './shot-qc-checker'

export interface ShotQcClip {
  readonly shotId: string
  readonly url: string
}

export interface ShotQCServiceConfig {
  readonly enabled: boolean
  readonly minConfidence: number
  readonly timeoutMs: number
}

export interface ShotQCResult {
  readonly qc: StoryQC
  readonly technicalFailures: readonly {
    readonly shotId: string
    readonly sceneId: string
    readonly order: number
  }[]
}

export interface ShotQCService {
  run(input: { readonly story: ReelStoryRecord; readonly clips: readonly ShotQcClip[] }): Promise<ShotQCResult>
}

export interface ShotQCServiceOptions {
  readonly frameExtractor: StoryFrameExtractor
  readonly evaluator: StoryQCEvaluator
  readonly costGuard: ReelCostGuard
  readonly config: ShotQCServiceConfig
  readonly now?: () => number
  readonly onEvent?: (event: {
    readonly event: string
    readonly storyId?: string
    readonly shotId?: string
    readonly qcStatus?: string
    readonly qcErrorCode?: string
    readonly issueCount?: number
  }) => void
}

const MAX_SIMILAR_DISTANCE = 6

function contextFor(shot: ReelShotRecord): ShotQcContext {
  return {
    shotId: shot.id,
    sceneId: shot.sceneId,
    sceneOrder: shot.sceneOrder,
    shotOrder: shot.order,
    indexInScene: shot.indexInScene,
  }
}

function mentions(text: string, term: string): boolean {
  const normalized = text.normalize('NFC').toLowerCase()
  const candidate = term.normalize('NFC').trim().toLowerCase()

  return candidate.length > 0 && normalized.includes(candidate)
}

/**
 * QC only expects the entities declared by the shot itself. A close-up of one
 * actor must not be failed for not showing the rest of the scene characters.
 */
function expectationFor(
  story: ReelStoryRecord,
  shot: ReelShotRecord,
): QCSceneExpectation {
  const scene = story.scenes.find((item) => item.id === shot.sceneId)
  const narrative = scene?.scene
  const bible = story.plan.storyBible
  const location = bible?.locations.find((item) => item.id === shot.locationId)
  const text = `${shot.subject} ${shot.action} ${shot.visualPrompt}`

  return {
    sceneId: shot.sceneId,
    order: shot.sceneOrder,
    sceneRole: narrative?.sceneRole ?? 'development',
    locationId: shot.locationId,
    locationName: location?.name ?? shot.locationId,
    locationDescription: location?.description ?? 'Sin descripción.',
    timeOfDay: narrative?.timeOfDay ?? 'morning',
    weather: narrative?.weather ?? 'clear',
    characters: bible
      ? bible.characters
          .filter((character) => mentions(text, character.name) || mentions(text, character.id))
          .map((character) => character.id)
      : [],
    props: bible
      ? bible.props
          .filter((prop) => mentions(text, prop.name) || mentions(text, prop.id))
          .map((prop) => prop.id)
      : [],
    leadCharacterId: bible?.leadCharacterId ?? '',
    signaturePropId: bible?.signaturePropId ?? null,
    action: shot.action,
    visualPrompt: shot.visualPrompt,
    continuityFromPrevious: narrative?.continuityFromPrevious ?? null,
    camera: shot.camera,
  }
}

interface MutableShotResult {
  readonly context: ShotQcContext
  readonly indexInScene: number
  framesUrl: string | null
  technical: 'pass' | 'fail'
  observed: StoryQCShotResult['observed']
  confidence: number | null
  issues: readonly StoryQCIssue[]
}

function emptyShot(shot: ReelShotRecord): MutableShotResult {
  const context = contextFor(shot)

  return {
    context,
    indexInScene: shot.indexInScene,
    framesUrl: null,
    technical: 'pass',
    observed: null,
    confidence: null,
    issues: [shotIssue('frames-unavailable', 'warning', context, 'clip')],
  }
}

function toResult(shot: ReelShotRecord, result: MutableShotResult): StoryQCShotResult {
  return {
    shotId: shot.id,
    sceneId: shot.sceneId,
    sceneOrder: shot.sceneOrder,
    shotOrder: shot.order,
    indexInScene: result.indexInScene,
    framesUrl: result.framesUrl,
    technical: result.technical,
    observed: result.observed,
    confidence: result.confidence,
    issues: result.issues,
  }
}

export class NativeShotQCService implements ShotQCService {
  private readonly frameExtractor: StoryFrameExtractor
  private readonly evaluator: StoryQCEvaluator
  private readonly costGuard: ReelCostGuard
  private readonly config: ShotQCServiceConfig
  private readonly now: () => number
  private readonly onEvent: ShotQCServiceOptions['onEvent']

  constructor(options: ShotQCServiceOptions) {
    this.frameExtractor = options.frameExtractor
    this.evaluator = options.evaluator
    this.costGuard = options.costGuard
    this.config = options.config
    this.now = options.now ?? Date.now
    this.onEvent = options.onEvent
  }

  async run(input: {
    readonly story: ReelStoryRecord
    readonly clips: readonly ShotQcClip[]
  }): Promise<ShotQCResult> {
    const controller = new AbortController()
    let visionCalls = 0
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      return await this.execute(input, controller.signal, () => {
        visionCalls += 1
      })
    } finally {
      clearTimeout(timer)
      this.costGuard.recordQcEvaluations(input.story.id, visionCalls)
    }
  }

  private async execute(
    input: { readonly story: ReelStoryRecord; readonly clips: readonly ShotQcClip[] },
    signal: AbortSignal,
    onVisionCall: () => void,
  ): Promise<ShotQCResult> {
    const story = input.story
    const bible = story.plan.storyBible
    const ordered = story.shots.slice().sort((a, b) => a.order - b.order)
    let strips: Awaited<ReturnType<StoryFrameExtractor['extract']>>

    try {
      strips = await this.frameExtractor.extract({
        storyId: story.id,
        clips: ordered.map((shot) => ({
          sceneId: shot.id,
          order: shot.order,
          url: input.clips.find((clip) => clip.shotId === shot.id)?.url ?? '',
        })),
        frameCount: 2,
        hash: this.config.enabled,
        expectedDurationSeconds: story.preset === 'quality' ? 5 : 6,
        signal,
      })
    } catch (error) {
      if (error instanceof QCFramesGlobalError && error.code === 'ffmpeg-not-configured') {
        throw error
      }

      const results = ordered.map(emptyShot)
      const qc: StoryQC = {
        status: 'UNAVAILABLE',
        errorCode: 'qc-frames-failed',
        evaluator: 'none',
        checkedAt: new Date(this.now()).toISOString(),
        confidence: null,
        shots: ordered.map((shot, index) => toResult(shot, results[index]!)),
        issues: sortShotIssues(results.flatMap((result) => result.issues)),
        variety: null,
        override: null,
      }

      return { qc, technicalFailures: [] }
    }

    const stripByShot = new Map(strips.map((strip) => [strip.sceneId, strip]))
    const technicallyFailed: ShotQCResult['technicalFailures'][number][] = []
    const results: MutableShotResult[] = ordered.map((shot) => {
      const strip = stripByShot.get(shot.id)

      if (!strip) return emptyShot(shot)
      if (strip.technical.length > 0) {
        technicallyFailed.push({
          shotId: shot.id,
          sceneId: shot.sceneId,
          order: shot.order,
        })

        return {
          context: contextFor(shot),
          indexInScene: shot.indexInScene,
          framesUrl: null,
          technical: 'fail',
          observed: null,
          confidence: null,
          issues: technicalShotIssues(contextFor(shot), strip.technical),
        }
      }

      return {
        context: contextFor(shot),
        indexInScene: shot.indexInScene,
        framesUrl: strip.framesUrl,
        technical: 'pass',
        observed: null,
        confidence: null,
        issues: strip.framesUrl === null
          ? [shotIssue('frames-unavailable', 'warning', contextFor(shot), 'clip')]
          : [],
      }
    })

    let evaluator: 'vision' | 'none' = 'none'
    let errorCode: StoryQCErrorCode | null = bible === null
      ? 'qc-not-configured'
      : this.config.enabled
        ? null
        : 'qc-disabled'

    if (this.config.enabled && bible !== null) {
      try {
        this.costGuard.assertWithinCap(story, this.costGuard.estimateQc(story))
        evaluator = 'vision'
      } catch {
        errorCode = 'qc-budget-skipped'
      }
    }

    if (errorCode === null && bible !== null) {
      let previous: StoryQCShotResult['observed'] = null

      for (const result of results) {
        if (result.technical === 'fail' || result.framesUrl === null) {
          previous = null
          continue
        }

        if (signal.aborted) {
          errorCode = 'qc-evaluator-timeout'
          break
        }

        const shot = ordered.find((item) => item.id === result.context.shotId)!
        const evaluation = await this.evaluator.evaluate({
          bible,
          expectation: expectationFor(story, shot),
          previous,
          imageUrl: result.framesUrl,
          signal,
        })
        onVisionCall()

        if (evaluation.kind === 'unavailable') {
          errorCode = evaluation.errorCode
          break
        }

        previous = evaluation.observed
        result.observed = evaluation.observed
        result.confidence = evaluation.confidence
        result.issues = compareShot({
          expectation: expectationFor(story, shot),
          context: result.context,
          observed: evaluation.observed,
          framesAvailable: true,
        })
      }
    }

    const varietyPairs: StoryQCVarietyPair[] = []

    for (let index = 1; index < ordered.length; index += 1) {
      const previousShot = ordered[index - 1]!
      const shot = ordered[index]!
      const previousHash = stripByShot.get(previousShot.id)?.dHash
      const currentHash = stripByShot.get(shot.id)?.dHash

      if (!previousHash || !currentHash) continue

      const distance = hammingDistance(previousHash, currentHash)
      const similar = distance <= MAX_SIMILAR_DISTANCE

      varietyPairs.push({
        previousShotId: previousShot.id,
        shotId: shot.id,
        distance,
        similar,
      })

      if (similar) {
        const result = results[index]!

        result.issues = [
          ...result.issues,
          shotIssue('similar-shots', 'warning', result.context, 'middle'),
        ]
      }
    }

    const shotResults = ordered.map((shot, index) => toResult(shot, results[index]!))
    const aggregation = aggregateShotQc({
      shots: shotResults,
      evaluator,
      minConfidence: this.config.minConfidence,
      errorCode,
    })

    const qc: StoryQC = {
      status: aggregation.status === 'FAILED'
        ? 'FAILED'
        : errorCode === 'qc-disabled' || errorCode === 'qc-not-configured'
          ? 'UNAVAILABLE'
          : aggregation.status,
      errorCode,
      evaluator,
      checkedAt: new Date(this.now()).toISOString(),
      confidence: aggregation.confidence,
      shots: shotResults,
      issues: sortShotIssues(aggregation.issues),
      variety: {
        checkedAt: new Date(this.now()).toISOString(),
        pairs: varietyPairs,
      },
      override: null,
    }

    this.onEvent?.({
      event: `story.qc.${qc.status.toLowerCase()}`,
      storyId: story.id,
      qcStatus: qc.status,
      ...(errorCode === null ? {} : { qcErrorCode: errorCode }),
      issueCount: qc.issues.length,
    })

    return { qc, technicalFailures: technicallyFailed }
  }
}

export function createShotQCService(options: ShotQCServiceOptions): ShotQCService {
  return new NativeShotQCService(options)
}
