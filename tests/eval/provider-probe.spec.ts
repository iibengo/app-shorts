// @vitest-environment node
/**
 * Opt-in provider probes. One call per run, recorded and reproducible offline.
 *
 *   RUN_PROBE=keyframe NUXT_FAL_KEY=... npm run probe
 *   RUN_PROBE=kontext  NUXT_FAL_KEY=... PROBE_REFERENCE_URL=... npm run probe
 *   RUN_PROBE=video    NUXT_FAL_KEY=... PROBE_KEYFRAME_URL=... npm run probe
 *
 * Never runs in the normal suite. Fal only, no DeepSeek, no database.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StoryBeat, StoryPlan } from '~/models/story'
import type { ComposerEndpointId } from '../../server/fal/types'
import { FAL_API_ORIGINS } from '../../server/fal/types'
import { createFalHttpClient } from '../../server/fal/http-client'
import { createFalQueueService } from '../../server/fal/queue-service'
import type { FalQueueService } from '../../server/fal/queue-service'
import { FluxImageAdapter } from '../../server/fal/adapters/flux-image-adapter'
import { FluxKontextAdapter } from '../../server/fal/adapters/flux-kontext-adapter'
import { ModelRegistry } from '../../server/composer/model-registry'
import { NanoBananaAdapter } from '../../server/fal/adapters/nano-banana-adapter'
import { storyPromptComposer, STORY_PROMPT_MAX_LENGTH } from '../../server/story/story-prompt-composer'
import { buildDirector, loadPremises, planFor, RECORDED_PATH } from './director-harness'

const probe = process.env.RUN_PROBE ?? ''
const falKey = process.env.NUXT_FAL_KEY ?? ''
const PROBE_DIR = join(process.cwd(), 'tests/fixtures/eval/probes')
const POLL_INTERVAL_MS = 3_000
const PROBE_TIMEOUT_MS = 720_000

interface ProbePlan {
  readonly plan: StoryPlan
  readonly beat: StoryBeat
}

function queueService(): FalQueueService {
  const client = createFalHttpClient({
    apiKey: falKey,
    allowedOrigins: FAL_API_ORIGINS,
  })

  return createFalQueueService({
    client,
    queueBaseUrl: 'https://queue.fal.run',
    allowedOrigins: FAL_API_ORIGINS,
    allowInsecure: false,
  })
}

/**
 * Rebuilds a real plan offline from the recorded eval, so the probe is fed by
 * the same data the product produces instead of a hand-written example.
 */
async function planFromRecording(): Promise<ProbePlan> {
  const recording = JSON.parse(readFileSync(RECORDED_PATH, 'utf8')) as {
    readonly calls: readonly {
      readonly premiseId: string
      readonly index: number
      readonly response: unknown
    }[]
  }
  const premise = loadPremises().premises[0]!
  const calls = recording.calls
    .filter((call) => call.premiseId === premise.id)
    .sort((a, b) => a.index - b.index)
  let cursor = 0
  const stubFetch = (async () => {
    const call = calls[cursor]
    cursor += 1

    if (call === undefined) throw new Error('probe: grabación insuficiente')

    return new Response(JSON.stringify(call.response), { status: 200 })
  }) as typeof fetch
  const { director } = buildDirector({ apiKey: 'probe', fetchImpl: stubFetch })
  const result = await director.createPlan({
    premise: premise.premise,
    mode: premise.mode,
    preset: premise.preset,
    durationPlan: planFor(premise),
    referenceUrl: null,
  })
  const scene = result.plan.scenes[0]!
  const shot = result.shotPlan.scenes[0]!.shots[0]!

  return {
    plan: result.plan,
    beat: {
      order: shot.order,
      sceneRole: scene.sceneRole,
      locationId: shot.locationId,
      timeOfDay: scene.timeOfDay,
      weather: scene.weather,
      characters: scene.characters,
      props: scene.props,
      action: shot.action,
      narration: scene.narration,
      storyFunction: scene.storyFunction,
      gag: scene.gag,
      visualPrompt: shot.visualPrompt,
      camera: shot.camera,
      continuityFromPrevious: scene.continuityFromPrevious,
      transition: 'cut',
      subject: shot.subject,
      framing: shot.framing,
    },
  }
}

