import type {
  StoryQC,
  StoryQCEvaluator as StoryQCEvaluatorKind,
  StoryQCErrorCode,
  StoryQCIssue,
  StoryQCSceneResult,
} from '~/models/story'
import type { StoryCostGuard } from './cost'
import type { SceneRecord, StoryRecord } from './repository'
import { aggregateQc, compareScene, sortIssues, technicalIssues } from './qc-checker'
import { QCFramesGlobalError } from './qc-frames'
import type {
  QCFrameStrip,
  QCSceneExpectation,
  StoryFrameExtractor,
  StoryQCEvaluator,
  StoryQCResult,
} from './qc-types'
import { storyBeatForScene } from './story-prompt-composer'

export interface StoryQCServiceConfig {
  readonly enabled: boolean
  readonly minConfidence: number
  readonly timeoutMs: number
}

export interface StoryQCServiceEvent {
  readonly event: string
  readonly storyId?: string
  readonly sceneOrder?: number
  readonly stage?: string
  readonly evaluator?: StoryQCEvaluatorKind
  readonly qcStatus?: string
  readonly qcErrorCode?: string
  readonly issueCount?: number
  readonly blockingIssueCount?: number
  readonly confidence?: number
  readonly latencyMs?: number
}

export interface StoryQCServiceOptions {
  readonly frameExtractor: StoryFrameExtractor
  readonly evaluator: StoryQCEvaluator
  readonly costGuard: StoryCostGuard
  readonly config: StoryQCServiceConfig
  readonly now?: () => number
  readonly onEvent?: (event: StoryQCServiceEvent) => void
}

export interface StoryQCInput {
  readonly story: StoryRecord
  readonly clips: readonly { readonly sceneId: string; readonly order: number; readonly url: string }[]
}

export interface StoryQCService {
  run(input: StoryQCInput): Promise<StoryQCResult>
}

const VISION_UNAVAILABLE_CODES: readonly StoryQCErrorCode[] = [
  'qc-disabled',
  'qc-not-configured',
  'qc-budget-skipped',
]

const NO_VISION_CODES: readonly StoryQCErrorCode[] = [
  'qc-disabled',
  'qc-not-configured',
]

function expectationFor(
  story: StoryRecord,
  scene: SceneRecord,
): QCSceneExpectation {
  const bible = story.plan?.storyBible ?? null
  const beat = storyBeatForScene(
    story.plan,
    {
      order: scene.order,
      visualPrompt: scene.visualPrompt,
      narration: scene.narration,
    },
    story.scenes.length,
  )

  return {
    sceneId: scene.id,
    order: scene.order,
    leadCharacterId: bible?.leadCharacterId ?? '',
    characters: beat.characters,
    props: beat.props,
    signaturePropId: bible?.signaturePropId ?? null,
    visualPrompt: beat.visualPrompt,
    continuityFromPrevious: beat.continuityFromPrevious,
    sceneRole: beat.sceneRole,
    camera: beat.camera,
  }
}

interface MutableSceneResult {
  readonly sceneId: string
  readonly order: number
  framesUrl: string | null
  technical: 'pass' | 'fail'
  observed: StoryQCSceneResult['observed']
  confidence: number | null
  issues: readonly StoryQCIssue[]
}

function emptyScene(sceneId: string, order: number): MutableSceneResult {
  return {
    sceneId,
    order,
    framesUrl: null,
    technical: 'pass',
    observed: null,
    confidence: null,
    issues: [
      {
        code: 'frames-unavailable',
        severity: 'warning',
        sceneId,
        order,
        frame: 'clip',
      },
    ],
  }
}

export class NativeStoryQCService implements StoryQCService {
  private readonly frameExtractor: StoryFrameExtractor
  private readonly evaluator: StoryQCEvaluator
  private readonly costGuard: StoryCostGuard
  private readonly config: StoryQCServiceConfig
  private readonly now: () => number
  private readonly onEvent: (event: StoryQCServiceEvent) => void

  constructor(options: StoryQCServiceOptions) {
    this.frameExtractor = options.frameExtractor
    this.evaluator = options.evaluator
    this.costGuard = options.costGuard
    this.config = options.config
    this.now = options.now ?? Date.now
    this.onEvent = options.onEvent ?? (() => undefined)
  }

