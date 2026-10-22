import { describe, expect, it } from 'vitest'
import type { ReelShotRecord, ReelStoryRecord } from '../../../server/story/reel-repository'
import type {
  QCSceneExpectation,
  QCFrameStrip,
  StoryFrameExtractor,
  StoryQCEvaluator,
} from '../../../server/story/qc-types'
import { createShotQCService } from '../../../server/story/shot-qc-service'
import { createReelCostGuard } from '../../../server/story/reel-cost'
import { DEFAULT_STORY_COST_CONFIG } from '../../../server/story/cost'
import {
  hammingDistance,
  shotFrameTimestamps,
  verifyClipTechnical,
} from '../../../server/story/qc-frames'
import { makeReelNarrative, makeReelShotList } from '../../helpers/reel-fixtures'
import { FakeReelStoryRepository } from '../../helpers/story-reel'

const NOW = Date.parse('2026-10-22T12:00:00.000Z')

async function story(): Promise<ReelStoryRecord> {
  const fixture = makeReelNarrative('standard', 30, false)
  const shotList = makeReelShotList(fixture.narrative, fixture.plan)
  const repository = new FakeReelStoryRepository()
  const record = await repository.createStory({
    sessionId: 'qc-session',
    status: 'QC',
    premise: fixture.canon.logline,
    title: fixture.canon.title,
    logline: fixture.canon.logline,
    referenceUrl: null,
    referenceExpiresAt: null,
    preset: 'fast',
    mode: 'faithful',
    platform: 'tiktok',
    costMode: 'standard',
    targetDurationSeconds: 30,
    maxDurationSeconds: 30,
    plan: fixture.narrative,
    shotPlan: shotList,
    idempotencyKey: null,
    now: new Date(NOW),
    expiresAt: new Date(NOW + 86_400_000),
  })

  return {
    ...record,
    shots: record.shots.map((shot) => ({
      ...shot,
      status: 'VIDEO_READY',
      videoUrl: `https://v3.fal.media/files/test/video-${shot.order}.mp4`,
    })),
  }
}

class FakeExtractor implements StoryFrameExtractor {
  readonly inputs: Parameters<StoryFrameExtractor['extract']>[0][] = []
  technicalFor: string | null = null
  technicalCode: 'technical-duration' | 'technical-streams' = 'technical-duration'

  async extract(input: Parameters<StoryFrameExtractor['extract']>[0]): Promise<readonly QCFrameStrip[]> {
    this.inputs.push(input)

    return input.clips.map((clip) => ({
      sceneId: clip.sceneId,
      order: clip.order,
      filePath: '',
      durationSeconds: 6,
      technical: this.technicalFor === clip.sceneId
        ? [this.technicalCode]
        : [],
      framesUrl: `https://v3.fal.media/files/test/qc-${clip.order}.jpg`,
      dHash: '0000000000000000',
    }))
  }
}

class FakeEvaluator implements StoryQCEvaluator {
  readonly evaluations: QCSceneExpectation[] = []

  async evaluate(input: Parameters<StoryQCEvaluator['evaluate']>[0]) {
    this.evaluations.push(input.expectation)

    return {
      kind: 'observed' as const,
      confidence: 0.95,
      observed: {
        characters: input.expectation.characters,
        wardrobeMismatch: [],
        unknownCharacters: false,
        props: input.expectation.props,
        unknownProps: false,
        locationMatches: true,
        weatherMatches: true,
        timeOfDayMatches: true,
        continuityMatches: true,
        textOrWatermark: false,
        artifacts: false,
      },
    }
  }
}

function setup(record: ReelStoryRecord, enabled = true) {
  const extractor = new FakeExtractor()
  const evaluator = new FakeEvaluator()
  const service = createShotQCService({
    frameExtractor: extractor,
    evaluator,
    costGuard: createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG }),
    config: { enabled, minConfidence: 0.7, timeoutMs: 30_000 },
    now: () => NOW,
  })

  return { extractor, evaluator, service }
}

function clips(record: ReelStoryRecord) {
  return record.shots.map((shot) => ({
    shotId: shot.id,
    url: shot.videoUrl ?? '',
  }))
}

