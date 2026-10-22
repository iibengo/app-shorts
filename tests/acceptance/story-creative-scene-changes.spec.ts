// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryBible, StoryPlan } from '~/models/story'
import {
  STORY_VIDEO_PROMPT_MAX_LENGTH,
  composeKeyframe,
  composeVideo,
  storyBeatForScene,
} from '../../server/story/story-prompt-composer'
import { compareScene } from '../../server/story/qc-checker'
import { storyQcUserPrompt } from '../../server/story/qc-prompt'
import type { QCSceneExpectation } from '../../server/story/qc-types'
import {
  FakeStoryDirector,
  FakeStoryRepository,
} from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'
import creative from '../fixtures/story/plan-creative-scene-changes.json'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: createStory } = await import('../../../server/api/story/index.post')

const PREMISE = 'Clara persigue un merengue imposible desde el parque hasta un despacho.'

function changingPlan(): StoryPlan {
  const plan = structuredClone(creative) as StoryPlan
  const bible = plan.storyBible!
  const obrador = bible.locations.find((location) => location.id === 'obrador')!
  const parque = bible.locations.find((location) => location.id === 'parque')!
  const calle = bible.locations.find((location) => location.id === 'calle')!

  plan.storyBible = {
    ...bible,
    locations: [
      obrador,
      parque,
      {
        ...calle,
        id: 'despacho',
        name: 'Despacho',
        description: 'Oficina pequeña con escritorio de madera y estanterías.',
      },
    ],
  }
  plan.beats = plan.beats.map((beat) => {
    if (beat.order === 3 || beat.order === 4) return { ...beat, locationId: 'parque' }
    if (beat.order === 5) return { ...beat, locationId: 'despacho' }

    return beat
  })

  return plan
}

function body() {
  return {
    premise: PREMISE,
    sceneCount: 5,
    preset: 'fast',
    mode: 'creative',
    referenceUrl: null,
    referenceExpiresAt: null,
  }
}

async function createCreative() {
  const director = new FakeStoryDirector(changingPlan())
  const runtime = makeStoryRuntime({ director })
  const repository = runtime.repository as FakeStoryRepository
  const response = await callStoryRoute(createStory, {
    method: 'POST',
    path: '/api/story',
    runtime,
    body: body(),
  })

  return { response, repository }
}

function expectationFor(plan: StoryPlan, order: number): QCSceneExpectation {
  const bible = plan.storyBible!
  const beat = storyBeatForScene(plan, {
    order,
    visualPrompt: '',
    narration: '',
  }, plan.beats.length)!
  const location = bible.locations.find((item) => item.id === beat.locationId)!

  return {
    sceneId: `scene-${order}`,
    order,
    sceneRole: beat.sceneRole,
    locationId: location.id,
    locationName: location.name,
    locationDescription: location.description,
    timeOfDay: beat.timeOfDay,
    weather: beat.weather,
    characters: beat.characters,
    props: beat.props,
    leadCharacterId: bible.leadCharacterId,
    signaturePropId: bible.signaturePropId,
    action: beat.action,
    visualPrompt: beat.visualPrompt,
    continuityFromPrevious: beat.continuityFromPrevious,
    camera: beat.camera,
  }
}

describe('creative story with scene changes', () => {
  it('creates a creative story with three locations and park-to-office changes', async () => {
    const { response, repository } = await createCreative()
    const story = response.body as {
      readonly mode: string
      readonly plan: StoryPlan
    }

    expect(response.status).toBe(201)
    expect(story.mode).toBe('creative')
    expect(story.plan.storyBible?.locations).toHaveLength(3)
    expect(story.plan.beats[2]?.locationId).toBe('parque')
    expect(story.plan.beats[4]?.locationId).toBe('despacho')
    expect(repository.records).toHaveLength(1)
  })

  it('composes one keyframe prompt per scene with that scene location', async () => {
    const { response } = await createCreative()
    const plan = (response.body as { readonly plan: StoryPlan }).plan
    const bible = plan.storyBible as StoryBible
    const keyframes = plan.beats.map((beat) => composeKeyframe({
      bible,
      beat,
      hasReference: false,
    }).prompt)

    expect(keyframes[2]).toContain('Parque')
    expect(keyframes[4]).toContain('Despacho')
    expect(keyframes[2]).not.toContain('Localización: Obrador de Clara')
  })

  it('keeps the video prompt under 2000 for every scene', async () => {
    const { response } = await createCreative()
    const plan = (response.body as { readonly plan: StoryPlan }).plan

    for (const beat of plan.beats) {
      const video = composeVideo({
        bible: plan.storyBible,
        beat,
        preset: 'fast',
      })

      expect(video.prompt.length).toBeLessThanOrEqual(STORY_VIDEO_PROMPT_MAX_LENGTH)
    }
  })

  it('does not flag a declared park-to-office change in QC', async () => {
    const { response } = await createCreative()
    const plan = (response.body as { readonly plan: StoryPlan }).plan
    const expectation = expectationFor(plan, 5)
    const observed = {
      characters: [...expectation.characters],
      wardrobeMismatch: [],
      unknownCharacters: false,
      props: [...expectation.props],
      unknownProps: false,
      locationMatches: true,
      weatherMatches: true,
      timeOfDayMatches: true,
      continuityMatches: true,
      textOrWatermark: false,
      artifacts: false,
    }

    const issues = compareScene({
      expectation,
      observed,
      framesAvailable: true,
    })

    expect(issues.map((entry) => entry.code)).not.toContain('wrong-location')
    expect(issues.map((entry) => entry.code)).not.toContain('wrong-time-of-day')
    expect(issues.map((entry) => entry.code)).not.toContain('wrong-weather')
    expect(storyQcUserPrompt({
      bible: plan.storyBible!,
      expectation,
      previous: null,
    })).toContain('Localización: Despacho')
  })
})