async function waitForResult(queue: FalQueueService, statusUrl: string): Promise<void> {
  const started = Date.now()

  while (Date.now() - started < PROBE_TIMEOUT_MS) {
    const status = await queue.getStatus(statusUrl)

    if (status.status === 'COMPLETED') return

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error('probe: timeout esperando al proveedor')
}

function record(name: string, payload: Record<string, unknown>): string {
  mkdirSync(PROBE_DIR, { recursive: true })
  const file = join(PROBE_DIR, `${name}-${new Date().toISOString()}.json`)
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`)

  return file
}

describe.skipIf(probe.length === 0)('provider probes (opt-in)', () => {
  it('fails fast without a Fal key', () => {
    expect(falKey.length).toBeGreaterThan(0)
  })

  it.skipIf(probe !== 'keyframe')('generates one keyframe with FLUX dev', async () => {
    const { plan, beat } = await planFromRecording()
    const override = (process.env.PROBE_PROMPT ?? '').trim()
    const visualStyle = process.env.PROBE_STYLE
    const composed = override.length > 0
      ? { prompt: override }
      : storyPromptComposer.composeKeyframe({
          bible: plan.storyBible,
          beat,
          hasReference: false,
          ...(visualStyle === undefined ? {} : { visualStyle: visualStyle as never }),
          maxLength: STORY_PROMPT_MAX_LENGTH,
        })
    const adapter = new FluxImageAdapter()
    const queue = queueService()
    const started = Date.now()
    const submission = await queue.submit(
      adapter.modelId as ComposerEndpointId,
      adapter.buildInput({ prompt: composed.prompt, referenceUrl: null }),
    )

    await waitForResult(queue, submission.statusUrl)
    const payload = await queue.getResult(submission.responseUrl)
    const output = adapter.parseOutput(payload)
    const file = record('keyframe', {
      probe: 'keyframe',
      endpoint: adapter.modelId,
      createdAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      prompt: composed.prompt,
      promptLength: composed.prompt.length,
      requestId: submission.requestId,
      output,
    })

    console.log(`keyframe ok: ${output.imageUrl} (${composed.prompt.length} chars) -> ${file}`)
    expect(output.imageUrl).toContain('http')
  }, PROBE_TIMEOUT_MS + 60_000)
  it.skipIf(probe !== 'kontext')('generates one keyframe with Kontext and a reference', async () => {
    const reference = process.env.PROBE_REFERENCE_URL ?? ''

    expect(reference, 'PROBE_REFERENCE_URL es obligatoria para la sonda kontext').toContain('http')

    const { plan, beat } = await planFromRecording()
    const override = (process.env.PROBE_PROMPT ?? '').trim()
    const composed = override.length > 0
      ? { prompt: override }
      : storyPromptComposer.composeKeyframe({
          bible: plan.storyBible,
          beat,
          hasReference: true,
          maxLength: STORY_PROMPT_MAX_LENGTH,
        })
    const adapter = new FluxKontextAdapter()
    const queue = queueService()
    const started = Date.now()
    const submission = await queue.submit(
      adapter.modelId as ComposerEndpointId,
      adapter.buildInput({ prompt: composed.prompt, referenceUrl: reference }),
    )

    await waitForResult(queue, submission.statusUrl)
    const payload = await queue.getResult(submission.responseUrl)
    const output = adapter.parseOutput(payload)
    const file = record('kontext', {
      probe: 'kontext',
      endpoint: adapter.modelId,
      createdAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      prompt: composed.prompt,
      promptLength: composed.prompt.length,
      requestId: submission.requestId,
      output,
    })

    console.log(`kontext ok: ${output.imageUrl} -> ${file}`)
    expect(output.imageUrl).toContain('http')
  }, PROBE_TIMEOUT_MS + 60_000)

  it.skipIf(probe !== 'video')('generates one 6 s clip with the fast video model from a keyframe', async () => {
    const keyframeUrl = process.env.PROBE_KEYFRAME_URL ?? ''

    expect(keyframeUrl, 'PROBE_KEYFRAME_URL es obligatoria para la sonda video').toContain('http')

    const { plan, beat } = await planFromRecording()
    const override = (process.env.PROBE_PROMPT ?? '').trim()
    const composed = override.length > 0
      ? { prompt: override, negativePrompt: 'blur, distortion, low quality, extra hands' }
      : storyPromptComposer.composeVideo({
          bible: plan.storyBible,
          beat,
          preset: 'fast',
        })
    const registry = new ModelRegistry()
    const adapter = registry.getVideoAdapter('fast')
    const endpoint = registry.getVideoEndpoint('fast')
    const queue = queueService()
    const started = Date.now()
    const submission = await queue.submit(
      endpoint,
      adapter.buildInput({
        prompt: composed.prompt,
        keyframeUrl,
        durationSeconds: 6,
        negativePrompt: composed.negativePrompt,
      }),
    )

    // Persist the handle before waiting: a slow job must stay recoverable.
    const submitted = record('video-submitted', {
      probe: 'video',
      endpoint,
      createdAt: new Date().toISOString(),
      requestId: submission.requestId,
      statusUrl: submission.statusUrl,
      responseUrl: submission.responseUrl,
      prompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
    })

    try {
      await waitForResult(queue, submission.statusUrl)
    } catch (error) {
      throw new Error(
        `${(error as Error).message} (requestId ${submission.requestId}, estado en ${submitted})`,
      )
    }
    const payload = await queue.getResult(submission.responseUrl)
    const output = adapter.parseOutput(payload, 6)
    const file = record('video', {
      probe: 'video',
      endpoint,
      createdAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      prompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
      requestId: submission.requestId,
      output,
    })

    console.log(`video ok: ${output.videoUrl} -> ${file}`)
    expect(output.videoUrl).toContain('http')
  }, PROBE_TIMEOUT_MS + 60_000)

  it.skipIf(probe !== 'qc')('documents that the QC probe needs a frames strip', () => {
    throw new Error(
      'probe qc: requiere un strip de fotogramas en PROBE_FRAMES_URL; pendiente de implementar',
    )
  })
  it.skipIf(probe !== 'nano-banana')('generates one keyframe with Nano Banana and a reference', async () => {
    const reference = process.env.PROBE_REFERENCE_URL ?? ''
    const override = (process.env.PROBE_PROMPT ?? '').trim()

    expect(reference, 'PROBE_REFERENCE_URL es obligatoria').toContain('http')

    const adapter = new NanoBananaAdapter()
    const queue = queueService()
    const started = Date.now()
    const submission = await queue.submit(
      adapter.modelId as ComposerEndpointId,
      adapter.buildInput({ prompt: override, referenceUrl: reference }),
    )

    await waitForResult(queue, submission.statusUrl)
    const payload = await queue.getResult(submission.responseUrl)
    const output = adapter.parseOutput(payload)
    const file = record('nano-banana', {
      probe: 'nano-banana',
      endpoint: adapter.modelId,
      createdAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      prompt: override,
      promptLength: override.length,
      requestId: submission.requestId,
      output,
    })

    console.log(`nano-banana ok: ${output.imageUrl} -> ${file}`)
    expect(output.imageUrl).toContain('http')
  }, PROBE_TIMEOUT_MS + 60_000)
})