describe('shot QC', () => {
  it('uses two frames, emits shot-attributed issues and dHash variety advisories', async () => {
    const record = await story()
    const ctx = setup(record)
    const result = await ctx.service.run({ story: record, clips: clips(record) })

    expect(ctx.extractor.inputs[0]?.frameCount).toBe(2)
    expect(ctx.extractor.inputs[0]?.hash).toBe(true)
    expect(result.qc.status).toBe('PASSED')
    expect(result.qc.shots).toHaveLength(12)
    expect(result.qc.shots.every((shot) =>
      shot.shotId.length > 0 && shot.issues.every((issue) => issue.shotId === shot.shotId)))
      .toBe(true)
    expect(result.qc.variety?.pairs.every((pair) => pair.similar)).toBe(true)
    expect(result.qc.issues.some((issue) => issue.code === 'similar-shots'))
      .toBe(true)
    expect(result.qc.issues.find((issue) => issue.code === 'similar-shots')?.severity)
      .toBe('warning')
  })

  it('returns UNAVAILABLE when QC is disabled', async () => {
    const record = await story()
    const ctx = setup(record, false)
    const result = await ctx.service.run({ story: record, clips: clips(record) })

    expect(result.qc.status).toBe('UNAVAILABLE')
    expect(result.qc.errorCode).toBe('qc-disabled')
    expect(ctx.evaluator.evaluations).toHaveLength(0)
    expect(ctx.extractor.inputs).toHaveLength(1)
    expect(ctx.extractor.inputs[0]?.frameCount).toBe(2)
    expect(ctx.extractor.inputs[0]?.hash).toBe(false)
  })

  it('still fails technical QC when vision is disabled', async () => {
    const record = await story()
    const ctx = setup(record, false)
    ctx.extractor.technicalFor = record.shots[1]?.id ?? ''
    ctx.extractor.technicalCode = 'technical-streams'

    const result = await ctx.service.run({ story: record, clips: clips(record) })

    expect(result.qc.status).toBe('FAILED')
    expect(result.qc.status).not.toBe('PASSED')
    expect(result.technicalFailures).toHaveLength(1)
    expect(result.technicalFailures[0]?.shotId).toBe(record.shots[1]?.id)
    expect(result.qc.issues).toContainEqual(expect.objectContaining({
      code: 'technical-streams',
      severity: 'blocking',
      shotId: record.shots[1]?.id,
    }))
    expect(ctx.evaluator.evaluations).toHaveLength(0)
  })

  it('skips vision with qc-budget-skipped and never reports a false PASS', async () => {
    const record = await story()
    const costly: ReelStoryRecord = {
      ...record,
      shots: record.shots.map((shot) => ({
        ...shot,
        keyframeAttempts: 2,
        videoAttempts: 2,
      })),
    }
    const ctx = setup(costly, true)
    const result = await ctx.service.run({ story: costly, clips: clips(costly) })

    expect(result.qc.status).not.toBe('PASSED')
    expect(result.qc.status).toBe('UNAVAILABLE')
    expect(result.qc.errorCode).toBe('qc-budget-skipped')
    expect(result.qc.evaluator).toBe('none')
    expect(ctx.evaluator.evaluations).toHaveLength(0)
  })

  it('fails honestly when a clip is technically broken', async () => {
    const record = await story()
    const ctx = setup(record)
    ctx.extractor.technicalFor = record.shots[2]?.id ?? ''

    const result = await ctx.service.run({ story: record, clips: clips(record) })

    expect(result.qc.status).toBe('FAILED')
    expect(result.technicalFailures).toHaveLength(1)
    expect(result.technicalFailures[0]?.shotId).toBe(record.shots[2]?.id)
    expect(result.qc.shots[2]?.issues.some((issue) =>
      issue.code === 'technical-duration' && issue.severity === 'blocking'))
      .toBe(true)
  })

  it('checks provider clip duration as 6±0.5 fast and 5±0.5 quality', () => {
    const streams = [{
      codec_type: 'video' as const,
      codec_name: 'h264',
      width: 720,
      height: 1280,
    }]

    expect(verifyClipTechnical({
      streams,
      durationSeconds: 6,
      expectedDurationSeconds: 6,
    })).toEqual([])
    expect(verifyClipTechnical({
      streams,
      durationSeconds: 5,
      expectedDurationSeconds: 5,
    })).toEqual([])
    expect(verifyClipTechnical({
      streams,
      durationSeconds: 5,
      expectedDurationSeconds: 6,
    })).toContain('technical-duration')
    expect(verifyClipTechnical({
      streams,
      durationSeconds: 6,
      expectedDurationSeconds: 5,
    })).toContain('technical-duration')
  })

  it('computes two-frame timestamps and dHash distance', () => {
    expect(shotFrameTimestamps(2)).toEqual([1])
    expect(shotFrameTimestamps(6)).toEqual([1.2, 4.8])
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0)
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1)
  })
})
