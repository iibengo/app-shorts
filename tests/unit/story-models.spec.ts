// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  SceneStatus,
  Story,
  StoryGenerationState,
  StoryPlan,
  StoryPreset,
  StoryScene,
  StoryStatus,
} from '~/models/story'

const ROOT = process.cwd()
const source = readFileSync(resolve(ROOT, 'app/models/story.ts'), 'utf8')

const STORY_STATUSES: readonly StoryStatus[] = [
  'PLANNING',
  'GENERATING_KEYFRAMES',
  'WAITING_APPROVAL',
  'GENERATING_VIDEOS',
  'VIDEOS_READY',
  'ASSEMBLING',
  'READY',
  'FAILED',
  'CANCELLED',
]

const SCENE_STATUSES: readonly SceneStatus[] = [
  'PENDING',
  'KEYFRAME_QUEUED',
  'KEYFRAME_RUNNING',
  'KEYFRAME_READY',
  'KEYFRAME_FAILED',
  'VIDEO_QUEUED',
  'VIDEO_RUNNING',
  'VIDEO_READY',
  'VIDEO_FAILED',
  'CANCELLED',
]

function makeScene(overrides: Partial<StoryScene> & { id: string; order: number }): StoryScene {
  return {
    id: overrides.id,
    order: overrides.order,
    visualPrompt: 'Un prompt visual de prueba con longitud suficiente.',
    narration: 'Una narración breve de prueba.',
    status: overrides.status ?? 'KEYFRAME_READY',
    keyframeUrl: overrides.keyframeUrl ?? 'https://v3.fal.media/files/test/scene.jpeg',
    keyframeAttempts: overrides.keyframeAttempts ?? 1,
    videoUrl: overrides.videoUrl ?? null,
    videoAttempts: overrides.videoAttempts ?? 0,
    error: overrides.error ?? null,
  }
}

function makeStory(overrides: Partial<Story> = {}): Story {
  const sceneCount = overrides.sceneCount ?? 5
  const scenes = overrides.scenes ?? Array.from({ length: sceneCount }, (_value, index) =>
    makeScene({ id: `scene-${index + 1}`, order: index + 1 }),
  )

  return {
    id: overrides.id ?? 'story-1',
    status: overrides.status ?? 'WAITING_APPROVAL',
    premise: overrides.premise ?? 'Una premisa de prueba con longitud suficiente.',
    title: overrides.title ?? 'El azúcar lo sabe',
    logline: overrides.logline ?? 'Una repostera descubre lo que anticipan sus postres.',
    referenceUrl: overrides.referenceUrl ?? null,
    referenceExpiresAt: overrides.referenceExpiresAt ?? null,
    preset: overrides.preset ?? 'fast',
    modelId: overrides.modelId
      ?? ((overrides.preset ?? 'fast') === 'quality' ? 'kling-2.5-turbo-pro' : 'minimax-hailuo-02'),
    sceneCount,
    durationSeconds: 6,
    totalDurationSeconds: sceneCount * 6,
    aspectRatio: '9:16',
    plan: overrides.plan ?? null,
    scenes,
    finalVideoUrl: overrides.finalVideoUrl ?? null,
    finalVideoExpiresAt: overrides.finalVideoExpiresAt ?? null,
    approvedAt: overrides.approvedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    createdAt: overrides.createdAt ?? '2026-10-21T18:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-10-21T18:00:00.000Z',
    expiresAt: overrides.expiresAt ?? '2026-10-22T18:00:00.000Z',
    version: overrides.version ?? 1,
    error: overrides.error ?? null,
    pollAfterMs: overrides.pollAfterMs ?? 2_500,
  }
}

const plan: StoryPlan = {
  title: 'El azúcar lo sabe',
  logline: 'Una repostera descubre lo que anticipan sus postres.',
  beats: [
    {
      order: 1,
      visualPrompt: 'Una repostera abre su obrador al amanecer entre bandejas.',
      narration: 'Cada mañana, antes de encender el horno, Clara escucha.',
    },
  ],
}

