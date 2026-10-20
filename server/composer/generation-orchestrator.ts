import type {
  ComposerGenerationRequest,
  ComposerModelId,
  ComposerPreset,
  ComposerVideoDuration,
} from '~/models/composer'
import { ComposerError, isComposerError } from './errors'
import type { ComposerEndpointId } from './fal-types'
import type { FalHttpClient, FalHttpResponse } from './fal-http-client'
import type { FalQueueService } from './fal-queue-service'
import type { ModelRegistry } from './model-registry'
import type { PromptComposer } from './prompt-composer'
import type { VideoOutput } from './adapters/types'

export interface OrchestratorJob {
  readonly endpointId: ComposerEndpointId
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
  readonly modelId: ComposerModelId
  readonly preset: ComposerPreset
  readonly durationSeconds: ComposerVideoDuration
  readonly promptHash: string
  readonly posterUrl: string
  readonly referenceUrl: string | null
  readonly createdAt: number
  readonly expiresAt: number
  readonly pollAfterMs: number
}

export interface GenerationOrchestratorOptions {
  readonly queue: FalQueueService
  readonly models: ModelRegistry
  readonly prompts: PromptComposer
  readonly http: FalHttpClient
  readonly runBaseUrl: string
  readonly keyframeTimeoutMs: number
  readonly jobTtlMs: number
  readonly pollAfterMs: number
  readonly now?: () => number
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function clampPollAfter(value: number): number {
  return Math.min(10_000, Math.max(1_000, Math.trunc(value)))
}

export class GenerationOrchestrator {
  private readonly queue: FalQueueService
  private readonly models: ModelRegistry
  private readonly prompts: PromptComposer
  private readonly http: FalHttpClient
  private readonly runBaseUrl: string
  private readonly keyframeTimeoutMs: number
  private readonly jobTtlMs: number
  private readonly pollAfterMs: number
  private readonly now: () => number

  constructor(options: GenerationOrchestratorOptions) {
    this.queue = options.queue
    this.models = options.models
    this.prompts = options.prompts
    this.http = options.http
    this.runBaseUrl = trimTrailingSlash(options.runBaseUrl)
    this.keyframeTimeoutMs = options.keyframeTimeoutMs
    this.jobTtlMs = options.jobTtlMs
    this.pollAfterMs = options.pollAfterMs
    this.now = options.now ?? Date.now
  }

  async createVideoJob(
    request: ComposerGenerationRequest,
    signal?: AbortSignal,
  ): Promise<OrchestratorJob> {
    const hasReference = request.referenceUrl !== null
    const keyframeAdapter = this.models.getKeyframeAdapter(hasReference)
    const keyframeEndpoint = this.models.getKeyframeEndpoint(hasReference)
    const keyframePrompt = hasReference
      ? this.prompts.keyframeKontext(request.prompt)
      : this.prompts.keyframeFlux(request.prompt)

    let keyframeResponse: FalHttpResponse<unknown>

    try {
      keyframeResponse = await this.http.request<unknown>({
        url: `${this.runBaseUrl}/${keyframeEndpoint}`,
        method: 'POST',
        body: keyframeAdapter.buildInput({
          prompt: keyframePrompt,
          referenceUrl: request.referenceUrl,
        }),
        timeoutMs: this.keyframeTimeoutMs,
        signal,
      })
    } catch (error) {
      if (isComposerError(error) && error.code === 'provider-timeout') {
        throw new ComposerError('keyframe-timeout')
      }

      throw error
    }

    const keyframe = keyframeAdapter.parseOutput(keyframeResponse.data)

    if (signal?.aborted) {
      throw new ComposerError('keyframe-timeout')
    }

    const videoAdapter = this.models.getVideoAdapter(request.preset)
    const videoEndpoint = this.models.getVideoEndpoint(request.preset)
    const submission = await this.queue.submit(
      videoEndpoint,
      videoAdapter.buildInput({
        prompt: this.prompts.videoPrompt(request.prompt),
        keyframeUrl: keyframe.imageUrl,
        durationSeconds: request.durationSeconds,
      }),
      signal,
    )

    const createdAt = this.now()
    const expiresAt = createdAt + this.jobTtlMs

    return {
      endpointId: videoEndpoint,
      requestId: submission.requestId,
      statusUrl: submission.statusUrl,
      responseUrl: submission.responseUrl,
      cancelUrl: submission.cancelUrl,
      modelId: this.models.getModelId(request.preset),
      preset: request.preset,
      durationSeconds: request.durationSeconds,
      promptHash: this.prompts.hashPrompt(request.prompt),
      posterUrl: keyframe.imageUrl,
      referenceUrl: request.referenceUrl,
      createdAt,
      expiresAt,
      pollAfterMs: clampPollAfter(this.pollAfterMs),
    }
  }

  parseVideoOutput(
    preset: ComposerPreset,
    payload: unknown,
    durationSeconds: ComposerVideoDuration,
  ): VideoOutput {
    return this.models.getVideoAdapter(preset).parseOutput(
      payload,
      durationSeconds,
    )
  }
}

export function createGenerationOrchestrator(
  options: GenerationOrchestratorOptions,
): GenerationOrchestrator {
  return new GenerationOrchestrator(options)
}
