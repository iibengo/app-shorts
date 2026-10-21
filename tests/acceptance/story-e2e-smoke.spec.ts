// @vitest-environment node
/**
 * Opt-in end-to-end Story smoke.
 *
 *   RUN_STORY_SMOKE=1 \
 *   NUXT_DEEPSEEK_KEY=... NUXT_FAL_KEY=... DATABASE_URL=... \
 *   npx vitest run tests/acceptance/story-e2e-smoke.spec.ts
 *
 * It creates a real 4-scene fast story, approves it and waits for the final
 * MP4. Maximum estimated budget: 8 USD. Never runs in CI by default.
 */
import { describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import type { Story, StoryJob } from '~/models/story'

const enabled = process.env.RUN_STORY_SMOKE === '1'
  && Boolean(process.env.NUXT_DEEPSEEK_KEY)
  && Boolean(process.env.NUXT_FAL_KEY)
  && Boolean(process.env.DATABASE_URL)

if (enabled) {
  await setup({ server: true })
}

const BASE = 'http://localhost'

function cookieFrom(response: Response): string {
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

async function getStory(id: string, cookie: string): Promise<Story> {
  const response = await fetch(`${BASE}/api/story/${id}`, {
    headers: { cookie },
  })

  expect(response.status).toBe(200)

  return await response.json() as Story
}

async function waitFor(
  id: string,
  cookie: string,
  predicate: (story: Story) => boolean,
  timeoutMs: number,
): Promise<Story> {
  const deadline = Date.now() + timeoutMs
  let last: Story | null = null

  while (Date.now() < deadline) {
    last = await getStory(id, cookie)

    if (predicate(last)) {
      return last
    }

    expect(last.status).not.toBe('FAILED')
    expect(last.status).not.toBe('CANCELLED')

    await new Promise((resolve) => setTimeout(resolve, last!.pollAfterMs || 2_500))
  }

  throw new Error(`timeout waiting for the story; last status: ${last?.status}`)
}

describe.skipIf(!enabled)('Story end-to-end smoke (RUN_STORY_SMOKE=1)', () => {
  it('creates, approves and assembles a 4 scene fast story', async () => {
    const created = await fetch(`${BASE}/api/story`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        premise: 'Una repostera descubre que sus postres pueden predecir el futuro.',
        sceneCount: 4,
        preset: 'fast',
        referenceUrl: null,
        referenceExpiresAt: null,
      }),
    })

    expect(created.status).toBe(201)

    const cookie = cookieFrom(created)
    const story = await created.json() as Story

    expect(cookie).toContain('story_sid=')
    expect(story.scenes).toHaveLength(4)

    const review = await waitFor(
      story.id,
      cookie,
      (value) => value.status === 'WAITING_APPROVAL',
      5 * 60_000,
    )

    expect(review.scenes.every((scene) => scene.status === 'KEYFRAME_READY')).toBe(true)

    const approve = await fetch(`${BASE}/api/story/${story.id}/approve`, {
      method: 'POST',
      headers: { cookie },
    })

    expect(approve.status).toBe(202)
    expect((await approve.json() as StoryJob).status).toBe('GENERATING_VIDEOS')

    const ready = await waitFor(
      story.id,
      cookie,
      (value) => value.status === 'READY',
      15 * 60_000,
    )

    expect(ready.finalVideoUrl).toMatch(/^https:\/\/(?:v3b?\.)?fal\.media\//)
    expect(ready.scenes.every((scene) => scene.status === 'VIDEO_READY')).toBe(true)
    expect(ready.totalDurationSeconds).toBe(24)
    expect(ready.pollAfterMs).toBe(0)
  }, 20 * 60_000)
})
