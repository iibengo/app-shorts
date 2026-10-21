// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
}

function listFiles(relativeDirectory: string): readonly string[] {
  const absolute = resolve(ROOT, relativeDirectory)

  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) =>
      relative(ROOT, join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
    )
    .sort()
}

const APP_STORY_FILES = [
  'app/pages/story/index.vue',
  'app/pages/story/[id].vue',
  'app/components/story/StoryHeader.vue',
  'app/components/story/StoryStepper.vue',
  'app/components/story/StoryCreateForm.vue',
  'app/components/story/StorySceneCountPicker.vue',
  'app/components/story/StoryPresetPicker.vue',
  'app/components/story/StoryReferencePicker.vue',
  'app/components/story/StoryPlanProgress.vue',
  'app/components/story/StoryReview.vue',
  'app/components/story/StorySceneCard.vue',
  'app/components/story/StoryVideoProgress.vue',
  'app/components/story/StoryAssemblyProgress.vue',
  'app/components/story/StoryResult.vue',
  'app/components/story/StoryErrorAlert.vue',
  'app/composables/useStory.ts',
  'app/composables/useStoryApi.ts',
  'app/composables/useStoryReference.ts',
  'app/models/story.ts',
  'app/data/story.ts',
  'app/utils/story.ts',
] as const

const SERVER_STORY_FILES = [
  ...listFiles('server/story'),
  ...listFiles('server/api/story'),
  'server/fal/media-storage.ts',
  'server/plugins/story-reconciler.ts',
  'server/db/prisma.ts',
] as const

const STORY_RUNTIME_FILES = [
  ...APP_STORY_FILES,
  ...SERVER_STORY_FILES,
] as const

describe('story files inventory', () => {
  it('contains every normative runtime file', () => {
    for (const file of STORY_RUNTIME_FILES) {
      expect(existsSync(resolve(ROOT, file)), file).toBe(true)
    }
  })

})

describe('shared story model guards', () => {
  it('keeps File, Blob, FileList, any and unknown out of app/models/story.ts', () => {
    const source = read('app/models/story.ts')

    expect(source).not.toMatch(/\bFileList\b/)
    expect(source).not.toMatch(/\bFile\b/)
    expect(source).not.toMatch(/\bBlob\b/)
    expect(source).not.toMatch(/\bany\b/)
    expect(source).not.toMatch(/\bunknown\b/)
  })

  it('has no model barrels', () => {
    expect(existsSync(resolve(ROOT, 'app/models/index.ts'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'app/models/index.js'))).toBe(false)
  })
})

