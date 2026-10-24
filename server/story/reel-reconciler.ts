import { randomBytes } from 'node:crypto'
import type { SceneStatus, StoryErrorCode } from '~/models/story'
import { assertFalMediaUrl } from '../fal/types'
import { StoryError, toStoryError } from './errors'
import type { ReelCostGuard } from './reel-cost'
import type {
  ReelSceneRecord,
  ReelShotRecord,
  ReelStoryRecord,
  ReelStoryRepository,
} from './reel-repository'
import type { ShotAssembler } from './shot-assembly-service'
import type { ShotKeyframeOrchestrator } from './shot-keyframe-orchestrator'
import { storyBeatForShot } from './shot-keyframe-orchestrator'
import { normalizeFocusFraming, resolveFocus } from './focus-framing'
import type {
  CharacterSheetOrchestrator,
  CharacterSheetSubmission,
} from './character-sheet-orchestrator'
import type {
  CharacterReferenceOrchestrator,
  CharacterReferenceSubmission,
} from './character-ref-orchestrator'
import {
  MAX_CHARACTER_REFS,
  characterRefCharacters,
  initialCharacterRefs,
  usableUserReferenceUrl,
} from './character-refs'
import type { StoredCharacterRef, StoredCharacterRefs } from './character-refs'
import type { ConsistencyChecker } from './consistency-check'
import type { KeyframeLayoutInspector } from './keyframe-layout-inspector'
import type { KeyframeTextInspector } from './keyframe-text-inspector'
import type { ShotQCService } from './shot-qc-service'
import type { ShotVideoOrchestrator } from './shot-video-orchestrator'

const IDENTITY_FRAMINGS: readonly string[] = [
  'medium',
  'close-up',
  'extreme-close-up',
  'reaction',
  'two-shot',
]

/** Only a framing that shows the face can seed a character identity anchor. */
export function isIdentityFraming(framing: string): boolean {
  return IDENTITY_FRAMINGS.includes(framing)
}

const KEYFRAME_ACTIVE: readonly SceneStatus[] = ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING']
const VIDEO_ACTIVE: readonly SceneStatus[] = ['VIDEO_QUEUED', 'VIDEO_RUNNING']

export interface ReelReconcilerConfig {
  readonly leaseMs: number
  readonly assemblyLeaseMs: number
  readonly qcLeaseMs: number
  readonly tickBudgetMs: number
  readonly keyframeConcurrency: number
  readonly videoConcurrency: number
  readonly claimLimit: number
  readonly keyframeMaxIdleMs?: number
  readonly videoMaxIdleMs?: number
}

/** A provider job that shows no state change for this long is considered dead. */
/**
 * Character sheet generation is switched off for good (012): the model copies
 * the grid of a 2x2 sheet and returns stacked panels, so a sheet is never sent
 * as a reference. Identity comes from one image per character instead.
 *
 * The orchestrator stays wired only so the retired pipeline keeps its test that
 * proves it never reaches the provider. Do not turn this back on without a new
 * spec: 011 and 012 both failed with grids.
 */
const DORMANT_SHEET = true

export const DEFAULT_KEYFRAME_MAX_IDLE_MS = 600_000
export const DEFAULT_VIDEO_MAX_IDLE_MS = 1_200_000
/** Two provider attempts per character, then the story continues without it. */
export const CHARACTER_REF_MAX_ATTEMPTS = 2
/** A reference job that shows no state change for this long is considered dead. */
export const DEFAULT_CHARACTER_REF_MAX_IDLE_MS = 180_000

export const DEFAULT_REEL_RECONCILER_CONFIG: ReelReconcilerConfig = {
  leaseMs: 60_000,
  assemblyLeaseMs: 480_000,
  qcLeaseMs: 720_000,
  tickBudgetMs: 45_000,
  keyframeConcurrency: 6,
  videoConcurrency: 4,
  claimLimit: 5,
  keyframeMaxIdleMs: DEFAULT_KEYFRAME_MAX_IDLE_MS,
  videoMaxIdleMs: DEFAULT_VIDEO_MAX_IDLE_MS,
}

export interface ReelReconcilerOptions {
  readonly repository: ReelStoryRepository
  readonly keyframes: ShotKeyframeOrchestrator
  readonly characterSheet?: CharacterSheetOrchestrator | null
  /** 012: one identity image per character, before the first keyframe. */
  readonly characterReferences?: CharacterReferenceOrchestrator | null
  /** Rejects stacked-panel keyframes before the video stage pays for them. */
  readonly layoutInspector?: KeyframeLayoutInspector | null
  /** 013: rejects a keyframe with burned-in text before the video is paid. */
  readonly textInspector?: KeyframeTextInspector | null
  readonly consistency?: ConsistencyChecker | null
  readonly videos: ShotVideoOrchestrator
  readonly assembler: ShotAssembler
  readonly qcService: ShotQCService | null
  readonly costGuard: ReelCostGuard
  readonly config: ReelReconcilerConfig
  readonly qcEnabled: boolean
  readonly owner?: string
  readonly now?: () => number
  readonly onEvent?: (event: {
    readonly event: string
    readonly storyId?: string
    readonly shotId?: string
    readonly order?: number
    readonly characterId?: string
    readonly errorCode?: string
    /** 012: framing the plan asked for, before the focus rule rewrote it. */
    readonly from?: string
    /** 012: framing actually sent to the provider. */
    readonly to?: string
  }) => void
}

