import type {
  Story,
  StoryBeatUpdateRequest,
  StoryCreateRequest,
  StoryErrorCode,
  StoryJob,
  StoryJobError,
  StoryReferenceUploadRequest,
  StoryShotUpdateRequest,
  StoryUploadTicket,
} from '~/models/story'

export interface StoryApi {
  createStory(input: StoryCreateRequest, idempotencyKey?: string): Promise<Story>
  getStory(id: string, signal?: AbortSignal): Promise<Story>
  createUploadTicket(input: StoryReferenceUploadRequest): Promise<StoryUploadTicket>
  uploadReference(
    ticket: StoryUploadTicket,
    file: File,
    signal?: AbortSignal,
  ): Promise<void>
  updateKeyframe(
    storyId: string,
    sceneId: string,
    input: StoryBeatUpdateRequest,
  ): Promise<StoryJob>
  regenerateShot(
    storyId: string,
    shotId: string,
    input: StoryShotUpdateRequest,
  ): Promise<StoryJob>
  approve(storyId: string): Promise<StoryJob>
  retryVideo(storyId: string, sceneId: string): Promise<StoryJob>
  retryShot(storyId: string, shotId: string): Promise<StoryJob>
  /** 015: requeue a failed character reference. */
  retryCharacter(storyId: string, characterId: string): Promise<StoryJob>
  recoverShot(storyId: string, shotId: string): Promise<StoryJob>
  assemble(storyId: string): Promise<StoryJob>
  retryQc(storyId: string): Promise<StoryJob>
  approveQc(storyId: string): Promise<StoryJob>
  recoverScene(storyId: string, sceneId: string): Promise<StoryJob>
  cancel(storyId: string): Promise<Story>
}

const UNKNOWN_ERROR_MESSAGE = 'Algo salió mal. Inténtalo de nuevo.'

export class StoryApiClientError extends Error {
  readonly code: StoryErrorCode
  readonly retryable: boolean
  readonly retryAfterSeconds: number | undefined
  readonly status: number | null

