// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryPlan } from '~/models/story'
import { normalizeLegacyPlan } from '../../server/story/legacy-plan'
import {
  FakeStoryDirector,
  FakeStoryRepository,
  SESSION_ID,
  makeStoryRecord,
} from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'
import legacy from '../fixtures/story/plan-006-legacy.json'
import creative from '../fixtures/story/plan-creative-scene-changes.json'
import plan5 from '../fixtures/deepseek/deepseek-plan-5.json'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: getStory } = await import('../../../server/api/story/[id].get')
const { default: createStory } = await import('../../../server/api/story/index.post')

const PREMISE = 'Una repostera descubre que sus postres pueden predecir el futuro.'

function createBody(mode: 'faithful' | 'creative') {
  return {
    premise: PREMISE,
    sceneCount: 5,
    preset: 'fast',
    mode,
    referenceUrl: null,
    referenceExpiresAt: null,
  }
}

describe('006 faithful regression', () => {
  it('serves a normalized legacy plan with mode faithful and no LLM call', async () => {
    const plan = normalizeLegacyPlan(legacy, {
      sceneCount: 5,
      premise: 'Una repostera descubre que sus postres pueden predecir el futuro.',
      logline: legacy.logline,
      mode: 'faithful',
    })

    expect(plan).not.toBeNull()

    const story = makeStoryRecord({
      status: 'WAITING_APPROVAL',
      mode: 'faithful',
      plan,
      scenes: plan!.beats.map((beat) => ({
        id: `scene-${beat.order}`,
        storyId: 'story-test-0001',
        order: beat.order,
        visualPrompt: beat.visualPrompt,
        narration: beat.narration,
        status: 'KEYFRAME_READY',
        keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
        keyframeAttempts: 1,
        videoUrl: null,
        videoAttempts: 0,
        error: null,
      })),
    })
    const director = new FakeStoryDirector()
    const repository = new FakeStoryRepository([story])
    const runtime = makeStoryRuntime({ director, repository })

    const response = await callStoryRoute(getStory, {
      method: 'GET',
      path: `/api/story/${story.id}`,
      runtime,
      params: { id: story.id },
      cookieSessionId: SESSION_ID,
    })
    const body = response.body as {
      readonly mode: string
      readonly plan: {
        readonly tone: string
        readonly storyBible: {
          readonly locations: readonly { readonly id: string; readonly source: string }[]
        } | null
      }
    }

    expect(response.status).toBe(200)
    expect(body.mode).toBe('faithful')
    expect(body.plan.tone).toBe('neutral')
    expect(body.plan.storyBible?.locations[0]?.id).toBe('legacy-location')
    expect(body.plan.storyBible?.locations[0]?.source).toBe('premise')
    expect(director.calls).toHaveLength(0)
    expect(JSON.stringify(body)).not.toContain('sessionId')
  })

  it('creates a new faithful story without any invented canon and keeps the flow', async () => {
    const director = new FakeStoryDirector(plan5 as StoryPlan)
    const runtime = makeStoryRuntime({ director })

    const response = await callStoryRoute(createStory, {
      method: 'POST',
      path: '/api/story',
      runtime,
      body: createBody('faithful'),
    })
    const story = response.body as {
      readonly status: string
      readonly mode: string
      readonly qc: unknown
      readonly plan: StoryPlan
    }
    const sources = [
      ...(story.plan.storyBible?.characters ?? []),
      ...(story.plan.storyBible?.locations ?? []),
      ...(story.plan.storyBible?.props ?? []),
    ].map((entity) => entity.source)

    expect(response.status).toBe(201)
    expect(story.mode).toBe('faithful')
    expect(story.status).toBe('GENERATING_KEYFRAMES')
    expect(story.qc).toBeNull()
    expect(sources.every((source) => source === 'premise')).toBe(true)
    expect(director.calls).toHaveLength(1)
    expect((director.calls[0] as { mode: string }).mode).toBe('faithful')
  })

  it('rejects a creative canon in faithful mode with 502 and does not persist', async () => {
    const director = new FakeStoryDirector(creative as StoryPlan)
    const runtime = makeStoryRuntime({ director })

    const response = await callStoryRoute(createStory, {
      method: 'POST',
      path: '/api/story',
      runtime,
      body: createBody('faithful'),
    })

    expect(response.status).toBe(502)
    expect((response.body as { error?: { code?: string } }).error?.code)
      .toBe('director-invalid-output')
    expect((runtime.repository as FakeStoryRepository).records).toHaveLength(0)
  })
})