export class ReelStoryReconciler {
  private readonly repository: ReelStoryRepository
  private readonly keyframes: ShotKeyframeOrchestrator
  private readonly characterSheet: CharacterSheetOrchestrator | null
  private readonly characterReferences: CharacterReferenceOrchestrator | null
  private readonly layoutInspector: KeyframeLayoutInspector | null
  private readonly textInspector: KeyframeTextInspector | null
  private readonly consistency: ConsistencyChecker | null
  private readonly videos: ShotVideoOrchestrator
  private readonly assembler: ShotAssembler
  private readonly qcService: ShotQCService | null
  private readonly costGuard: ReelCostGuard
  private readonly config: ReelReconcilerConfig
  private readonly qcEnabled: boolean
  private readonly owner: string
  private readonly now: () => number
  private readonly onEvent: ReelReconcilerOptions['onEvent']
  private readonly keyframeMaxIdleMs: number
  private readonly videoMaxIdleMs: number
  private readonly sheetSubmissions = new Map<string, CharacterSheetSubmission>()
  private readonly characterRefSubmissions = new Map<
    string,
    Map<string, CharacterReferenceSubmission>
  >()
  private assemblyInFlight = false
  private qcInFlight = false

  constructor(options: ReelReconcilerOptions) {
    this.repository = options.repository
    this.keyframes = options.keyframes
    this.characterSheet = options.characterSheet ?? null
    this.characterReferences = options.characterReferences ?? null
    this.layoutInspector = options.layoutInspector ?? null
    this.textInspector = options.textInspector ?? null
    this.consistency = options.consistency ?? null
    this.videos = options.videos
    this.assembler = options.assembler
    this.qcService = options.qcService
    this.costGuard = options.costGuard
    this.config = options.config
    this.qcEnabled = options.qcEnabled
    this.owner = options.owner ?? `reel-reconciler-${randomBytes(6).toString('hex')}`
    this.now = options.now ?? Date.now
    this.onEvent = options.onEvent
    this.keyframeMaxIdleMs = options.config.keyframeMaxIdleMs ?? DEFAULT_KEYFRAME_MAX_IDLE_MS
    this.videoMaxIdleMs = options.config.videoMaxIdleMs ?? DEFAULT_VIDEO_MAX_IDLE_MS
  }

  async runOnce(): Promise<void> {
    const now = this.now()
    const claimable = await this.repository.listClaimable(new Date(now), this.config.claimLimit)

    for (const candidate of claimable) {
      const claimNow = this.now()
      const leaseMs = candidate.status === 'ASSEMBLING'
        ? this.config.assemblyLeaseMs
        : candidate.status === 'QC'
          ? this.config.qcLeaseMs
          : this.config.leaseMs
      const claimed = await this.repository.claim(
        candidate.id,
        this.owner,
        new Date(claimNow + leaseMs),
        new Date(claimNow),
      )

      if (!claimed) continue

      this.onEvent?.({ event: 'reel.reconciler.claim', storyId: candidate.id })

      try {
        await this.process(candidate.id)
      } catch (error) {
        this.onEvent?.({
          event: 'reel.reconciler.error',
          storyId: candidate.id,
          errorCode: toStoryError(error).code,
        })
      } finally {
        await this.repository.release(candidate.id, this.owner)
      }
    }
  }

  private async process(storyId: string): Promise<void> {
    const story = await this.repository.findById(storyId)

    if (!story || story.leaseOwner !== this.owner) {
      this.clearCharacterRefSubmissions(storyId)
      return
    }

    if (story.status === 'GENERATING_KEYFRAMES') {
      await this.processKeyframes(story)
      return
    }
    if (story.status === 'GENERATING_VIDEOS') {
      await this.processVideos(story)
      return
    }
    if (story.status === 'VIDEOS_READY') {
      if (this.shouldSkipQc(story)) {
        await this.processAssembly(story, false)
      } else {
        await this.processQc(story)
      }
      return
    }
    if (story.status === 'QC') {
      await this.processQc(story)
      return
    }
    if (story.status === 'ASSEMBLING') {
      await this.processAssembly(story, true)
    }
  }

  private shouldSkipQc(story: ReelStoryRecord): boolean {
    if (!story.qc) return false
    return story.qc.status === 'PASSED' || story.qc.override?.approved === true
  }

  private technicalOnlyPass(qc: ReelStoryRecord['qc']): boolean {
    return qc !== null
      && qc.status === 'UNAVAILABLE'
      && (qc.errorCode === 'qc-disabled' || qc.errorCode === 'qc-not-configured')
  }

  private referenceExpired(story: ReelStoryRecord): boolean {
    return story.referenceExpiresAt !== null
      && story.referenceExpiresAt.getTime() <= this.now()
  }

  private async processKeyframes(story: ReelStoryRecord): Promise<void> {
    if (this.referenceExpired(story)) {
      await this.failStory(story, 'reference-expired', ['GENERATING_KEYFRAMES'])
      return
    }

    // 012: identity images come first. While a reference is pending no
    // keyframe is generated, so every shot can use the same face.
    const ready = await this.ensureCharacterRefs(story)

    if (ready === null) return

    const deadline = this.now() + this.config.tickBudgetMs

    for (const initial of ready.shots) {
      if (this.now() > deadline) break

      const fresh = await this.repository.findById(story.id)

      if (!fresh || fresh.status !== 'GENERATING_KEYFRAMES' || fresh.leaseOwner !== this.owner) {
        return
      }

      const shot = fresh.shots.find((item) => item.id === initial.id)
      const scene = shot === undefined
        ? undefined
        : fresh.scenes.find((item) => item.id === shot.sceneId)

      if (!shot || !scene) continue

      await this.processKeyframeShot(fresh, shot, scene)
    }

    await this.finalizeKeyframes(story.id)
  }

