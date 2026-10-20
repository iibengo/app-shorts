// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

const COMPOSER_APP_FILES = [
  'app/pages/composer.vue',
  'app/components/composer/ComposerHeader.vue',
  'app/components/composer/ComposerStepper.vue',
  'app/components/composer/ComposerPromptForm.vue',
  'app/components/composer/ComposerPresetPicker.vue',
  'app/components/composer/ComposerReferencePicker.vue',
  'app/components/composer/ComposerReferenceCard.vue',
  'app/components/composer/ComposerGenerationProgress.vue',
  'app/components/composer/ComposerResult.vue',
  'app/components/composer/ComposerPartialResult.vue',
  'app/components/ui/AppButton.vue',
  'app/composables/useComposer.ts',
  'app/composables/useComposerApi.ts',
  'app/composables/useComposerReferences.ts',
  'app/models/composer.ts',
  'app/data/composer.ts',
  'app/utils/composer.ts',
] as const

const COMPOSER_SERVER_FILES = [
  'server/composer/errors.ts',
  'server/composer/validation.ts',
  'server/composer/fal-types.ts',
  'server/composer/fal-http-client.ts',
  'server/composer/fal-queue-service.ts',
  'server/composer/fal-storage-service.ts',
  'server/composer/model-registry.ts',
  'server/composer/prompt-composer.ts',
  'server/composer/generation-orchestrator.ts',
  'server/composer/composer-generation-service.ts',
  'server/composer/rate-limit.ts',
  'server/composer/job-token.ts',
  'server/composer/request-context.ts',
  'server/composer/runtime.ts',
  'server/composer/adapters/types.ts',
  'server/composer/adapters/flux-image-adapter.ts',
  'server/composer/adapters/flux-kontext-adapter.ts',
  'server/composer/adapters/minimax-video-adapter.ts',
  'server/composer/adapters/kling-video-adapter.ts',
  'server/api/composer/uploads.post.ts',
  'server/api/composer/generate.post.ts',
  'server/api/composer/jobs/[id].get.ts',
  'server/api/composer/jobs/[id]/cancel.post.ts',
] as const

const ALL_RUNTIME_FILES = [
  ...COMPOSER_APP_FILES,
  ...COMPOSER_SERVER_FILES,
] as const

const FEED_FILES = [
  'app/pages/feed.vue',
  'app/components/shorts/FeedHeader.vue',
  'app/components/shorts/ShortsFeed.vue',
  'app/components/shorts/ShortCard.vue',
] as const

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
}

describe('shared composer model guards', () => {
  it('keeps File, Blob, FileList, any and unknown out of the shared models', () => {
    const source = read('app/models/composer.ts')

    expect(source).not.toMatch(/\bFile\b/)
    expect(source).not.toMatch(/\bFileList\b/)
    expect(source).not.toMatch(/\bBlob\b/)
    expect(source).not.toMatch(/\bany\b/)
    expect(source).not.toMatch(/\bunknown\b/)
  })

  it('has no model barrels and no retired type directories', () => {
    expect(existsSync(resolve(ROOT, 'app/models/index.ts'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'app/models/index.js'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'app/types'))).toBe(false)
  })

  it('keeps server-only fields and endpoints out of the shared contract', () => {
    const source = read('app/models/composer.ts')

    expect(source).not.toMatch(/endpointId|statusUrl|responseUrl|cancelUrl/)
    expect(source).not.toMatch(/NUXT_FAL_KEY|falKey/)
  })
})