  async run(input: StoryQCInput): Promise<StoryQCResult> {
    const controller = new AbortController()
    let visionCalls = 0
    const timer = setTimeout(() => {
      controller.abort()
    }, this.config.timeoutMs)

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
    input: StoryQCInput,
    signal: AbortSignal,
    onVisionCall: () => void,
  ): Promise<StoryQCResult> {
    const startedAt = this.now()
    const story = input.story
    const bible = story.plan?.storyBible ?? null
    const orderedScenes = story.scenes.slice().sort((a, b) => a.order - b.order)

    this.emit({ event: 'story.qc.start', storyId: story.id })

    let strips: readonly QCFrameStrip[]

    try {
      strips = await this.frameExtractor.extract({
        storyId: story.id,
        clips: input.clips,
        signal,
      })
      this.emit({
        event: 'story.qc.frames.ok',
        storyId: story.id,
        latencyMs: this.now() - startedAt,
      })
    } catch (error) {
      if (error instanceof QCFramesGlobalError && error.code === 'ffmpeg-not-configured') {
        throw error
      }

      this.emit({
        event: 'story.qc.frames.failed',
        storyId: story.id,
        qcErrorCode: 'qc-frames-failed',
        latencyMs: this.now() - startedAt,
      })

      const scenes = orderedScenes.map((scene) => emptyScene(scene.id, scene.order))

      return {
        qc: {
          status: 'UNAVAILABLE',
          errorCode: 'qc-frames-failed',
          evaluator: 'none',
          checkedAt: new Date(this.now()).toISOString(),
          confidence: null,
          scenes,
          issues: sortIssues(scenes.flatMap((scene) => scene.issues)),
          override: null,
        },
        technicalFailures: [],
      }
    }

    const stripByScene = new Map(strips.map((strip) => [strip.sceneId, strip]))
    const technicalFailures: { readonly sceneId: string; readonly order: number }[] = []
    const results: MutableSceneResult[] = orderedScenes.map((scene) => {
      const strip = stripByScene.get(scene.id)

      if (!strip) {
        return emptyScene(scene.id, scene.order)
      }

      if (strip.technical.length > 0) {
        technicalFailures.push({ sceneId: scene.id, order: scene.order })

        return {
          sceneId: scene.id,
          order: scene.order,
          framesUrl: null,
          technical: 'fail',
          observed: null,
          confidence: null,
          issues: technicalIssues(scene, strip.technical),
        }
      }

      return {
        sceneId: scene.id,
        order: scene.order,
        framesUrl: strip.framesUrl,
        technical: 'pass',
        observed: null,
        confidence: null,
        issues: strip.framesUrl === null
          ? [
              {
                code: 'frames-unavailable',
                severity: 'warning',
                sceneId: scene.id,
                order: scene.order,
                frame: 'clip',
              },
            ]
          : [],
      }
    })

    const visionEnabled = bible !== null && this.config.enabled
    let evaluator: StoryQCEvaluatorKind = visionEnabled ? 'vision' : 'none'
    let errorCode: StoryQCErrorCode | null = visionEnabled
      ? null
      : bible === null
        ? 'qc-not-configured'
        : 'qc-disabled'

    if (visionEnabled && bible !== null) {
      try {
        this.costGuard.assertWithinBudget(this.costGuard.estimateAfterQc(story))
      } catch {
        errorCode = 'qc-budget-skipped'
        evaluator = 'none'
        this.emit({
          event: 'story.qc.budget_skipped',
          storyId: story.id,
          qcErrorCode: 'qc-budget-skipped',
        })
      }
    }

    if (errorCode === null && bible !== null) {
      let previous = null as StoryQCSceneResult['observed']

      for (const result of results) {
        if (result.technical === 'fail' || result.framesUrl === null) {
          previous = null
          continue
        }

        if (signal.aborted || this.now() - startedAt > this.config.timeoutMs) {
          errorCode = 'qc-evaluator-timeout'
          this.emit({
            event: 'story.qc.evaluator.failed',
            storyId: story.id,
            sceneOrder: result.order,
            qcErrorCode: 'qc-evaluator-timeout',
          })
          break
        }

        const scene = orderedScenes.find((item) => item.id === result.sceneId)!
        const expectation = expectationFor(story, scene)
        onVisionCall()
        const evaluation = await this.evaluator.evaluate({
          bible,
          expectation,
          previous,
          imageUrl: result.framesUrl,
          signal,
        })

        if (evaluation.kind === 'unavailable') {
          errorCode = evaluation.errorCode
          this.emit({
            event: 'story.qc.evaluator.failed',
            storyId: story.id,
            sceneOrder: result.order,
            qcErrorCode: evaluation.errorCode,
          })
          break
        }

        previous = evaluation.observed
        result.observed = evaluation.observed
        result.confidence = evaluation.confidence
        result.issues = compareScene({
          expectation,
          observed: evaluation.observed,
          framesAvailable: result.framesUrl !== null,
        })

        const sceneIssueCount = result.issues.length
        const sceneBlocking = result.issues.filter(
          (issue) => issue.severity === 'blocking',
        ).length

        this.emit({
          event: 'story.qc.evaluator.ok',
          storyId: story.id,
          sceneOrder: result.order,
          evaluator: 'vision',
          qcStatus: 'evaluated',
          issueCount: sceneIssueCount,
          blockingIssueCount: sceneBlocking,
          confidence: Math.round(evaluation.confidence * 100) / 100,
        })
      }
    }

    const aggregation = aggregateQc({
      scenes: results,
      evaluator,
      minConfidence: this.config.minConfidence,
      errorCode,
    })

    if (
      errorCode !== null
      && VISION_UNAVAILABLE_CODES.includes(errorCode)
      && aggregation.status === 'UNAVAILABLE'
    ) {
      evaluator = 'none'
    }

    const status = errorCode !== null && NO_VISION_CODES.includes(errorCode)
      ? 'UNAVAILABLE'
      : aggregation.status

    const qc: StoryQC = {
      status,
      errorCode,
      evaluator,
      checkedAt: new Date(this.now()).toISOString(),
      confidence: aggregation.confidence,
      scenes: results,
      issues: aggregation.issues,
      override: null,
    }

    this.emit({
      event: `story.qc.${status.toLowerCase()}`,
      storyId: story.id,
      evaluator,
      qcStatus: status,
      ...(errorCode === null ? {} : { qcErrorCode: errorCode }),
      issueCount: qc.issues.length,
      blockingIssueCount: qc.issues.filter((issue: StoryQCIssue) =>
        issue.severity === 'blocking',
      ).length,
      ...(qc.confidence === null
        ? {}
        : { confidence: Math.round(qc.confidence * 100) / 100 }),
      latencyMs: this.now() - startedAt,
    })

    return { qc, technicalFailures }
  }

  private emit(event: StoryQCServiceEvent): void {
    this.onEvent(event)
  }
}

export function createStoryQCService(options: StoryQCServiceOptions): StoryQCService {
  return new NativeStoryQCService(options)
}