  constructor(
    error: StoryJobError,
    options: {
      readonly retryAfterSeconds?: number
      readonly status?: number | null
    } = {},
  ) {
    super(error.message)
    this.name = 'StoryApiClientError'
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
): { error: StoryJobError; retryAfterSeconds?: number } | null {
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
      code: code as StoryErrorCode,
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

export function toStoryApiClientError(error: unknown): StoryApiClientError {
  if (error instanceof StoryApiClientError) {
    return error
  }

  if (isRecord(error)) {
    const parsed = readErrorPayload(error.data)

    if (parsed) {
      return new StoryApiClientError(parsed.error, {
        retryAfterSeconds: parsed.retryAfterSeconds,
        status: extractStatus(error),
      })
    }
  }

  return new StoryApiClientError(
    {
      code: 'internal-error',
      message: UNKNOWN_ERROR_MESSAGE,
      retryable: true,
    },
    { status: extractStatus(error) },
  )
}

function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

function uploadErrorForStatus(status: number): StoryJobError {
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
    message: 'No se pudo subir la imagen. Inténtalo de nuevo.',
    retryable: true,
  }
}

export function useStoryApi(): StoryApi {
  async function postJson<T>(
    url: string,
    body: StoryCreateRequest | StoryBeatUpdateRequest | { readonly confirm: true },
    options: { readonly idempotencyKey?: string } = {},
  ): Promise<T> {
    try {
      const result = await $fetch(url, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
          ...(options.idempotencyKey
            ? { 'Idempotency-Key': options.idempotencyKey }
            : {}),
        },
      })

      return result as T
    } catch (error) {
      throw toStoryApiClientError(error)
    }
  }

  async function createStory(
    input: StoryCreateRequest,
    idempotencyKey?: string,
  ): Promise<Story> {
    return postJson<Story>('/api/story', input, {
      idempotencyKey: idempotencyKey ?? createIdempotencyKey(),
    })
  }

  async function getStory(id: string, signal?: AbortSignal): Promise<Story> {
    try {
      return await $fetch<Story>(`/api/story/${encodeURIComponent(id)}`, { signal })
    } catch (error) {
      throw toStoryApiClientError(error)
    }
  }

  async function createUploadTicket(
    input: StoryReferenceUploadRequest,
  ): Promise<StoryUploadTicket> {
    try {
      return await $fetch<StoryUploadTicket>('/api/story/uploads', {
        method: 'POST',
        body: input,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': createIdempotencyKey(),
        },
      })
    } catch (error) {
      throw toStoryApiClientError(error)
    }
  }

  async function uploadReference(
    ticket: StoryUploadTicket,
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

      throw new StoryApiClientError({
        code: 'internal-error',
        message: 'No se pudo subir la imagen. Inténtalo de nuevo.',
        retryable: true,
      })
    }

    if (!response.ok) {
      throw new StoryApiClientError(uploadErrorForStatus(response.status), {
        status: response.status,
      })
    }
  }

  async function updateKeyframe(
    storyId: string,
    sceneId: string,
    input: StoryBeatUpdateRequest,
  ): Promise<StoryJob> {
    return postJson<StoryJob>(
      `/api/story/${encodeURIComponent(storyId)}/beats/${encodeURIComponent(sceneId)}/keyframe`,
      input,
    )
  }

  async function regenerateShot(
    storyId: string,
    shotId: string,
    input: StoryShotUpdateRequest,
  ): Promise<StoryJob> {
    return postJson<StoryJob>(
      `/api/story/${encodeURIComponent(storyId)}/shots/${encodeURIComponent(shotId)}/keyframe`,
      input,
    )
  }

  async function postEmpty<T>(url: string): Promise<T> {
    try {
      return await $fetch<T>(url, { method: 'POST' })
    } catch (error) {
      throw toStoryApiClientError(error)
    }
  }

  async function retryShot(storyId: string, shotId: string): Promise<StoryJob> {
    return postEmpty<StoryJob>(
      `/api/story/${encodeURIComponent(storyId)}/shots/${encodeURIComponent(shotId)}/retry`,
    )
  }

  async function retryCharacter(storyId: string, characterId: string): Promise<StoryJob> {
    return postEmpty<StoryJob>(
      `/api/story/${encodeURIComponent(storyId)}/characters/${encodeURIComponent(characterId)}/retry`,
    )
  }

  async function recoverShot(storyId: string, shotId: string): Promise<StoryJob> {
    return postEmpty<StoryJob>(
      `/api/story/${encodeURIComponent(storyId)}/shots/${encodeURIComponent(shotId)}/recover`,
    )
  }

  async function approve(storyId: string): Promise<StoryJob> {
    return postEmpty<StoryJob>(`/api/story/${encodeURIComponent(storyId)}/approve`)
  }

  async function retryVideo(storyId: string, sceneId: string): Promise<StoryJob> {
    return postEmpty<StoryJob>(
      `/api/story/${encodeURIComponent(storyId)}/beats/${encodeURIComponent(sceneId)}/retry`,
    )
  }

  async function assemble(storyId: string): Promise<StoryJob> {
    return postEmpty<StoryJob>(`/api/story/${encodeURIComponent(storyId)}/assemble`)
  }

  async function retryQc(storyId: string): Promise<StoryJob> {
    return postEmpty<StoryJob>(`/api/story/${encodeURIComponent(storyId)}/qc/retry`)
  }

  async function approveQc(storyId: string): Promise<StoryJob> {
    return postJson<StoryJob>(
      `/api/story/${encodeURIComponent(storyId)}/qc/approve`,
      { confirm: true },
    )
  }

  async function recoverScene(storyId: string, sceneId: string): Promise<StoryJob> {
    return postEmpty<StoryJob>(
      `/api/story/${encodeURIComponent(storyId)}/beats/${encodeURIComponent(sceneId)}/recover`,
    )
  }

  async function cancel(storyId: string): Promise<Story> {
    return postEmpty<Story>(`/api/story/${encodeURIComponent(storyId)}/cancel`)
  }

  return {
    createStory,
    getStory,
    createUploadTicket,
    uploadReference,
    updateKeyframe,
    regenerateShot,
    approve,
    retryVideo,
    retryShot,
    retryCharacter,
    recoverShot,
    assemble,
    retryQc,
    approveQc,
    recoverScene,
    cancel,
  }
}
