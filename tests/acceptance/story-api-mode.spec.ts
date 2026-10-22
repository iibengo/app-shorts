// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeStoryDirector, FakeStoryRepository } from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: createStory } = await import('../../../server/api/story/index.post')

const PREMISE = 'Una repostera descubre que sus postres pueden predecir el futuro.'

function body(overrides: Record<string, unknown> = {}) {
  return {
    premise: PREMISE,
    sceneCount: 5,
    preset: 'fast',
    mode: 'faithful',
    referenceUrl: null,
    referenceExpiresAt: null,
    ...overrides,
  }
}

function setup() {
  const director = new FakeStoryDirector()
  const runtime = makeStoryRuntime({ director })
  const repository = runtime.repository as FakeStoryRepository

  async function post(payload: unknown) {
    return callStoryRoute(createStory, {
      method: 'POST',
      path: '/api/story',
      runtime,
      body: payload,
    })
  }

  return { director, repository, post }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/story mode contract', () => {
  it.each(['faithful', 'creative'] as const)('creates a %s story and returns the mode', async (mode) => {
    const { post } = setup()

    const response = await post(body({ mode }))
    const story = response.body as { readonly mode: string; readonly plan: { readonly tone: string } }

    expect(response.status).toBe(201)
    expect(story.mode).toBe(mode)
    expect(story.plan.tone).toBe('humor')
  })

  it.each([
    ['missing', {}],
    ['null', { mode: null }],
    ['empty', { mode: '' }],
    ['uppercase', { mode: 'Creative' }],
    ['trailing space', { mode: 'faithful ' }],
    ['number', { mode: 1 }],
  ])('rejects %s mode with invalid-mode before the director', async (_label, override) => {
    const { director, repository, post } = setup()
    const payload = body()
    const clean = { ...payload }

    if (_label === 'missing') {
      delete (clean as { mode?: unknown }).mode
    }

    const response = await post({ ...clean, ...override })

    expect(response.status).toBe(400)
    expect((response.body as { error?: { code?: string } }).error?.code).toBe('invalid-mode')
    expect(director.calls).toHaveLength(0)
    expect(repository.records).toHaveLength(0)
  })

  it('reports an unknown body field as invalid-request, not invalid-mode', async () => {
    const { post } = setup()

    const response = await post(body({ model: 'other' }))

    expect(response.status).toBe(400)
    expect((response.body as { error?: { code?: string } }).error?.code).toBe('invalid-request')
  })
})
