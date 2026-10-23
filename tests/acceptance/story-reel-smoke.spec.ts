// @vitest-environment node
/**
 * Opt-in end-to-end smoke for the 008/010 contract.
 *
 *   RUN_REEL_SMOKE=1 \
 *   NUXT_DEEPSEEK_KEY=... NUXT_FAL_KEY=... DATABASE_URL=... \
 *   npx vitest run tests/acceptance/story-reel-smoke.spec.ts
 *
 * Creates one real 15 s budget story with the cartoon3d style, approves it and
 * waits for the final MP4. Hard profile cap: 2,50 USD. Never runs by default.
 */
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import type { Story, StoryJob } from '~/models/story'

const enabled = process.env.RUN_REEL_SMOKE === '1'
  && Boolean(process.env.NUXT_DEEPSEEK_KEY)
  && Boolean(process.env.NUXT_FAL_KEY)
  && Boolean(process.env.DATABASE_URL)

if (enabled) {
  await setup({ server: true })
}
const PREMISE = 'Un repartidor descubre que el paquete que lleva contiene un gato que habla.'

interface CallResult<T> {
  readonly body: T
  readonly cookie: string
}

async function request<T>(
  path: string,
  options: { readonly method?: 'GET' | 'POST'; readonly body?: unknown; readonly cookie?: string } = {},
): Promise<CallResult<T>> {
  let cookie = ''

  const body = await $fetch<T>(path, {
    method: options.method ?? 'GET',
    ...(options.body === undefined ? {} : { body: options.body as Record<string, unknown> }),
    ...(options.cookie === undefined ? {} : { headers: { cookie: options.cookie } }),
    onResponse(context) {
      const raw = context.response.headers.get('set-cookie')

      if (raw !== null) cookie = raw.split(';')[0] ?? ''
    },
  })

  return { body, cookie }
}

async function getStory(id: string, cookie: string): Promise<Story> {
  return (await request<Story>(`/api/story/${id}`, { cookie })).body
}

async function waitFor(
  id: string,
  cookie: string,
  accept: (story: Story) => boolean,
  timeoutMs: number,
): Promise<Story> {
  const startedAt = Date.now()
  let last: Story | null = null

  while (Date.now() - startedAt < timeoutMs) {
    last = await getStory(id, cookie)

    if (accept(last)) return last
    if (last.status === 'FAILED' || last.status === 'CANCELLED') {
      throw new Error(`story ended as ${last.status}: ${last.error?.code ?? 'sin código'}`)
    }

    await new Promise((resolve) => setTimeout(resolve, last.pollAfterMs || 2_500))
  }

  throw new Error(`timeout waiting for the story; last status: ${last?.status}`)
}

describe.skipIf(!enabled)('Reel end-to-end smoke (RUN_REEL_SMOKE=1)', () => {
  it('creates, approves and assembles a 15 s cartoon3d story', async () => {
    const created = await request<Story>('/api/story', {
      method: 'POST',
      body: {
        premise: PREMISE,
        costMode: 'budget',
        targetDurationSeconds: 15,
        maxDurationSeconds: 15,
        preset: 'fast',
        mode: 'creative',
        visualStyle: 'cartoon3d',
        referenceUrl: null,
        referenceExpiresAt: null,
      },
    })
    const cookie = created.cookie
    const story = created.body

    expect(cookie).toContain('story_sid=')
    expect(story.visualStyle).toBe('cartoon3d')
    expect(story.shotCount).toBeGreaterThanOrEqual(4)
    expect(story.shotCount).toBeLessThanOrEqual(5)

    const review = await waitFor(
      story.id,
      cookie,
      (value) => value.status === 'WAITING_APPROVAL',
      12 * 60_000,
    )

    expect(review.scenes.flatMap((scene) => scene.shots)
      .every((shot) => shot.status === 'KEYFRAME_READY')).toBe(true)

    const approve = await request<StoryJob>(`/api/story/${story.id}/approve`, {
      method: 'POST',
      cookie,
    })

    expect(approve.body.status).toBe('GENERATING_VIDEOS')

    const ready = await waitFor(
      story.id,
      cookie,
      (value) => value.status === 'READY' || value.status === 'WAITING_QC',
      25 * 60_000,
    )

    expect(ready.status).toBe('READY')
    expect(ready.finalVideoUrl).toMatch(/^https:\/\/(?:v3b?\.)?fal\.media\//)
    expect(ready.finalDurationSeconds).not.toBeNull()
    expect(ready.finalDurationSeconds!).toBeGreaterThanOrEqual(12)
    expect(ready.finalDurationSeconds!).toBeLessThanOrEqual(15)

    console.log(JSON.stringify({
      smoke: 'reel-15s',
      storyId: ready.id,
      style: ready.visualStyle,
      shots: ready.shotCount,
      plannedSeconds: ready.plannedDurationSeconds,
      finalSeconds: ready.finalDurationSeconds,
      finalVideoUrl: ready.finalVideoUrl,
    }))
  }, 40 * 60_000)
})
