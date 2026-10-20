// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

const NEW_RUNTIME_FILES = [
  'app/pages/composer.vue',
  'app/components/composer/ComposerHeader.vue',
  'app/components/composer/ComposerStepper.vue',
  'app/components/composer/ComposerPromptForm.vue',
  'app/components/composer/ComposerReferencePicker.vue',
  'app/components/composer/ComposerReferenceCard.vue',
  'app/components/composer/ComposerGenerationProgress.vue',
  'app/components/composer/ComposerPreview.vue',
  'app/components/ui/AppButton.vue',
  'app/composables/useComposer.ts',
  'app/composables/useComposerReferences.ts',
  'app/utils/composer.ts',
  'app/data/composer.ts',
] as const

const MODIFIED_FEED_FILES = [
  'app/components/shorts/FeedHeader.vue',
  'app/pages/feed.vue',
] as const

const FORBIDDEN_RUNTIME_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'Math.random', pattern: /Math\.random\s*\(/ },
  { label: 'Date.now', pattern: /Date\.now\s*\(/ },
  { label: 'new Date(', pattern: /new\s+Date\s*\(/ },
  { label: 'crypto.randomUUID', pattern: /crypto\.randomUUID\s*\(/ },
  { label: 'localStorage', pattern: /\blocalStorage\b/ },
  { label: 'sessionStorage', pattern: /\bsessionStorage\b/ },
  { label: 'fetch(', pattern: /(?<!\$)\bfetch\s*\(/ },
  { label: '$fetch', pattern: /\$fetch\b/ },
  { label: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { label: 'v-html', pattern: /\bv-html\b/ },
  { label: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/ },
]

const SHORT_MODEL_IMPORT_FILES = [
  'app/components/shorts/ShortActionRail.vue',
  'app/components/shorts/ShortCard.vue',
  'app/components/shorts/ShortPoster.vue',
  'app/components/shorts/ShortsFeed.vue',
  'app/composables/useActiveShort.ts',
  'app/composables/useShareShort.ts',
  'app/composables/useShortsFeed.ts',
  'app/data/shorts.ts',
  'app/pages/feed.vue',
  'app/utils/shorts.ts',
] as const

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
}

describe('composer model guards', () => {
  it('keeps File, Blob and FileList out of the shared composer models', () => {
    const source = read('app/models/composer.ts')

    expect(source).not.toMatch(/\bFile\b/)
    expect(source).not.toMatch(/\bFileList\b/)
    expect(source).not.toMatch(/\bBlob\b/)
  })

  it('does not contain any `any` type in the composer models', () => {
    const source = read('app/models/composer.ts')
    expect(source).not.toMatch(/\bany\b/)
  })

  it('keeps global models free of barrels and the legacy short types file', () => {
    expect(existsSync(resolve(ROOT, 'app/models/index.ts'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'app/models/index.js'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'app/types/short.ts'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'app/types'))).toBe(false)
  })
})

describe('runtime determinism and privacy guards', () => {
  it.each([...NEW_RUNTIME_FILES, ...MODIFIED_FEED_FILES])(
    '%s has no random, clock, storage, network or v-html usage',
    (relativePath) => {
      const source = read(relativePath)

      for (const { label, pattern } of FORBIDDEN_RUNTIME_PATTERNS) {
        expect(source, `${relativePath} must not use ${label}`).not.toMatch(pattern)
      }
    },
  )

  it('does not import server routes or the feed composables from the composer', () => {
    for (const relativePath of NEW_RUNTIME_FILES) {
      const source = read(relativePath)
      expect(source, relativePath).not.toMatch(/~\/composables\/useShortsFeed/)
      expect(source, relativePath).not.toMatch(/~\/composables\/useActiveShort/)
      expect(source, relativePath).not.toMatch(/~\/composables\/useShareShort/)
      expect(source, relativePath).not.toMatch(/~\/data\/shorts/)
      expect(source, relativePath).not.toMatch(/~\/models\/short\b/)
    }
  })

  it('does not use the retired modal notice anywhere in the feed', () => {
    expect(existsSync(resolve(ROOT, 'app/components/shorts/CreateShortNotice.vue'))).toBe(false)

    const feedSource = read('app/pages/feed.vue')
    expect(feedSource).not.toMatch(/CreateShortNotice/)
    expect(feedSource).not.toMatch(/create-short-notice/)
    expect(feedSource).not.toMatch(/isNoticeOpen|noticeMounted|openNotice|closeNotice/)
    expect(feedSource).not.toMatch(/Próximamente/)
  })
})

describe('short model migration guards', () => {
  it('migrates exactly the ten imports to ~/models/short', () => {
    for (const relativePath of SHORT_MODEL_IMPORT_FILES) {
      const source = read(relativePath)
      expect(source, relativePath).toContain('~/models/short')
    }

    const allAppFiles = SHORT_MODEL_IMPORT_FILES.map((relativePath) => read(relativePath))
    for (const source of allAppFiles) {
      expect(source).not.toContain('~/types/short')
    }
  })

  it('does not leave any ~/types/short import in app/', () => {
    for (const relativePath of [
      ...NEW_RUNTIME_FILES,
      ...MODIFIED_FEED_FILES,
      ...SHORT_MODEL_IMPORT_FILES,
    ]) {
      expect(read(relativePath), relativePath).not.toContain('~/types/short')
    }
  })
})