  /**
   * Generates one image per character once per story, before the first
   * keyframe. A ready reference is never submitted again; two attempts and a
   * 180 s idle window bound the cost. A failed reference never blocks the
   * story, because identity is a quality improvement, not a requirement.
   *
   * Returns the freshest record when the phase is complete, or `null` while a
   * provider job is still pending.
   */
  private async ensureCharacterRefs(
    initial: ReelStoryRecord,
  ): Promise<ReelStoryRecord | null> {
    const orchestrator = this.characterReferences

    // Without a provider the legacy anchor path still works; references are an
    // additive layer, never a reason to stop generating.
    if (orchestrator === null) return initial
    if (initial.plan.storyBible === null) return initial

    const characters = characterRefCharacters(initial.plan)

    if (characters.length === 0) return initial

    const nowIso = new Date(this.now()).toISOString()
    const targetIds = characters.map((character) => character.id)
    let story = initial
    let refs = this.pruneCharacterRefs(story.characterRefs, targetIds)
    let changed = false

    const seeded = initialCharacterRefs(story.plan, story.referenceUrl, nowIso)

    for (const character of characters) {
      if (refs[character.id] !== undefined) continue

      const entry = seeded[character.id]

      if (entry !== undefined) {
        refs = { ...refs, [character.id]: entry }
        changed = true
      }
    }

    if (changed) {
      const stored = await this.repository.updateCharacterRefs(
        story.id,
        refs,
        { statuses: ['GENERATING_KEYFRAMES'], version: story.version, leaseOwner: this.owner },
      )

      // A losing worker must stop: another tick already advanced this story.
      if (!stored) return null

      const fresh = await this.repository.findById(story.id)

      if (!fresh || fresh.status !== 'GENERATING_KEYFRAMES' || fresh.leaseOwner !== this.owner) {
        return null
      }

      story = fresh
      refs = this.pruneCharacterRefs(story.characterRefs, targetIds)
    }

    if (!characters.some((character) => refs[character.id]?.status === 'pending')) {
      this.clearCharacterRefSubmissions(story.id)

      return story
    }

    const submissions = this.characterRefSubmissions.get(story.id)
      ?? new Map<string, CharacterReferenceSubmission>()
    this.characterRefSubmissions.set(story.id, submissions)

    let waiting = false

    for (const character of characters) {
      const ref = refs[character.id]

      if (ref === undefined || ref.status !== 'pending') continue

      const submission = submissions.get(character.id)

      if (submission === undefined) {
        if (ref.attempts >= CHARACTER_REF_MAX_ATTEMPTS) {
          refs = await this.markCharacterRefFailed(
            story,
            refs,
            character.id,
            'provider-error',
            nowIso,
          )
          continue
        }

        try {
          const currentStory: ReelStoryRecord = { ...story, characterRefs: refs }
          this.costGuard.assertWithinCap(
            currentStory,
            this.costGuard.estimateCharacterRefAttempt(currentStory, character.id),
          )
        } catch (error) {
          if (toStoryError(error).code !== 'story-budget-exhausted') throw error

          refs = await this.markCharacterRefFailed(
            story,
            refs,
            character.id,
            'story-budget-exhausted',
            nowIso,
            'reel.character-ref.budget-skipped',
          )
          continue
        }

        const attempt: StoredCharacterRef = {
          ...ref,
          attempts: ref.attempts + 1,
          updatedAt: nowIso,
        }
        refs = { ...refs, [character.id]: attempt }
        const stored = await this.repository.updateCharacterRefs(
          story.id,
          refs,
          { statuses: ['GENERATING_KEYFRAMES'], version: story.version, leaseOwner: this.owner },
        )

        // A losing worker must stop: another tick already advanced this story.
        if (!stored) return null

        // The write bumped the version, so the next character in this loop must
        // guard against the new one or its write would be refused as stale.
        story = await this.repository.findById(story.id) ?? story
        refs = this.pruneCharacterRefs(story.characterRefs, targetIds)

        try {
          const created = await orchestrator.submit(
            character,
            story.visualStyle,
            usableUserReferenceUrl(story.referenceUrl),
          )
          submissions.set(character.id, created)
          this.onEvent?.({
            event: 'reel.character-ref.submitted',
            storyId: story.id,
            characterId: character.id,
          })
          waiting = true
        } catch (error) {
          const code = toStoryError(error).code

          if (attempt.attempts >= CHARACTER_REF_MAX_ATTEMPTS) {
            refs = await this.markCharacterRefFailed(
              story,
              refs,
              character.id,
              code,
              nowIso,
            )
          } else {
            // One automatic retry on a later tick; the story still waits.
            waiting = true
          }
        }

        continue
      }

      if (this.characterRefIdleExceeded(ref)) {
        try {
          await orchestrator.cancel(submission)
        } catch {
          // Best effort: the provider may have already dropped the job.
        }

        submissions.delete(character.id)
        refs = await this.markCharacterRefFailed(
          story,
          refs,
          character.id,
          'provider-timeout',
          nowIso,
        )
        continue
      }

      try {
        const result = await orchestrator.poll(
          submission,
          usableUserReferenceUrl(story.referenceUrl),
        )

        if (result.state !== 'COMPLETED') {
          waiting = true
          continue
        }

        const ready: StoredCharacterRef = {
          status: 'ready',
          source: 'generated',
          frontalUrl: result.ref.frontalUrl,
          referenceUrls: result.ref.referenceUrls,
          attempts: ref.attempts,
          updatedAt: nowIso,
        }
        refs = { ...refs, [character.id]: ready }
        const stored = await this.repository.updateCharacterRefs(
          story.id,
          refs,
          { statuses: ['GENERATING_KEYFRAMES'], version: story.version, leaseOwner: this.owner },
        )

        // A losing worker must stop: another tick already advanced this story.
        if (!stored) return null

        story = await this.repository.findById(story.id) ?? story
        refs = this.pruneCharacterRefs(story.characterRefs, targetIds)
        submissions.delete(character.id)
        this.onEvent?.({
          event: 'reel.character-ref.ready',
          storyId: story.id,
          characterId: character.id,
        })
      } catch (error) {
        const storyError = toStoryError(error)

        if (storyError.retryable) {
          waiting = true
          continue
        }

        submissions.delete(character.id)

        if (ref.attempts >= CHARACTER_REF_MAX_ATTEMPTS) {
          refs = await this.markCharacterRefFailed(
            story,
            refs,
            character.id,
            storyError.code,
            nowIso,
          )
        } else {
          // A terminal provider answer still gets the single retry.
          waiting = true
        }
      }
    }

    if (submissions.size === 0) this.characterRefSubmissions.delete(story.id)

    if (waiting || Object.values(refs).some((ref) => ref.status === 'pending')) {
      return null
    }

    return this.repository.findById(story.id)
  }

