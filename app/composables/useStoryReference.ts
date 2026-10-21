import {
  getCurrentInstance,
  onBeforeUnmount,
  ref,
  type Ref,
} from 'vue'
import type {
  StoryImageMimeType,
  StoryJobError,
  StoryReference,
  StoryReferenceUploadRequest,
  StoryUploadTicket,
} from '~/models/story'
import {
  isStoryImageMimeType,
  normalizeStoryMimeType,
  validateStoryReferenceFile,
} from '~/utils/story'
import type { StoryApi } from './useStoryApi'
import { toStoryApiClientError } from './useStoryApi'

export type StoryUploadState = 'idle' | 'uploading' | 'error'

export interface UseStoryReferenceOptions {
  readonly api: StoryApi
}

export interface UseStoryReferenceReturn {
  reference: Ref<StoryReference | null>
  uploadState: Ref<StoryUploadState>
  issues: Ref<StoryJobError[]>
  selectFile: (file: File) => Promise<void>
  removeReference: () => void
  retryUpload: () => Promise<void>
  clearIssues: () => void
}

function createObjectUrl(file: File): string | null {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null
  }

  try {
    return URL.createObjectURL(file)
  } catch {
    return null
  }
}

function revokeObjectUrl(url: string | null): void {
  if (!url) return
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return

  try {
    URL.revokeObjectURL(url)
  } catch {
    // Revoking a stale object URL must never break the story flow.
  }
}

export function useStoryReference(
  options: UseStoryReferenceOptions,
): UseStoryReferenceReturn {
  const reference = ref<StoryReference | null>(null)
  const uploadState = ref<StoryUploadState>('idle')
  const issues = ref<StoryJobError[]>([])

  let pendingFile: File | null = null
  let pendingPreviewUrl: string | null = null
  let abortController: AbortController | null = null
  let runId = 0

  function clearIssues(): void {
    issues.value = []
  }

  function discardReference(): void {
    abortController?.abort()
    abortController = null
    revokeObjectUrl(pendingPreviewUrl)
    reference.value = null
    pendingFile = null
    pendingPreviewUrl = null
    uploadState.value = 'idle'
    issues.value = []
  }

  function buildUploadRequest(file: File): StoryReferenceUploadRequest | null {
    const mimeType = normalizeStoryMimeType(file.type)

    if (!isStoryImageMimeType(mimeType)) {
      return null
    }

    return {
      fileName: file.name,
      contentType: mimeType,
      sizeBytes: file.size,
    }
  }

  async function runUpload(
    file: File,
    request: StoryReferenceUploadRequest,
  ): Promise<void> {
    const currentRun = ++runId
    const controller = new AbortController()

    abortController = controller
    uploadState.value = 'uploading'
    issues.value = []

    try {
      const ticket: StoryUploadTicket = await options.api.createUploadTicket(request)

      await options.api.uploadReference(ticket, file, controller.signal)

      if (currentRun !== runId || controller.signal.aborted) {
        return
      }

      reference.value = {
        fileName: file.name,
        contentType: request.contentType,
        sizeBytes: file.size,
        fileUrl: ticket.fileUrl,
        expiresAt: ticket.expiresAt,
      }
      revokeObjectUrl(pendingPreviewUrl)
      pendingFile = null
      pendingPreviewUrl = null
      abortController = null
      uploadState.value = 'idle'
    } catch (error) {
      if (currentRun !== runId || controller.signal.aborted) {
        return
      }

      const clientError = toStoryApiClientError(error)

      issues.value = [
        {
          code: clientError.code,
          message: clientError.message,
          retryable: clientError.retryable,
        },
      ]
      uploadState.value = 'error'
    }
  }

  async function selectFile(file: File): Promise<void> {
    if (uploadState.value === 'uploading') {
      return
    }

    const issue = validateStoryReferenceFile(file)

    if (issue) {
      issues.value = [issue]
      return
    }

    const request = buildUploadRequest(file)

    if (!request) {
      issues.value = [
        {
          code: 'unsupported-reference-type',
          message: 'Formato no admitido. Usa PNG, JPG o WebP.',
          retryable: false,
        },
      ]
      return
    }

    abortController?.abort()
    revokeObjectUrl(pendingPreviewUrl)
    reference.value = null
    pendingFile = file
    pendingPreviewUrl = createObjectUrl(file)
    issues.value = []

    await runUpload(file, request)
  }

  async function retryUpload(): Promise<void> {
    if (uploadState.value === 'uploading' || !pendingFile) {
      return
    }

    const file = pendingFile
    const request = buildUploadRequest(file)

    if (!request) {
      return
    }

    await runUpload(file, request)
  }

  function removeReference(): void {
    runId += 1
    discardReference()
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      runId += 1
      discardReference()
    })
  }

  return {
    reference,
    uploadState,
    issues,
    selectFile,
    removeReference,
    retryUpload,
    clearIssues,
  }
}
