// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoryPlan, StoryQCObserved } from '~/models/story'
import { createStoryCostGuard } from '../../server/story/cost'
import { NativeStoryQCService } from '../../server/story/qc-service'
import type { QCFrameStrip, StoryFrameExtractor } from '../../server/story/qc-types'
import { makeScenes, makeStoryRecord } from '../helpers/story'
import creative from '../fixtures/story/plan-creative-scene-changes.json'

const OBSERVED: StoryQCObserved = {
  characters: ['clara'],
  wardrobeMismatch: [],
  unknownCharacters: false,
  props: ['merengue'],
  unknownProps: false,
  locationMatches: true,
  weatherMatches: true,
  timeOfDayMatches: true,
  continuityMatches: true,
  textOrWatermark: false,
  artifacts: false,
}

function storyFor(plan: StoryPlan) {
  return makeStoryRecord({
    status: 'QC',
    sceneCount: 5,
    plan,
    scenes: makeScenes(5, {
      status: 'VIDEO_READY',
      keyframeAttempts: 1,
      videoAttempts: 1,
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
    }),
    approvedAt: new Date(),
  })
}

function strips(story: ReturnType<typeof storyFor>): QCFrameStrip[] {
  return story.scenes.map((scene) => ({
    sceneId: scene.id,
    order: scene.order,
    filePath: `/tmp/strip-${scene.order}.jpg`,
    durationSeconds: 6,
    technical: [],
    framesUrl: `https://v3.fal.media/files/test/story-qc-${scene.order}.jpg`,
  }))
}

function extractor(result: readonly QCFrameStrip[]): StoryFrameExtractor {
  return {
    async extract() {
      return result
    },
  }
}



describe('QC acceptance with multi-scene context', () => {
  it('uses the declared location, time and weather for each scene', async () => {
    const plan = structuredClone(creative) as StoryPlan
    const story = storyFor(plan)
    const seen: string[] = []
    const qc = new NativeStoryQCService({
      frameExtractor: extractor(strips(story)),
      evaluator: {
        async evaluate(input) {
          seen.push(`${input.expectation.locationId}:${input.expectation.timeOfDay}:${input.expectation.weather}`)

          return {
            kind: 'observed',
            observed: {
              ...OBSERVED,
              characters: [...input.expectation.characters],
              props: [...input.expectation.props],
            },
            confidence: 0.94,
          }
        },
      },
      costGuard: createStoryCostGuard(),
      config: { enabled: true, minConfidence: 0.7, timeoutMs: 240_000 },
    })

    const result = await qc.run({
      story,
      clips: story.scenes.map((scene) => ({
        sceneId: scene.id,
        order: scene.order,
        url: scene.videoUrl!,
      })),
    })

    expect(result.qc.status).toBe('PASSED')
    expect(new Set(seen.map((value) => value.split(':')[0])).size).toBeGreaterThan(1)
    expect(result.qc.issues.some((issue) => issue.code === 'wrong-location')).toBe(false)
    expect(result.qc.issues.some((issue) => issue.code === 'wrong-time-of-day')).toBe(false)
    expect(result.qc.issues.some((issue) => issue.code === 'wrong-weather')).toBe(false)
  })

  it('does not require lead or signature prop when the scene does not declare them', async () => {
    const plan = structuredClone(creative) as StoryPlan
    plan.beats[2] = {
      ...plan.beats[2]!,
      characters: ['milo'],
      props: [],
    }
    const story = storyFor(plan)
    const qc = new NativeStoryQCService({
      frameExtractor: extractor(strips(story)),
      evaluator: {
        async evaluate(input) {
          return {
            kind: 'observed',
            observed: {
              ...OBSERVED,
              characters: [...input.expectation.characters],
              props: [...input.expectation.props],
            },
            confidence: 0.94,
          }
        },
      },
      costGuard: createStoryCostGuard(),
      config: { enabled: true, minConfidence: 0.7, timeoutMs: 240_000 },
    })

    const result = await qc.run({
      story,
      clips: story.scenes.map((scene) => ({
        sceneId: scene.id,
        order: scene.order,
        url: scene.videoUrl!,
      })),
    })
    const sceneIssues = result.qc.issues.filter((issue) => issue.order === 3)

    expect(sceneIssues.some((issue) => issue.code === 'missing-lead-character')).toBe(false)
    expect(sceneIssues.some((issue) => issue.code === 'missing-prop')).toBe(false)
  })
})