  private pruneCharacterRefs(
    refs: StoredCharacterRefs,
    targetIds: readonly string[],
  ): StoredCharacterRefs {
    const pruned: Record<string, StoredCharacterRef> = {}

    for (const id of targetIds.slice(0, MAX_CHARACTER_REFS)) {
      const ref = refs[id]

      if (ref !== undefined) pruned[id] = ref
    }

    return pruned
  }

  private characterRefIdleExceeded(ref: StoredCharacterRef): boolean {
    const updatedAt = Date.parse(ref.updatedAt)

    if (!Number.isFinite(updatedAt)) return false

    return this.now() - updatedAt > DEFAULT_CHARACTER_REF_MAX_IDLE_MS
  }

  private async markCharacterRefFailed(
    story: ReelStoryRecord,
    refs: StoredCharacterRefs,
    characterId: string,
    errorCode: string,
    updatedAt: string,
    event = 'reel.character-ref.failed',
  ): Promise<StoredCharacterRefs> {
    const ref = refs[characterId]

    if (ref === undefined) return refs

    const next: StoredCharacterRefs = {
      ...refs,
      [characterId]: { ...ref, status: 'failed', updatedAt },
    }
    await this.repository.updateCharacterRefs(story.id, next)
    this.onEvent?.({ event, storyId: story.id, characterId, errorCode })

    return next
  }

  private clearCharacterRefSubmissions(storyId: string): void {
    this.characterRefSubmissions.delete(storyId)
  }

  /**
   * Best-effort cancellation of reference jobs when the story is cancelled.
   * Called from the thin cancel route; the provider may have already fired.
   */
  async cancelCharacterReferences(storyId: string): Promise<void> {
    const submissions = this.characterRefSubmissions.get(storyId)
    const orchestrator = this.characterReferences

    this.characterRefSubmissions.delete(storyId)

    if (submissions === undefined || orchestrator === null) return

    for (const submission of submissions.values()) {
      try {
        await orchestrator.cancel(submission)
      } catch {
        // Best effort: cancellation must never fail the request.
      }
    }
  }

  /**
   * The first keyframe that shows a character becomes its identity anchor.
   * No extra provider call: the same image is reused by Kontext for the rest
   * of the story, which is what keeps the character consistent.
   */
  private async rememberAnchors(
    story: ReelStoryRecord,
    scene: ReelSceneRecord,
    shot: ReelShotRecord,
    keyframeUrl: string,
  ): Promise<void> {
    // A back view, a wide shot or a detail cannot be somebody's identity anchor:
    // every later frame would try to look like a person whose face is unseen.
    if (!isIdentityFraming(shot.framing)) return

    const characters = scene.scene?.characters ?? []
    const missing = characters.filter((id) => story.anchors[id] === undefined)

    if (missing.length === 0) return

    const anchors: Record<string, string> = { ...story.anchors }

    for (const id of missing) anchors[id] = keyframeUrl

    await this.repository.updateStoryAnchors(story.id, anchors)
  }