describe('app story guards', () => {
  it.each(APP_STORY_FILES)('%s never imports server code or secrets', (file) => {
    if (!existsSync(resolve(ROOT, file))) return

    const source = read(file)

    expect(source, file).not.toMatch(/~\/server|~~\/server|\.\.\/server|\.\.\/\.\.\/server/)
    expect(source, file).not.toMatch(/@prisma\/client/)
    expect(source, file).not.toMatch(/DATABASE_URL|DIRECT_URL|DEEPSEEK_KEY|FFMPEG_PATH|FFPROBE_PATH/)
    expect(source, file).not.toMatch(/NUXT_FAL_KEY|NUXT_DEEPSEEK_KEY|\bfalKey\b|\bdeepseekKey\b/)
    expect(source, file).not.toMatch(/Authorization\s*:\s*[`'"]?Key/)
    expect(source, file).not.toMatch(/node:crypto/)
  })

  it.each(APP_STORY_FILES)('%s avoids raw HTML and web storage', (file) => {
    if (!existsSync(resolve(ROOT, file))) return

    const source = read(file)

    expect(source, file).not.toMatch(/\bv-html\b/)
    expect(source, file).not.toMatch(/dangerouslySetInnerHTML/)
    expect(source, file).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/)
  })

  it('allows network calls only in useStoryApi.ts', () => {
    for (const file of APP_STORY_FILES) {
      if (!existsSync(resolve(ROOT, file))) continue
      if (file === 'app/composables/useStoryApi.ts') continue

      const source = read(file)

      expect(source, file).not.toMatch(/(?<!\$)\bfetch\s*\(/)
      expect(source, file).not.toMatch(/\$fetch\b/)
    }

    const client = read('app/composables/useStoryApi.ts')

    expect(client).toContain('$fetch')
    expect(client).toContain('fetch(ticket.uploadUrl')
  })

  it('uploads the reference directly with a PUT and no credentials', () => {
    const client = read('app/composables/useStoryApi.ts')

    expect(client).not.toMatch(/FormData/)
    expect(client).toContain("method: 'PUT'")
    expect(client).toContain("credentials: 'omit'")
    expect(client).toContain("redirect: 'error'")
    expect(client).toContain('...ticket.uploadHeaders')
    expect(client).toContain('signal')
  })

  it('allows crypto.randomUUID only in useStoryApi.ts', () => {
    for (const file of STORY_RUNTIME_FILES) {
      const source = read(file)
      const occurrences = source.match(/crypto\.randomUUID\s*\(/g) ?? []

      if (file === 'app/composables/useStoryApi.ts') {
        expect(occurrences.length, file).toBe(1)
      } else {
        expect(occurrences, file).toHaveLength(0)
      }
    }
  })

  it('never uses Math.random', () => {
    for (const file of STORY_RUNTIME_FILES) {
      expect(read(file), file).not.toMatch(/Math\.random\s*\(/)
    }
  })

  it('never uses Date.now in Story app code', () => {
    for (const file of APP_STORY_FILES) {
      if (!existsSync(resolve(ROOT, file))) continue

      expect(read(file), file).not.toMatch(/Date\.now\s*\(/)
    }
  })

  it('does not expose provider endpoints or hosts from app/', () => {
    for (const file of APP_STORY_FILES) {
      if (!existsSync(resolve(ROOT, file))) continue

      const source = read(file)

      expect(source, file).not.toMatch(/fal-ai\//)
      expect(source, file).not.toMatch(/queue\.fal\.run|fal\.run|rest\.fal\.ai/)
      expect(source, file).not.toMatch(/api\.deepseek\.com/)
    }
  })

  it('does not import Composer or feed modules into Story', () => {
    for (const file of APP_STORY_FILES) {
      if (!existsSync(resolve(ROOT, file))) continue

      const source = read(file)

      expect(source, file).not.toMatch(/~\/composables\/useComposer/)
      expect(source, file).not.toMatch(/~\/models\/composer\b/)
      expect(source, file).not.toMatch(/~\/data\/composer\b/)
      expect(source, file).not.toMatch(/~\/components\/composer\//)
      expect(source, file).not.toMatch(/~\/data\/shorts\b|~\/models\/short\b/)
    }
  })
})

describe('server story guards', () => {
  it('never imports the Composer domain, shims or app UI', () => {
    for (const file of SERVER_STORY_FILES) {
      const source = read(file)

      expect(source, file).not.toMatch(/server\/composer|~~\/server\/composer|~\/composer/)
      expect(source, file).not.toMatch(/~\/components|~\/composables|~\/pages|~\/utils|~\/data/)
      expect(source, file).not.toMatch(/\bany\b/)
      expect(source, file).not.toMatch(/NUXT_FAL_KEY|NUXT_DEEPSEEK_KEY/)
    }
  })

  it('never shells out except the dedicated spawn runner', () => {
    for (const file of SERVER_STORY_FILES) {
      const source = read(file)

      expect(source, file).not.toMatch(/\bexecSync\b|\bexec\s*\(|\bspawnSync\b/)
      expect(source, file).not.toMatch(/\beval\s*\(|new Function\s*\(/)
      expect(source, file).not.toMatch(/\bshell\s*:\s*true/)

      if (file !== 'server/story/ffmpeg-runner.ts') {
        expect(source, file).not.toMatch(/\bspawn\s*\(/)
      }
    }
  })

  it('runs FFmpeg with spawn and shell false', () => {
    const runner = read('server/story/ffmpeg-runner.ts')

    expect(runner).toContain('spawn(options.binary')
    expect(runner).toContain('shell: false')
    expect(runner).toContain("'SIGKILL'")
    expect(runner).toContain('MAX_STDERR_CHARS')
    expect(runner).not.toContain('execSync')
  })

  it('does not build SQL or use Prisma outside the repository', () => {
    for (const file of SERVER_STORY_FILES) {
      const source = read(file)

      if (
        file === 'server/story/prisma-story-repository.ts'
        || file === 'server/db/prisma.ts'
      ) {
        continue
      }

      expect(source, file).not.toMatch(/@prisma\/client|generated\/prisma/)
    }
  })

  it('keeps routes thin and free of provider, Prisma and process.env access', () => {
    const routeFiles = listFiles('server/api/story')

    for (const file of routeFiles) {
      const source = read(file)

      expect(source, file).not.toMatch(/@prisma\/client|generated\/prisma/)
      expect(source, file).not.toMatch(/node:child_process|node:fs|node:os|node:path/)
      expect(source, file).not.toMatch(/process\.env/)
      expect(source, file).not.toMatch(/prisma-story-repository|assembly-service|media-downloader|director-prompt/)
      expect(source, file).not.toMatch(/from '~~\/server\/fal\/(http-client|queue-service|storage-service)'/)
      expect(source, file).not.toMatch(/writeFile|createWriteStream|readFile/)
    }
  })

  it('keeps secrets in the runtime, plugin and lazy DB module only', () => {
    for (const file of SERVER_STORY_FILES) {
      const source = read(file)
      const allowedDatabase = file === 'server/db/prisma.ts' || file === 'server/plugins/story-reconciler.ts'
      const allowedFfmpeg = file === 'server/story/runtime.ts'

      if (!allowedDatabase) {
        expect(source, file).not.toMatch(/DATABASE_URL|DIRECT_URL/)
      }

      if (!allowedFfmpeg) {
        expect(source, file).not.toMatch(/FFMPEG_PATH|FFPROBE_PATH/)
      }
    }
  })

  it('keeps Story media uploads on the server allowlist', () => {
    const storage = read('server/fal/media-storage.ts')

    expect(storage).toContain('assertSecureUploadUrl')
    expect(storage).toContain('assertFalMediaUrl')
    expect(storage).toContain("contentType: 'video/mp4'")
    expect(storage).not.toMatch(/Authorization/)
    expect(storage).toContain('uploadBinary')
  })

  it('does not proxy user binaries through Nitro', () => {
    const routes = listFiles('server/api/story').map((file) => read(file)).join('\n')

    expect(routes).not.toMatch(/readRawBody\([^)]*\).*binary/is)
    expect(routes).not.toMatch(/multipart\/form-data/)
    expect(routes).not.toMatch(/createReadStream|writeFile/)
  })
})

describe('PWA and dependency guards', () => {
  it('keeps NetworkOnly for Story APIs and Fal hosts', () => {
    const config = read('nuxt.config.ts')

    expect(config).toContain('navigateFallbackDenylist')
    expect(config).toMatch(/\/\^\\\/api\\\/\//)
    expect(config).toMatch(/\/\\\/api\\\/\.\*\//)
    expect(config).toContain("handler: 'NetworkOnly'")
    expect(config).toContain('fal\\.media')
    expect(config).toContain('queue|rest')
    expect(config).not.toMatch(/story.*CacheFirst|story.*StaleWhileRevalidate/is)
  })

  it('adds no provider SDK, HTTP client or FFmpeg wrapper dependency', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const dependencies = Object.keys({
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    })

    for (const dependency of dependencies) {
      expect(dependency).not.toMatch(
        /^(?:openai|@deepseek|axios|node-fetch|got|fluent-ffmpeg|ffmpeg-static|@ffmpeg|playwright|puppeteer)/,
      )
    }
  })

  it('uses only local inline icons and no external story assets', () => {
    const components = APP_STORY_FILES
      .filter((file) => file.endsWith('.vue'))
      .map((file) => read(file))
      .join('\n')

    expect(components).not.toMatch(/https?:\/\//)
    expect(components).not.toMatch(/@nuxt\/icon|IconName|<Icon\b/)
  })
})
