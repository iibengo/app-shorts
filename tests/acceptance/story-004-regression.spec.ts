// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8')
}

function list(relativeDirectory: string): readonly string[] {
  const absolute = resolve(ROOT, relativeDirectory)

  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort()
}

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
] as const

const COMPOSER_API_FILES = [
  'server/api/composer/generate.post.ts',
  'server/api/composer/uploads.post.ts',
  'server/api/composer/jobs/[id].get.ts',
  'server/api/composer/jobs/[id]/cancel.post.ts',
] as const

const COMPOSER_APP_FILES = [
  'app/pages/composer.vue',
  'app/models/composer.ts',
  'app/data/composer.ts',
  'app/utils/composer.ts',
  'app/composables/useComposer.ts',
  'app/composables/useComposerApi.ts',
  'app/composables/useComposerReferences.ts',
  'app/components/composer/ComposerHeader.vue',
  'app/components/composer/ComposerStepper.vue',
  'app/components/composer/ComposerPromptForm.vue',
  'app/components/composer/ComposerPresetPicker.vue',
  'app/components/composer/ComposerReferencePicker.vue',
  'app/components/composer/ComposerReferenceCard.vue',
  'app/components/composer/ComposerGenerationProgress.vue',
  'app/components/composer/ComposerResult.vue',
  'app/components/composer/ComposerPartialResult.vue',
] as const

const TEST_004_FILES = [
  'tests/acceptance/composer-api-generate.spec.ts',
  'tests/acceptance/composer-api-jobs.spec.ts',
  'tests/acceptance/composer-api-uploads.spec.ts',
  'tests/acceptance/composer-route.spec.ts',
  'tests/acceptance/feed-route.spec.ts',
  'tests/acceptance/landing-route.spec.ts',
  'tests/unit/composer-guards.spec.ts',
  'tests/unit/use-composer.spec.ts',
  'tests/unit/use-composer-api.spec.ts',
  'tests/unit/use-composer-references.spec.ts',
] as const

describe('004 file inventory', () => {
  it('keeps every Composer runtime file', () => {
    for (const file of [
      ...COMPOSER_SERVER_FILES,
      ...COMPOSER_API_FILES,
      ...COMPOSER_APP_FILES,
      ...TEST_004_FILES,
    ]) {
      expect(existsSync(resolve(ROOT, file)), file).toBe(true)
    }
  })

  it('does not add or remove Composer API routes', () => {
    expect(list('server/api/composer')).toEqual([...COMPOSER_API_FILES].sort())
  })
})

describe('004 contract isolation', () => {
  it('does not reference Story from Composer app or server code', () => {
    for (const file of [...COMPOSER_SERVER_FILES, ...COMPOSER_API_FILES, ...COMPOSER_APP_FILES]) {
      const source = read(file)

      expect(source, file).not.toMatch(/server\/story|~\/story|~~\/server\/story/)
      expect(source, file).not.toMatch(/storyRuntime|StoryService|story_sid|useStory/)
      expect(source, file).not.toMatch(/@prisma\/client|generated\/prisma/)
    }
  })

  it('does not import Composer shims from Story code', () => {
    const storyServer = list('server/story').map((file) => read(file)).join('\n')
    const storyRoutes = list('server/api/story').map((file) => read(file)).join('\n')

    expect(storyServer).not.toMatch(/server\/composer|~\/composer/)
    expect(storyRoutes).not.toMatch(/server\/composer|~\/composer/)
  })

  it('keeps the Composer routes and 004 test files free of Story imports', () => {
    for (const file of [...COMPOSER_API_FILES, ...TEST_004_FILES]) {
      const source = read(file)

      expect(source, file).not.toMatch(/server\/story|~\/composables\/useStory|story_sid/)
      expect(source, file).not.toMatch(/story-api|story-route|story-guards/)
    }
  })

  it('keeps the Composer shared models and API routes unchanged in shape', () => {
    const models = read('app/models/composer.ts')

    expect(models).toContain('export type ComposerJob =')
    expect(models).toContain("status: 'queued'")
    expect(models).toContain("status: 'succeeded'")
    expect(models).toContain("status: 'failed'")
    expect(models).toContain("status: 'cancelled'")
    expect(models).toContain("export type ComposerPreset = 'fast' | 'quality'")
  })
})

describe('landing, feed and Composer regressions', () => {
  it('keeps the Composer page copy', () => {
    const page = read('app/pages/composer.vue')

    expect(page).toContain('Crea un short con IA')
    expect(page).toContain('AI Shorts — Estudio de creación')
    expect(page).toContain(
      'Estudio de creación de AI Shorts: describe una idea, añade una imagen opcional y genera un vídeo vertical de 9:16 con IA.',
    )
    expect(read('app/components/composer/ComposerHeader.vue')).toContain('BETA')
  })

  it('keeps the feed meta description and route', () => {
    const feed = read('app/pages/feed.vue')

    expect(feed).toContain(
      'Feed de demostración de AI Shorts con seis shorts ficticios y un estudio de creación con IA.',
    )
    expect(feed).not.toContain('estudio de creación simulado')
    expect(feed).not.toMatch(/useStory|story_sid|server\/story|app\/models\/story|\/story\b/)
  })

  it('keeps the landing page and its structure', () => {
    const landing = read('app/pages/index.vue')

    expect(landing.length).toBeGreaterThan(0)
    expect(landing).not.toMatch(/useStory|story_sid|server\/story|app\/models\/story/)
  })

  it('keeps the 004 guards file free of Story assertions', () => {
    const guards = read('tests/unit/composer-guards.spec.ts')

    expect(guards).not.toMatch(/server\/story|app\/models\/story|useStory|story_sid/)
    expect(guards).toContain("describe('shared composer model guards'")
  })

  it('keeps the Fal and shared extraction additively compatible', () => {
    const httpClient = read('server/fal/http-client.ts')
    const storage = read('server/fal/storage-service.ts')

    expect(httpClient).toContain('uploadBinary')
    expect(storage).toContain('filePrefix')
    expect(storage).toContain('lifecycleSeconds')
    expect(storage).toContain("DEFAULT_FILE_PREFIX = 'composer-ref-'")
    expect(storage).toContain('DEFAULT_LIFECYCLE_SECONDS = 3_600')
  })
})