  /**
   * Compares a fresh keyframe with the character sheet. Only a confident drift
   * is regenerated once; a second drift leaves the shot for a human, and a
   * doubtful answer costs nothing.
   */
  private async checkConsistency(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
    keyframeUrl: string,
  ): Promise<void> {
    // 012: the reference is the lead character's own image. The sheet is gone
    // from the pipeline, so there is nothing else to compare against.
    const lead = leadCharacterReference(story)

    if (this.consistency === null || lead === null) return

    const reference = lead

    try {
      const result = await this.consistency.check(reference, keyframeUrl, 'front')

      this.onEvent?.({
        event: 'reel.keyframe.consistency',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        errorCode: result.verdict === 'drift' ? 'consistency-drift' : result.verdict,
      })

      if (result.verdict !== 'drift') return

      const attempts = shot.keyframeAttempts

      if (attempts >= 2) {
        await this.repository.updateShot(
          story.id,
          shot.id,
          { statuses: ['KEYFRAME_READY'], version: shot.version },
          { status: 'KEYFRAME_FAILED', keyframeError: 'provider-invalid-output' },
        )
        return
      }

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['KEYFRAME_READY'], version: shot.version },
        {
          status: 'KEYFRAME_QUEUED',
          keyframeUrl: null,
          keyframeRequestId: null,
          keyframeStatusUrl: null,
          keyframeResponseUrl: null,
          keyframeCancelUrl: null,
          keyframeAttempts: attempts + 1,
        },
      )
    } catch {
      // A checker failure must never block the story.
    }
  }

  private async processKeyframeShot(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
    scene: ReelSceneRecord,
  ): Promise<void> {
    if (shot.keyframeRequestId && KEYFRAME_ACTIVE.includes(shot.status)) {
      await this.pollKeyframeShot(story, shot, scene)
      return
    }

    if (shot.status !== 'PENDING' && shot.status !== 'KEYFRAME_QUEUED') return

    if (shot.keyframeAttempts >= 2) {
      // Out of retries with no job in flight. Returning here parks the shot in
      // KEYFRAME_QUEUED forever and the story never finishes; seen in
      // production on 2026-10-24.
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['PENDING', 'KEYFRAME_QUEUED'] },
        { status: 'KEYFRAME_FAILED', keyframeError: 'provider-invalid-output' },
      )
      this.onEvent?.({
        event: 'reel.keyframe.failed',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        errorCode: 'provider-invalid-output',
      })

      return
    }

    // 012: a shot whose action belongs to a secondary character cannot be
    // framed wide, or that character comes out tiny. The rewrite is logged so a
    // surprising frame is explainable instead of mysterious.
    const normalizedFocus = reportFocus(story, shot, scene)

    if (normalizedFocus !== null) {
      this.onEvent?.({
        event: 'reel.shot.focus-normalized',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        from: normalizedFocus.from,
        to: normalizedFocus.to,
      })
    }

    const active = await this.repository.countActiveProviderJobs('keyframe')
    if (active >= this.config.keyframeConcurrency) return

    try {
      this.costGuard.assertWithinCap(story, this.costGuard.estimateKeyframeAttempt(story))
    } catch (error) {
      if (toStoryError(error).code === 'story-budget-exhausted') {
        await this.failShotAndStory(story, shot, 'story-budget-exhausted', 'keyframe')
        return
      }
      throw error
    }

    const incremented = await this.repository.updateShot(
      story.id,
      shot.id,
      { statuses: ['PENDING', 'KEYFRAME_QUEUED'], version: shot.version },
      {
        status: 'KEYFRAME_QUEUED',
        keyframeAttempts: shot.keyframeAttempts + 1,
        keyframeError: null,
      },
    )

    if (incremented === 0) return

    try {
      const submission = await this.keyframes.submit(shot, scene, story)

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['KEYFRAME_QUEUED'] },
        {
          keyframeRequestId: submission.requestId,
          keyframeStatusUrl: submission.statusUrl,
          keyframeResponseUrl: submission.responseUrl,
          keyframeCancelUrl: submission.cancelUrl,
        },
      )

      this.onEvent?.({
        event: 'reel.keyframe.submitted',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
      })
    } catch (error) {
      const code = toStoryError(error).code
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['KEYFRAME_QUEUED'] },
        { status: 'KEYFRAME_FAILED', keyframeError: code },
      )
      this.onEvent?.({
        event: 'reel.keyframe.failed',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        errorCode: code,
      })
    }
  }

  private async pollKeyframeShot(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
    scene: ReelSceneRecord,
  ): Promise<void> {
    if (await this.idleExceeded(story.id, shot.id, this.keyframeMaxIdleMs)) {
      await this.cancelIdleJob(story, shot, 'keyframe')
      return
    }

    try {
      const result = await this.keyframes.poll(shot)

      if (result.state === 'IN_QUEUE') {
        if (shot.status !== 'KEYFRAME_QUEUED') {
          await this.repository.updateShot(
            story.id,
            shot.id,
            { statuses: ['KEYFRAME_RUNNING'] },
            { status: 'KEYFRAME_QUEUED' },
          )
        }
        return
      }

      if (result.state === 'IN_PROGRESS') {
        if (shot.status !== 'KEYFRAME_RUNNING') {
          await this.repository.updateShot(
            story.id,
            shot.id,
            { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
            { status: 'KEYFRAME_RUNNING' },
          )
        }
        return
      }

      // 013: check the image the moment it arrives. Waiting until the video
      // stage means a captured frame sits in the review screen looking fine
      // until the user approves it, and the retry then happens at the worst
      // possible moment.
      {
        const unusable = await this.keyframeUnusableReason(result.keyframeUrl)

        if (unusable !== null && shot.keyframeAttempts >= 2) {
          // Out of retries: keep the last image and say so. Leaving the shot
          // queued would park the story forever, which is worse than a frame
          // the reviewer can see and reject.
          await this.repository.updateShot(
            story.id,
            shot.id,
            { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
            {
              status: 'KEYFRAME_READY',
              keyframeUrl: result.keyframeUrl,
              keyframeError: 'provider-invalid-output',
            },
          )

          this.onEvent?.({
            event: unusable === 'text'
              ? 'reel.keyframe.text-detected'
              : 'reel.keyframe.split-frame',
            storyId: story.id,
            shotId: shot.id,
            order: shot.order,
          })

          return
        }

        if (unusable !== null) {
          await this.repository.updateShot(
            story.id,
            shot.id,
            { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
            {
              status: 'PENDING',
              keyframeUrl: null,
              keyframeRequestId: null,
              keyframeStatusUrl: null,
              keyframeResponseUrl: null,
              keyframeCancelUrl: null,
              keyframeError: null,
            },
          )

          this.onEvent?.({
            event: unusable === 'text'
              ? 'reel.keyframe.text-detected'
              : 'reel.keyframe.split-frame',
            storyId: story.id,
            shotId: shot.id,
            order: shot.order,
          })

          return
        }
      }

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
        { status: 'KEYFRAME_READY', keyframeUrl: result.keyframeUrl, keyframeError: null },
      )
      await this.rememberAnchors(story, scene, shot, result.keyframeUrl)
      await this.checkConsistency(story, shot, result.keyframeUrl)
      this.onEvent?.({
        event: 'reel.keyframe.succeeded',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
      })
    } catch (error) {
      const storyError = toStoryError(error)

      if (storyError.retryable) {
        this.onEvent?.({
          event: 'reel.keyframe.retrying',
          storyId: story.id,
          shotId: shot.id,
          order: shot.order,
          errorCode: storyError.code,
        })
        return
      }

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
        { status: 'KEYFRAME_FAILED', keyframeError: storyError.code },
      )
      this.onEvent?.({
        event: 'reel.keyframe.failed',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        errorCode: storyError.code,
      })
    }
  }

  private async finalizeKeyframes(storyId: string): Promise<void> {
    const story = await this.repository.findById(storyId)

    if (!story || story.status !== 'GENERATING_KEYFRAMES') return

    if (story.shots.every((shot) =>
      shot.status === 'KEYFRAME_READY' || shot.status === 'VIDEO_READY')) {
      const nextStatus = story.approvedAt !== null
        ? 'GENERATING_VIDEOS'
        : 'WAITING_APPROVAL'

      await this.repository.updateStory(
        story.id,
        { statuses: ['GENERATING_KEYFRAMES'], version: story.version },
        { status: nextStatus, ...(nextStatus === 'WAITING_APPROVAL' ? { approvedAt: null } : {}) },
      )
      return
    }

    const hasFailed = story.shots.some((shot) => shot.status === 'KEYFRAME_FAILED')
    const hasActive = story.shots.some((shot) =>
      shot.status === 'PENDING'
      || shot.status === 'KEYFRAME_QUEUED'
      || shot.status === 'KEYFRAME_RUNNING')

    if (hasFailed && !hasActive) {
      await this.failStory(story, 'keyframe-failed', ['GENERATING_KEYFRAMES'])
    }
  }

  private async processVideos(story: ReelStoryRecord): Promise<void> {
    const deadline = this.now() + this.config.tickBudgetMs

    for (const initial of story.shots) {
      if (this.now() > deadline) break

      const fresh = await this.repository.findById(story.id)

      if (!fresh || fresh.status !== 'GENERATING_VIDEOS' || fresh.leaseOwner !== this.owner) {
        return
      }

      const shot = fresh.shots.find((item) => item.id === initial.id)
      const scene = shot === undefined
        ? undefined
        : fresh.scenes.find((item) => item.id === shot.sceneId)

      if (!shot || !scene) continue

      await this.processVideoShot(fresh, shot, scene)
    }

    await this.finalizeVideos(story.id)
  }

  /**
   * 013: two reasons to rebuild a keyframe before paying for the video. Both
   * fail open, and both name themselves in the event so a regeneration is
   * explainable instead of mysterious.
   */
  private async keyframeUnusableReason(
    keyframeUrl: string,
  ): Promise<'split' | 'text' | null> {
    if (this.layoutInspector !== null && await this.layoutInspector.isSplitFrame(keyframeUrl)) {
      return 'split'
    }

    if (this.textInspector !== null && await this.textInspector.hasText(keyframeUrl)) {
      return 'text'
    }

    return null
  }

  private async processVideoShot(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
    scene: ReelSceneRecord,
  ): Promise<void> {
    if (shot.videoRequestId && VIDEO_ACTIVE.includes(shot.status)) {
      await this.pollVideoShot(story, shot)
      return
    }

    if (shot.status !== 'KEYFRAME_READY' && shot.status !== 'VIDEO_QUEUED') return
    if (shot.videoAttempts >= 2 || !shot.keyframeUrl) return

    // A keyframe with several stacked panels would be animated as a split
    // screen, and one with a caption would deliver invented on-screen text.
    // Regenerating the image is cheaper than delivering a broken video.
    const unusable = shot.status === 'KEYFRAME_READY'
      ? await this.keyframeUnusableReason(shot.keyframeUrl)
      : null

    if (unusable !== null) {
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['KEYFRAME_READY'], version: shot.version },
        {
          status: 'KEYFRAME_QUEUED',
          keyframeUrl: null,
          keyframeRequestId: null,
          keyframeStatusUrl: null,
          keyframeResponseUrl: null,
          keyframeCancelUrl: null,
          keyframeError: null,
          videoUrl: null,
          videoRequestId: null,
          videoStatusUrl: null,
          videoResponseUrl: null,
          videoCancelUrl: null,
          videoError: null,
        },
      )

      this.onEvent?.({
        event: unusable === 'text' ? 'reel.keyframe.text-detected' : 'reel.keyframe.split-frame',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
      })

      return
    }

    const active = await this.repository.countActiveProviderJobs('video')
    if (active >= this.config.videoConcurrency) return

    try {
      this.costGuard.assertWithinCap(story, this.costGuard.estimateVideoAttempt(story))
    } catch (error) {
      if (toStoryError(error).code === 'story-budget-exhausted') {
        await this.failShotAndStory(story, shot, 'story-budget-exhausted', 'video')
        return
      }
      throw error
    }

    const incremented = await this.repository.updateShot(
      story.id,
      shot.id,
      { statuses: ['KEYFRAME_READY', 'VIDEO_QUEUED'], version: shot.version },
      {
        status: 'VIDEO_QUEUED',
        videoAttempts: shot.videoAttempts + 1,
        videoError: null,
      },
    )

    if (incremented === 0) return

    try {
      const submission = await this.videos.submit(shot, scene, story)

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['VIDEO_QUEUED'] },
        {
          videoRequestId: submission.requestId,
          videoStatusUrl: submission.statusUrl,
          videoResponseUrl: submission.responseUrl,
          videoCancelUrl: submission.cancelUrl,
        },
      )

      this.onEvent?.({
        event: 'reel.video.submitted',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
      })
    } catch (error) {
      const code = toStoryError(error).code
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['VIDEO_QUEUED'] },
        { status: 'VIDEO_FAILED', videoError: code },
      )
      this.onEvent?.({
        event: 'reel.video.failed',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        errorCode: code,
      })
    }
  }

  private async pollVideoShot(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
  ): Promise<void> {
    if (await this.idleExceeded(story.id, shot.id, this.videoMaxIdleMs)) {
      await this.cancelIdleJob(story, shot, 'video')
      return
    }

    try {
      const result = await this.videos.poll(shot)

      if (result.state === 'IN_QUEUE') {
        if (shot.status !== 'VIDEO_QUEUED') {
          await this.repository.updateShot(
            story.id,
            shot.id,
            { statuses: ['VIDEO_RUNNING'] },
            { status: 'VIDEO_QUEUED' },
          )
        }
        return
      }

      if (result.state === 'IN_PROGRESS') {
        if (shot.status !== 'VIDEO_RUNNING') {
          await this.repository.updateShot(
            story.id,
            shot.id,
            { statuses: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
            { status: 'VIDEO_RUNNING' },
          )
        }
        return
      }

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
        { status: 'VIDEO_READY', videoUrl: result.videoUrl, videoError: null },
      )
      this.onEvent?.({
        event: 'reel.video.succeeded',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
      })
    } catch (error) {
      const storyError = toStoryError(error)

      if (storyError.retryable) {
        this.onEvent?.({
          event: 'reel.video.retrying',
          storyId: story.id,
          shotId: shot.id,
          order: shot.order,
          errorCode: storyError.code,
        })
        return
      }

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
        { status: 'VIDEO_FAILED', videoError: storyError.code },
      )
      this.onEvent?.({
        event: 'reel.video.failed',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        errorCode: storyError.code,
      })
    }
  }

  private async finalizeVideos(storyId: string): Promise<void> {
    const story = await this.repository.findById(storyId)

    if (!story || story.status !== 'GENERATING_VIDEOS') return

    if (story.shots.every((shot) => shot.status === 'VIDEO_READY')) {
      await this.repository.updateStory(
        story.id,
        { statuses: ['GENERATING_VIDEOS'], version: story.version },
        { status: 'VIDEOS_READY', errorCode: null, errorMessage: null },
      )
      return
    }

    const hasFailed = story.shots.some((shot) => shot.status === 'VIDEO_FAILED')
    const hasActive = story.shots.some((shot) =>
      shot.status === 'KEYFRAME_READY'
      || shot.status === 'VIDEO_QUEUED'
      || shot.status === 'VIDEO_RUNNING')

    if (hasFailed && !hasActive) {
      await this.failStory(story, 'video-failed', ['GENERATING_VIDEOS'])
    }
  }

  private async processQc(story: ReelStoryRecord): Promise<void> {
    if (this.qcInFlight) return

    const service = this.qcService

    if (!service) {
      await this.failStory(story, 'ffmpeg-not-configured', ['VIDEOS_READY', 'QC'])
      return
    }

    let fresh = await this.repository.findById(story.id)

    if (!fresh || fresh.leaseOwner !== this.owner) return

    if (!fresh.shots.every((shot) => shot.videoUrl !== null
      && (shot.status === 'VIDEO_READY' || shot.status === 'VIDEO_FAILED'))) {
      await this.failStory(fresh, 'video-failed', ['VIDEOS_READY', 'QC'])
      return
    }

    if (fresh.status === 'VIDEOS_READY') {
      const started = await this.repository.updateStory(
        fresh.id,
        { statuses: ['VIDEOS_READY'], version: fresh.version },
        { status: 'QC', errorCode: null, errorMessage: null },
      )
      if (started === 0) return
      const reloaded = await this.repository.findById(fresh.id)
      if (!reloaded || reloaded.status !== 'QC' || reloaded.leaseOwner !== this.owner) return
      fresh = reloaded
    }

    this.qcInFlight = true

    try {
      const clips = fresh.shots
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((shot) => ({ shotId: shot.id, url: shot.videoUrl ?? '' }))
      const result = await service.run({ story: fresh, clips })

      for (const failure of result.technicalFailures) {
        await this.repository.updateShot(
          fresh.id,
          failure.shotId,
          { statuses: ['VIDEO_READY'] },
          { status: 'VIDEO_FAILED', videoError: 'provider-invalid-output' },
        )
      }

      if (
        result.technicalFailures.length === 0
        && (result.qc.status === 'PASSED' || this.technicalOnlyPass(result.qc))
      ) {
        const applied = await this.repository.updateStory(
          fresh.id,
          { statuses: ['QC'], version: fresh.version },
          {
            status: 'ASSEMBLING',
            qc: result.qc,
            qcCheckedAt: new Date(result.qc.checkedAt),
            errorCode: null,
            errorMessage: null,
          },
        )
        if (applied === 0) return
        const assembling = await this.repository.findById(fresh.id)
        if (assembling && assembling.status === 'ASSEMBLING') {
          await this.processAssembly(assembling, true)
        }
        return
      }

      await this.repository.updateStory(
        fresh.id,
        { statuses: ['QC'], version: fresh.version },
        {
          status: 'WAITING_QC',
          qc: result.qc,
          qcCheckedAt: new Date(result.qc.checkedAt),
          errorCode: null,
          errorMessage: null,
        },
      )
    } catch (error) {
      if (toStoryError(error).code === 'ffmpeg-not-configured') {
        await this.failStory(fresh, 'ffmpeg-not-configured', ['QC'])
        return
      }
      this.onEvent?.({
        event: 'reel.qc.error',
        storyId: fresh.id,
        errorCode: toStoryError(error).code,
      })
    } finally {
      this.qcInFlight = false
    }
  }

  private async processAssembly(
    story: ReelStoryRecord,
    alreadyAssembling: boolean,
  ): Promise<void> {
    if (this.assemblyInFlight) return

    const fresh = await this.repository.findById(story.id)

    if (!fresh || fresh.leaseOwner !== this.owner) return

    if (!fresh.shots.every((shot) => shot.status === 'VIDEO_READY' && shot.videoUrl !== null)) {
      await this.failStory(
        fresh,
        'assembly-failed',
        alreadyAssembling ? ['ASSEMBLING'] : ['VIDEOS_READY'],
      )
      return
    }

    if (fresh.finalVideoUrl) {
      await this.repository.updateStory(
        fresh.id,
        { statuses: ['ASSEMBLING'], version: fresh.version },
        {
          status: 'READY',
          completedAt: fresh.completedAt ?? new Date(this.now()),
          errorCode: null,
          errorMessage: null,
        },
      )
      return
    }

    if (!alreadyAssembling) {
      const started = await this.repository.updateStory(
        fresh.id,
        { statuses: ['VIDEOS_READY'], version: fresh.version },
        { status: 'ASSEMBLING', errorCode: null, errorMessage: null },
      )
      if (started === 0) return
    }

    const assembling = await this.repository.findById(story.id)
    if (!assembling || assembling.status !== 'ASSEMBLING') return

    this.assemblyInFlight = true

    try {
      const clips = assembling.shots
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((shot) => ({
          order: shot.order,
          url: shot.videoUrl ?? '',
          durationSeconds: shot.durationSeconds,
        }))
      const planned = clips.reduce((total, clip) => total + clip.durationSeconds, 0)

      if (planned !== assembling.plannedDurationSeconds
        || planned > assembling.maxDurationSeconds) {
        throw new StoryError('assembly-failed')
      }

      this.onEvent?.({ event: 'reel.assembly.start', storyId: assembling.id })
      const result = await this.assembler.assemble({
        storyId: assembling.id,
        clips,
        plannedDurationSeconds: assembling.plannedDurationSeconds,
        maxDurationSeconds: assembling.maxDurationSeconds,
      })
      const safeUrl = assertFalMediaUrl(result.fileUrl)

      await this.repository.updateStory(
        assembling.id,
        { statuses: ['ASSEMBLING'], version: assembling.version },
        {
          status: 'READY',
          finalVideoUrl: safeUrl,
          finalVideoExpiresAt: new Date(result.expiresAt),
          finalDurationSeconds: result.durationSeconds,
          completedAt: new Date(this.now()),
          errorCode: null,
          errorMessage: null,
        },
      )
      this.onEvent?.({ event: 'reel.assembly.ok', storyId: assembling.id })
    } catch (error) {
      const code = toStoryError(error).code
      await this.failStory(
        assembling,
        code === 'ffmpeg-not-configured'
          ? 'ffmpeg-not-configured'
          : code === 'assembly-timeout'
            ? 'assembly-timeout'
            : 'assembly-failed',
        ['ASSEMBLING'],
      )
    } finally {
      this.assemblyInFlight = false
    }
  }

  /**
   * Milliseconds since the shot row last changed state. Used to bound a
   * provider job that never reports a terminal state.
   */
  private async idleExceeded(
    storyId: string,
    shotId: string,
    maxIdleMs: number,
  ): Promise<boolean> {
    const idleMs = await this.repository.shotIdleMs(storyId, shotId, this.now())

    return idleMs !== null && idleMs > maxIdleMs
  }

  /**
   * The job stopped progressing: cancel it best-effort so Fal stops billing and
   * fail the shot with a stable code instead of leaving the story generating.
   */
  private async cancelIdleJob(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
    stage: 'keyframe' | 'video',
  ): Promise<void> {
    try {
      if (stage === 'keyframe') {
        await this.keyframes.cancel(shot)
      } else {
        await this.videos.cancel(shot)
      }
    } catch {
      // Best effort: the provider may have already dropped the job.
    }

    await this.failShotAndStory(story, shot, 'provider-timeout', stage)
    this.onEvent?.({
      event: stage === 'keyframe' ? 'reel.keyframe.failed' : 'reel.video.failed',
      storyId: story.id,
      shotId: shot.id,
      order: shot.order,
      errorCode: 'provider-timeout',
    })
  }

  private async failShotAndStory(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
    code: StoryErrorCode,
    stage: 'keyframe' | 'video',
  ): Promise<void> {
    this.clearCharacterRefSubmissions(story.id)
    await this.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      stage === 'keyframe'
        ? { status: 'KEYFRAME_FAILED', keyframeError: code }
        : { status: 'VIDEO_FAILED', videoError: code },
    )
    await this.repository.updateStory(
      story.id,
      { statuses: [story.status], version: story.version },
      { status: 'FAILED', errorCode: code, errorMessage: null },
    )
  }

  private async failStory(
    story: ReelStoryRecord,
    code: StoryErrorCode,
    statuses: readonly ReelStoryRecord['status'][],
  ): Promise<void> {
    this.clearCharacterRefSubmissions(story.id)
    await this.repository.updateStory(
      story.id,
      { statuses, version: story.version },
      { status: 'FAILED', errorCode: code, errorMessage: null },
    )
  }
}

