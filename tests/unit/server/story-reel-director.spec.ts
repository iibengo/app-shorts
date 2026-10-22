import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type {
  StoryCostMode,
  StoryDurationSeconds,
} from '~/models/story'
import { createDeepSeekClient } from '../../../server/story/deepseek-client'
import { createReelStoryDirector } from '../../../server/story/reel-director'
import { createReelNarrativeDirector } from '../../../server/story/reel-narrative-director'
import { createReelShotDirector } from '../../../server/story/reel-shot-director'
import { StoryError } from '../../../server/story/errors'
import { durationPlanFor } from '../../../server/story/cost-profiles'
import {
  makeReelNarrative,
  makeReelShotList,
} from '../../helpers/reel-fixtures'
import { startDeepSeekStub } from '../../helpers/deepseek-stub'

const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'
const KEY = 'test-deepseek-key'
const stub = await startDeepSeekStub()

afterAll(async () => {
  await stub.close()
})

beforeEach(() => {
  stub.reset()
})

const PROFILES: readonly (readonly [StoryCostMode, StoryDurationSeconds, boolean])[] = [
  ['budget', 15, true],
  ['budget', 15, false],
  ['standard', 15, false],
  ['standard', 30, false],
  ['standard', 45, false],
  ['standard', 60, false],
  ['budget', 90, false],
  ['production', 90, false],
]

function director() {
  const client = createDeepSeekClient({ apiKey: KEY, baseUrl: stub.baseUrl })

  return createReelStoryDirector({
    narrative: createReelNarrativeDirector({
      client,
      canonTimeoutMs: 2_000,
      scenesTimeoutMs: 2_000,
    }),
    shots: createReelShotDirector({
      client,
      timeoutMs: 2_000,
    }),
    totalTimeoutMs: 5_000,
  })
}

function queueFixture(
  costMode: StoryCostMode,
  duration: StoryDurationSeconds,
  hasReference: boolean,
): ReturnType<typeof makeReelNarrative> {
  const fixture = makeReelNarrative(costMode, duration, hasReference)
  const shotList = makeReelShotList(fixture.narrative, fixture.plan)

  stub.state.contents = [
    fixture.canon,
    { scenes: fixture.narrative.scenes },
    shotList,
  ]

  return fixture
}

describe('NativeReelStoryDirector', () => {
  for (const [costMode, duration, hasReference] of PROFILES) {
    it(`creates a real 008 plan for ${costMode} ${duration}${hasReference ? ' + reference' : ''}`, async () => {
      const fixture = queueFixture(costMode, duration, hasReference)
      const reel = await director().createPlan({
        premise: PREMISE,
        mode: 'faithful',
        durationPlan: fixture.plan,
        referenceUrl: hasReference
          ? 'https://v3.fal.media/files/test/reference.webp'
          : null,
      })
      const shots = reel.shotPlan.scenes.flatMap((scene) => scene.shots)

      expect(stub.requests).toHaveLength(3)
      expect(reel.plan.scenes).toEqual(fixture.narrative.scenes)
      expect(reel.plan.storyBible).toEqual(fixture.canon.storyBible)
      expect(reel.plan.title).toBe(fixture.canon.title)
      expect(shots).toHaveLength(fixture.plan.exactShotCount ?? fixture.plan.shotCount.max)
      expect(reel.shotPlan.plannedDurationSeconds).toBe(duration)
      expect(shots.every((shot) => shot.durationSeconds >= 2 && shot.durationSeconds <= 6))
        .toBe(true)
      expect(shots.every((shot) => shot.transition === 'cut')).toBe(true)
    })
  }

  it('sends separate canon, scenes and shots prompts', async () => {
    const fixture = queueFixture('standard', 30, false)
    await director().createPlan({
      premise: PREMISE,
      mode: 'faithful',
      durationPlan: fixture.plan,
      referenceUrl: null,
    })

    const systems = stub.requests.map((request) => {
      const body = request.body as {
        readonly messages: readonly { readonly role: string; readonly content: unknown }[]
      }

      return body.messages[0]?.content
    })

    expect(systems[0]).toContain('Primera etapa')
    expect(systems[1]).toContain('Segunda etapa')
    expect(systems[2]).toContain('director de planos')
    expect(String(systems[0])).not.toContain('director de planos')
    expect(String(systems[1])).not.toContain('director de planos')
  })

  it('does not call the shot director when the narrative fails', async () => {
    stub.state.contents = [
      { title: '', logline: '', tone: 'humor', storyBible: {} },
      { title: '', logline: '', tone: 'humor', storyBible: {} },
    ]

    await expect(director().createPlan({
      premise: PREMISE,
      mode: 'faithful',
      durationPlan: durationPlanFor('standard', 30, 'tiktok', false),
      referenceUrl: null,
    })).rejects.toMatchObject({ code: 'director-invalid-output' })

    expect(stub.requests).toHaveLength(2)
    expect(stub.requests[1]?.body).not.toMatchObject({
      messages: [{ content: expect.stringContaining('director de planos') }],
    })
  })

  it('repairs one invalid scenes response', async () => {
    const fixture = makeReelNarrative('standard', 30, false)
    const shotList = makeReelShotList(fixture.narrative, fixture.plan)
    stub.state.contents = [
      fixture.canon,
      { scenes: [] },
      { scenes: fixture.narrative.scenes },
      shotList,
    ]

    const reel = await director().createPlan({
      premise: PREMISE,
      mode: 'faithful',
      durationPlan: fixture.plan,
      referenceUrl: null,
    })

    expect(stub.requests).toHaveLength(4)
    expect(reel.plan.scenes).toEqual(fixture.narrative.scenes)
  })

  it('repairs one truncated shots response', async () => {
    const fixture = makeReelNarrative('standard', 30, false)
    const shotList = makeReelShotList(fixture.narrative, fixture.plan)
    stub.state.contents = [
      fixture.canon,
      { scenes: fixture.narrative.scenes },
      shotList,
      shotList,
    ]
    stub.state.finishReasons = ['stop', 'stop', 'length', 'stop']

    const reel = await director().createPlan({
      premise: PREMISE,
      mode: 'faithful',
      durationPlan: fixture.plan,
      referenceUrl: null,
    })

    expect(stub.requests).toHaveLength(4)
    expect(reel.plan.scenes).toEqual(fixture.narrative.scenes)
    const repair = stub.requests[3]?.body as {
      readonly messages: readonly { readonly content: string }[]
    }
    expect(repair.messages.some((message) => message.content.includes('se truncó')))
      .toBe(true)
  })

  it('fails after two invalid shot responses without inventing a plan', async () => {
    const fixture = makeReelNarrative('standard', 30, false)
    stub.state.contents = [
      fixture.canon,
      { scenes: fixture.narrative.scenes },
      { scenes: [] },
      { scenes: [] },
    ]

    await expect(director().createPlan({
      premise: PREMISE,
      mode: 'faithful',
      durationPlan: fixture.plan,
      referenceUrl: null,
    })).rejects.toBeInstanceOf(StoryError)

    expect(stub.requests).toHaveLength(4)
  })
})
