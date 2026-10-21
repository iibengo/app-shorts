// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

process.env.NUXT_DEEPSEEK_KEY = 'deepseek-test-key'
process.env.NUXT_FAL_KEY = 'fal-test-key'

await setup({ server: true })

let status = 0
let html = ''
let setCookie: string | null = null

beforeAll(async () => {
  html = await $fetch<string>('/story/story-qc-ssr')
  const response = await fetch('/story/story-qc-ssr')
  status = response.status
  setCookie = response.headers.get('set-cookie')
})

describe('GET /story/[id] QC SSR acceptance', () => {
  it('responds with HTTP 200', () => {
    expect(status).toBe(200)
  })

  it('does not render QC progress or review shells during SSR', () => {
    expect(html).not.toContain('data-testid="story-qc"')
    expect(html).not.toContain('data-testid="story-qc-progress"')
    expect(html).not.toContain('data-testid="story-qc-review"')
    expect(html).not.toContain('Revisando la continuidad')
    expect(html).not.toContain('Revisa la continuidad')
  })

  it('does not leak qcJson, strips, prompts or provider URLs', () => {
    const markup = html.replace(
      /<script[^>]*id="__NUXT_DATA__"[\s\S]*?<\/script>/g,
      '',
    )

    expect(markup).not.toContain('qcJson')
    expect(markup).not.toContain('qcCheckedAt')
    expect(markup).not.toContain('framesUrl')
    expect(markup).not.toContain('story-qc-')
    expect(markup).not.toContain('negativePrompt')
    expect(markup).not.toContain('story_qc')
    expect(markup).not.toContain('queue.fal.run')
    expect(markup).not.toContain('v3.fal.media')
    expect(html).not.toContain('NUXT_DEEPSEEK_KEY')
    expect(html).not.toContain('deepseek-test-key')
    expect(html).not.toContain('fal-test-key')
    expect(setCookie).toBeNull()
  })
})
