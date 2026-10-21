import { ComposerError, isComposerError } from '../shared/errors'
import {
  assertFalApiUrl,
  parseQueueStatus,
  parseQueueSubmission,
} from './types'
import type { ComposerEndpointId } from './types'
import type { FalHttpClient } from './http-client'

export interface FalQueueSubmission {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
}

export interface FalQueueStatus {
  readonly status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'
  readonly queuePosition: number | null
}

export interface FalQueueService {
  submit(
    endpointId: ComposerEndpointId,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<FalQueueSubmission>
  getStatus(statusUrl: string, signal?: AbortSignal): Promise<FalQueueStatus>
  getResult(responseUrl: string): Promise<unknown>
  cancel(cancelUrl: string): Promise<void>
}

export interface FalQueueServiceOptions {
  readonly client: FalHttpClient
  readonly queueBaseUrl: string
  readonly allowedOrigins: readonly string[]
  readonly allowInsecure: boolean
  readonly submitTimeoutMs?: number
  readonly statusTimeoutMs?: number
  readonly resultTimeoutMs?: number
  readonly cancelTimeoutMs?: number
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export class NativeFalQueueService implements FalQueueService {
  private readonly client: FalHttpClient
  private readonly queueBaseUrl: string
  private readonly allowedOrigins: readonly string[]
  private readonly allowInsecure: boolean
  private readonly submitTimeoutMs: number
  private readonly statusTimeoutMs: number
  private readonly resultTimeoutMs: number
  private readonly cancelTimeoutMs: number

  constructor(options: FalQueueServiceOptions) {
    this.client = options.client
    this.queueBaseUrl = trimTrailingSlash(options.queueBaseUrl)
    this.allowedOrigins = options.allowedOrigins
    this.allowInsecure = options.allowInsecure
    this.submitTimeoutMs = options.submitTimeoutMs ?? 15_000
    this.statusTimeoutMs = options.statusTimeoutMs ?? 10_000
    this.resultTimeoutMs = options.resultTimeoutMs ?? 15_000
    this.cancelTimeoutMs = options.cancelTimeoutMs ?? 15_000
  }

  async submit(
    endpointId: ComposerEndpointId,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<FalQueueSubmission> {
    const response = await this.client.request<unknown>({
      url: `${this.queueBaseUrl}/${endpointId}`,
      method: 'POST',
      body: input,
      timeoutMs: this.submitTimeoutMs,
      signal,
    })

    let parsed: ReturnType<typeof parseQueueSubmission>

    try {
      parsed = parseQueueSubmission(response.data)
    } catch {
      throw new ComposerError('provider-invalid-output')
    }

    try {
      return {
        requestId: parsed.requestId,
        statusUrl: assertFalApiUrl(
          parsed.statusUrl,
          this.allowedOrigins,
          this.allowInsecure,
        ),
        responseUrl: assertFalApiUrl(
          parsed.responseUrl,
          this.allowedOrigins,
          this.allowInsecure,
        ),
        cancelUrl: assertFalApiUrl(
          parsed.cancelUrl,
          this.allowedOrigins,
          this.allowInsecure,
        ),
      }
    } catch {
      throw new ComposerError('provider-invalid-output')
    }
  }

  async getStatus(statusUrl: string, signal?: AbortSignal): Promise<FalQueueStatus> {
    const response = await this.client.request<unknown>({
      url: statusUrl,
      method: 'GET',
      timeoutMs: this.statusTimeoutMs,
      signal,
    })

    try {
      const parsed = parseQueueStatus(response.data)

      return {
        status: parsed.status,
        queuePosition: parsed.queuePosition,
      }
    } catch {
      throw new ComposerError('provider-invalid-output')
    }
  }

  async getResult(responseUrl: string): Promise<unknown> {
    const response = await this.client.request<unknown>({
      url: responseUrl,
      method: 'GET',
      timeoutMs: this.resultTimeoutMs,
    })

    return response.data
  }

  async cancel(cancelUrl: string): Promise<void> {
    try {
      await this.client.request<unknown>({
        url: cancelUrl,
        method: 'PUT',
        timeoutMs: this.cancelTimeoutMs,
      })
    } catch (error) {
      if (isComposerError(error) && error.providerStatus === 409) {
        throw new ComposerError('job-not-cancellable')
      }

      throw new ComposerError('cancel-failed')
    }
  }
}

export function createFalQueueService(
  options: FalQueueServiceOptions,
): FalQueueService {
  return new NativeFalQueueService(options)
}