export function createReelStoryReconciler(
  options: ReelReconcilerOptions,
): ReelStoryReconciler {
  return new ReelStoryReconciler(options)
}

/**
 * 012: the identity reference of the lead character. Used by the consistency
 * check, which compares keyframes against the picture we actually sent.
 */
function leadCharacterReference(story: ReelStoryRecord): string | null {
  const leadId = story.plan.storyBible?.leadCharacterId ?? null
  const refs = story.characterRefs

  if (leadId === null || refs === null || refs === undefined) return null

  const lead = refs[leadId]

  return lead !== undefined && lead.status === 'ready' ? lead.frontalUrl : null
}

/**
 * 012 observability: the framing actually used is decided by the focus rule, so
 * the plan's framing and the sent framing are both logged when they differ.
 */
function reportFocus(
  story: ReelStoryRecord,
  shot: ReelShotRecord,
  scene: ReelSceneRecord,
): { readonly from: string; readonly to: string } | null {
  const beat = storyBeatForShot(shot, scene)
  const focus = resolveFocus(beat.subject, story.plan.storyBible)
  const normalized = normalizeFocusFraming(
    beat.framing,
    focus,
    story.plan.storyBible?.leadCharacterId ?? null,
  )

  return normalized.normalized ? { from: shot.framing, to: normalized.framing } : null
}