describe('secret and server-import guards', () => {
  it.each(COMPOSER_APP_FILES)('%s never references Fal credentials or server code', (file) => {
    const source = read(file)

    expect(source, file).not.toMatch(/NUXT_FAL_KEY/)
    expect(source, file).not.toMatch(/\bfalKey\b/)
    expect(source, file).not.toMatch(/Authorization\s*:\s*Key/)
    expect(source, file).not.toMatch(/Key\s+\$\{/)
    expect(source, file).not.toMatch(/node:crypto/)
    expect(source, file).not.toMatch(/~\/server|~~\/server|\.\.\/server/)
  })

  it.each(COMPOSER_SERVER_FILES)('%s never imports app UI code and uses no any', (file) => {
    const source = read(file)

    expect(source, file).not.toMatch(/~\/components|~\/composables|~\/pages|~\/utils|~\/data/)
    expect(source, file).not.toMatch(/\bany\b/)
    expect(source, file).not.toMatch(/NUXT_FAL_KEY/)
  })

  it('keeps the Fal key inside the server runtime only', () => {
    const appSources = COMPOSER_APP_FILES.map((file) => read(file)).join('\n')
    const runtime = read('server/composer/runtime.ts')

    expect(appSources).not.toContain('NUXT_FAL_KEY')
    expect(appSources).not.toContain('falKey')
    expect(runtime).toContain('falKey')
    expect(runtime).toContain('useRuntimeConfig')
  })

  it('does not expose Fal endpoints from app/', () => {
    for (const file of COMPOSER_APP_FILES) {
      const source = read(file)

      expect(source, file).not.toMatch(/fal-ai\//)
      expect(source, file).not.toMatch(/queue\.fal\.run|fal\.run|rest\.fal\.ai/)
      expect(source, file).not.toMatch(/v1\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/)
    }
  })
})

describe('rendering, storage and feed guards', () => {
  it.each(ALL_RUNTIME_FILES)('%s avoids v-html, raw HTML and persistency', (file) => {
    const source = read(file)

    expect(source, file).not.toMatch(/\bv-html\b/)
    expect(source, file).not.toMatch(/dangerouslySetInnerHTML/)
    expect(source, file).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/)
  })

  it('does not import feed data or feed composables from the composer', () => {
    for (const file of COMPOSER_APP_FILES) {
      const source = read(file)

      expect(source, file).not.toMatch(/~\/composables\/useShortsFeed/)
      expect(source, file).not.toMatch(/~\/composables\/useActiveShort/)
      expect(source, file).not.toMatch(/~\/composables\/useShareShort/)
      expect(source, file).not.toMatch(/~\/data\/shorts/)
      expect(source, file).not.toMatch(/~\/models\/short\b/)
    }
  })

  it('keeps the retired mock composer out of production', () => {
    expect(existsSync(resolve(ROOT, 'app/components/composer/ComposerPreview.vue'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'public/mock/composer'))).toBe(false)
  })

  it('updates only the feed meta description to remove "simulado"', () => {
    const feed = read('app/pages/feed.vue')

    expect(feed).toContain(
      'Feed de demostración de AI Shorts con seis shorts ficticios y un estudio de creación con IA.',
    )
    expect(feed).not.toContain('estudio de creación simulado')
  })

  it.each(FEED_FILES)('%s does not use XMLHttpRequest or composer client modules', (file) => {
    const source = read(file)

    expect(source, file).not.toMatch(/\bXMLHttpRequest\b/)
    expect(source, file).not.toMatch(/~\/composables\/useComposer/)
  })
})

describe('client network, randomness and clock guards', () => {
  it('allows $fetch/fetch only in useComposerApi.ts', () => {
    for (const file of COMPOSER_APP_FILES) {
      if (file === 'app/composables/useComposerApi.ts') continue

      const source = read(file)
      expect(source, file).not.toMatch(/(?<!\$)\bfetch\s*\(/)
      expect(source, file).not.toMatch(/\$fetch\b/)
    }

    const client = read('app/composables/useComposerApi.ts')
    expect(client).toContain('$fetch')
    expect(client).toContain('fetch(ticket.uploadUrl')
  })

  it('allows crypto.randomUUID only in useComposerApi.ts', () => {
    for (const file of ALL_RUNTIME_FILES) {
      const source = read(file)
      const occurrences = source.match(/crypto\.randomUUID\s*\(/g) ?? []

      if (file === 'app/composables/useComposerApi.ts') {
        expect(occurrences.length, file).toBe(1)
      } else {
        expect(occurrences, file).toHaveLength(0)
      }
    }
  })

  it('allows Date.now only for client elapsed, expiry and backoff', () => {
    const allowed = new Set([
      'app/composables/useComposer.ts',
      'app/composables/useComposerReferences.ts',
    ])

    for (const file of COMPOSER_APP_FILES) {
      const source = read(file)
      const uses = source.match(/Date\.now\s*\(/g) ?? []

      if (allowed.has(file)) {
        expect(uses.length, file).toBeGreaterThan(0)
      } else {
        expect(uses, file).toHaveLength(0)
      }
    }
  })

  it('never uses Math.random in app or server', () => {
    for (const file of ALL_RUNTIME_FILES) {
      expect(read(file), file).not.toMatch(/Math\.random\s*\(/)
    }
  })

  it('never uses XMLHttpRequest in the composer', () => {
    for (const file of ALL_RUNTIME_FILES) {
      expect(read(file), file).not.toMatch(/\bXMLHttpRequest\b/)
    }
  })

  it('keeps the upload binary out of Nitro and uses a direct PUT', () => {
    const client = read('app/composables/useComposerApi.ts')

    expect(client).not.toMatch(/FormData/)
    expect(client).toContain("method: 'PUT'")
    expect(client).toContain("credentials: 'omit'")
    expect(client).toContain("redirect: 'error'")
    expect(client).toContain('...ticket.uploadHeaders')
  })
})