describe('shared Story contract invariants', () => {
  it('models the normative status unions without drift', () => {
    expect(STORY_STATUSES).toHaveLength(9)
    expect(new Set(STORY_STATUSES).size).toBe(9)
    expect(SCENE_STATUSES).toHaveLength(10)
    expect(new Set(SCENE_STATUSES).size).toBe(10)
  })

  it('keeps every field readonly and free of File, Blob, any and unknown', () => {
    expect(source).not.toMatch(/\bFileList\b/)
    expect(source).not.toMatch(/\bFile\b/)
    expect(source).not.toMatch(/\bBlob\b/)
    expect(source).not.toMatch(/\bany\b/)
    expect(source).not.toMatch(/\bunknown\b/)
    expect(source).not.toMatch(/^\s+[a-zA-Z]+\??:/m)
    expect(source).toMatch(/readonly id: string/)
    expect(source).toMatch(/readonly scenes: readonly StoryScene\[\]/)
    expect(source).toMatch(/readonly error: StoryJobError \| null/)
  })

  it('does not leak provider endpoints, transport fields or secrets', () => {
    expect(source).not.toMatch(/fal-ai\//)
    expect(source).not.toMatch(/queue\.fal\.run|rest\.fal\.ai|api\.deepseek\.com/)
    expect(source).not.toMatch(/requestId|statusUrl|responseUrl|cancelUrl/)
    expect(source).not.toMatch(/sessionId|idempotencyKey|leaseOwner|leaseUntil/)
    expect(source).not.toMatch(/NUXT_|DATABASE_URL|DEEPSEEK_KEY|FFMPEG_PATH/)
    expect(source).not.toMatch(/https?:\/\//)
  })

  it('keeps no model barrel', () => {
    expect(existsSync(resolve(ROOT, 'app/models/index.ts'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'app/models/index.js'))).toBe(false)
  })

  it('derives a consistent story for every scene count', () => {
    for (const sceneCount of [4, 5, 6] as const) {
      const story = makeStory({ sceneCount })

      expect(story.durationSeconds).toBe(6)
      expect(story.totalDurationSeconds).toBe(sceneCount * 6)
      expect(story.aspectRatio).toBe('9:16')
      expect(story.scenes).toHaveLength(sceneCount)
      expect(story.scenes.map((scene) => scene.order)).toEqual(
        Array.from({ length: sceneCount }, (_value, index) => index + 1),
      )
    }
  })

  it('maps the preset to the correct model and terminal poll delay', () => {
    expect(makeStory({ preset: 'fast' }).modelId).toBe('minimax-hailuo-02')
    expect(makeStory({ preset: 'quality' }).modelId).toBe('kling-2.5-turbo-pro')
    expect(makeStory({ status: 'READY', pollAfterMs: 0 }).pollAfterMs).toBe(0)
    expect(makeStory({ status: 'FAILED', pollAfterMs: 0 }).pollAfterMs).toBe(0)
  })

  it('keeps the plan and scenes aligned', () => {
    const story = makeStory({ sceneCount: 4, plan: { ...plan, beats: [] } })

    expect(story.sceneCount).toBe(4)
    expect(story.scenes).toHaveLength(4)
    expect(story.plan?.title).toBe(plan.title)
  })

  it('supports the discriminated generation state union', () => {
    const story = makeStory()
    const states: readonly StoryGenerationState[] = [
      { status: 'idle' },
      { status: 'creating', premise: 'Una premisa' },
      { status: 'planning', premise: 'Una premisa' },
      { status: 'keyframes', story },
      { status: 'review', story },
      { status: 'videos', story },
      { status: 'assembling', story },
      { status: 'ready', story },
      {
        status: 'failed',
        story,
        error: { code: 'keyframe-failed', message: 'No se pudieron crear todas las imágenes de la historia.', retryable: false },
      },
      { status: 'cancelled', story },
      { status: 'expired', storyId: story.id },
    ]

    for (const state of states) {
      expect(typeof state.status).toBe('string')
    }
  })

  it('exposes the expected presets', () => {
    const presets: readonly StoryPreset[] = ['fast', 'quality']

    expect(presets).toEqual(['fast', 'quality'])
  })
})
