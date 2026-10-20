import type {
  ComposerErrorCode,
  ComposerGenerationRequest,
  ComposerJob,
  ComposerJobError,
  ComposerJobId,
  ComposerReferenceUploadRequest,
  ComposerUploadTicket,
} from '~/models/composer'
import { COMPOSER_GENERATION_ERROR_MESSAGE } from '~/data/composer'

export interface ComposerApi {
  createUploadTicket(input: ComposerReferenceUploadRequest): Promise<ComposerUploadTicket>
  uploadReference(
    ticket: ComposerUploadTicket,
    file: File,
    signal?: AbortSignal,
  ): Promise<void>
  generate(input: ComposerGenerationRequest, signal?: AbortSignal): Promise<ComposerJob>
  getJob(id: ComposerJobId, signal?: AbortSignal): Promise<ComposerJob>
  cancelJob(id: ComposerJobId, signal?: AbortSignal): Promise<ComposerJob>
}

export class ComposerApiClientError extends Error {
  readonly code: ComposerErrorCode
  readonly retryable: boolean
  readonly retryAfterSeconds: number | undefined
  readonly status: number | null

  constructor(
    error: ComposerJobError,
    options: {
      readonly retryAfterSeconds?: number
      readonly status?: number | null
    } = {},
  ) {
    super(error.message)
    this.name = 'ComposerApiClientError'
    this.code = error.code
    this.retryable = error.retryable
    this.retryAfterSeconds = options.retryAfterSeconds
    this.status = options.status ?? null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readErrorPayload(
  value: unknown,
): { error: ComposerJobError; retryAfterSeconds?: number } | null {
  if (!isRecord(value) || !isRecord(value.error)) {
    return null
  }

  const error = value.error
  const code = error.code
  const message = error.message
  const retryable = error.retryable

  if (
    typeof code !== 'string'
    || typeof message !== 'string'
    || typeof retryable !== 'boolean'
  ) {
    return null
  }

  const retryAfterSeconds = error.retryAfterSeconds

  return {
    error: {
      code: code as ComposerErrorCode,
      message,
      retryable,
    },
    retryAfterSeconds:
      typeof retryAfterSeconds === 'number' ? retryAfterSeconds : undefined,
  }
}

function extractStatus(value: unknown): number | null {
  if (!isRecord(value)) return null

  const status = value.status ?? value.statusCode

  return typeof status === 'number' ? status : null
}

export function toComposerApiClientError(error: unknown): ComposerApiClientError {
  if (error instanceof ComposerApiClientError) {
    return error
  }

  if (isRecord(error)) {
    const parsed = readErrorPayload(error.data)

    if (parsed) {
      return new ComposerApiClientError(parsed.error, {
        retryAfterSeconds: parsed.retryAfterSeconds,
        status: extractStatus(error),
      })
    }
  }

  return new ComposerApiClientError(
    {
      code: 'internal-error',
      message: COMPOSER_GENERATION_ERROR_MESSAGE,
      retryable: true,
    },
    { status: extractStatus(error) },
  )
}

function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

async function postJson<T>(
  url: string,
  body: ComposerReferenceUploadRequest | ComposerGenerationRequest,
  signal?: AbortSignal,
): Promise<T> {
  try {
    const result = await $fetch(url, {
      method: 'POST',
      body,
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': createIdempotencyKey(),
      },
    })

    return result as T
  } catch (error) {
    throw toComposerApiClientError(error)
  }
}

function uploadErrorForStatus(status: number): ComposerJobError {
  if (status === 413) {
    return {
      code: 'reference-too-large',
      message: 'La imagen supera el máximo de 8 MB.',
      retryable: false,
    }
  }

  if (status === 415) {
    return {
      code: 'unsupported-reference-type',
      message: 'Formato no admitido. Usa PNG, JPG o WebP.',
      retryable: false,
    }
  }

  if (status === 403) {
    return {
      code: 'invalid-reference',
      message: 'La imagen de referencia no es válida.',
      retryable: false,
    }
  }

  return {
    code: 'internal-error',
    message: COMPOSER_GENERATION_ERROR_MESSAGE,
    retryable: true,
  }
}

export function useComposerApi(): ComposerApi {
  async function createUploadTicket(
    input: ComposerReferenceUploadRequest,
  ): Promise<ComposerUploadTicket> {
    return postJson<ComposerUploadTicket>('/api/composer/uploads', input)
  }

  async function uploadReference(
    ticket: ComposerUploadTicket,
    file: File,
    signal?: AbortSignal,
  ): Promise<void> {
    let response: Response

    try {
      response = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { ...ticket.uploadHeaders },
        body: file,
        mode: 'cors',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal,
      })
    } catch (error) {
      if (signal?.aborted) {
        throw error
      }

      throw new ComposerApiClientError({
        code: 'internal-error',
        message: COMPOSER_GENERATION_ERROR_MESSAGE,
        retryable: true,
      })
    }

    if (!response.ok) {
      throw new ComposerApiClientError(uploadErrorForStatus(response.status), {
        status: response.status,
      })
    }
  }

  async function generate(
    input: ComposerGenerationRequest,
    signal?: AbortSignal,
  ): Promise<ComposerJob> {
    return postJson<ComposerJob>('/api/composer/generate', input, signal)
  }

  async function getJob(
    id: ComposerJobId,
    signal?: AbortSignal,
  ): Promise<ComposerJob> {
    try {
      return await $fetch<ComposerJob>(
        `/api/composer/jobs/${encodeURIComponent(id)}`,
        { signal },
      )
    } catch (error) {
      throw toComposerApiClientError(error)
    }
  }

  async function cancelJob(
    id: ComposerJobId,
    signal?: AbortSignal,
  ): Promise<ComposerJob> {
    try {
      return await $fetch<ComposerJob>(
        `/api/composer/jobs/${encodeURIComponent(id)}/cancel`,
        { method: 'POST', signal },
      )
    } catch (error) {
      throw toComposerApiClientError(error)
    }
  }

  return {
    createUploadTicket,
    uploadReference,
    generate,
    getJob,
    cancelJob,
  }
}
