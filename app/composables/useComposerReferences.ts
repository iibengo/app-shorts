import {
  getCurrentInstance,
  onBeforeUnmount,
  ref,
  type Ref,
} from 'vue'
import type {
  ComposerImageMimeType,
  ComposerReference,
  ComposerReferenceId,
  ComposerReferenceUploadRequest,
  ComposerUploadTicket,
  ComposerValidationIssue,
} from '~/models/composer'
import {
  isComposerImageMimeType,
  normalizeComposerMimeType,
  validateReferenceFile,
} from '~/utils/composer'
import type { ComposerApi } from './useComposerApi'
import { toComposerApiClientError } from './useComposerApi'

export type ComposerUploadState = 'idle' | 'uploading' | 'error'

export interface UseComposerReferencesOptions {
  readonly api: ComposerApi
}

export interface UseComposerReferencesReturn {
  reference: Ref<ComposerReference | null>
  uploadState: Ref<ComposerUploadState>
  issues: Ref<ComposerValidationIssue[]>
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
    // Revoking a stale object URL must never break the composer flow.
  }
}

export function useComposerReferences(
  options: UseComposerReferencesOptions,
): UseComposerReferencesReturn {
  const reference = ref<ComposerReference | null>(null)
  const uploadState = ref<ComposerUploadState>('idle')
  const issues = ref<ComposerValidationIssue[]>([])

  let pendingFile: File | null = null
  let pendingPreviewUrl: string | null = null
  let abortController: AbortController | null = null
  let nextReferenceNumber = 1
  let runId = 0

  function clearIssues(): void {
    issues.value = []
  }

  function discardReference(): void {
    abortController?.abort()
    abortController = null
    revokeObjectUrl(reference.value?.previewUrl ?? pendingPreviewUrl)
    revokeObjectUrl(pendingPreviewUrl)
    reference.value = null
    pendingFile = null
    pendingPreviewUrl = null
    uploadState.value = 'idle'
    issues.value = []
  }

  function buildUploadRequest(file: File): ComposerReferenceUploadRequest | null {
    const mimeType = normalizeComposerMimeType(file.type)

    if (!isComposerImageMimeType(mimeType)) {
      return null
    }

    return {
      fileName: file.name,
      contentType: mimeType as ComposerImageMimeType,
      sizeBytes: file.size,
    }
  }

  async function uploadOnce(
    request: ComposerReferenceUploadRequest,
    file: File,
    signal: AbortSignal,
  ): Promise<ComposerUploadTicket> {
    const ticket = await options.api.createUploadTicket(request)

    try {
      await options.api.uploadReference(ticket, file, signal)

      return ticket
    } catch (error) {
      if (signal.aborted) {
        throw error
      }

      const clientError = toComposerApiClientError(error)
      const ticketExpired = Date.parse(ticket.expiresAt) <= Date.now()
      const shouldRenewTicket = ticketExpired || clientError.status === 403

      if (shouldRenewTicket) {
        const freshTicket = await options.api.createUploadTicket(request)
        await options.api.uploadReference(freshTicket, file, signal)

        return freshTicket
      }

      await options.api.uploadReference(ticket, file, signal)

      return ticket
    }
  }

  async function runUpload(
    file: File,
    previewUrl: string | null,
    request: ComposerReferenceUploadRequest,
  ): Promise<void> {
    const currentRun = ++runId
    const controller = new AbortController()

    abortController = controller
    uploadState.value = 'uploading'
    issues.value = []

    try {
      const ticket = await uploadOnce(request, file, controller.signal)

      if (currentRun !== runId || controller.signal.aborted) {
        return
      }

      const id = `ref-${nextReferenceNumber}` as ComposerReferenceId
      nextReferenceNumber += 1

      reference.value = {
        id,
        fileName: file.name,
        mimeType: request.contentType,
        sizeBytes: file.size,
        fileUrl: ticket.fileUrl,
        previewUrl,
        width: null,
        height: null,
        expiresAt: ticket.expiresAt,
      }
      pendingFile = null
      pendingPreviewUrl = null
      abortController = null
      uploadState.value = 'idle'
    } catch {
      if (currentRun !== runId || controller.signal.aborted) {
        return
      }

      uploadState.value = 'error'
    }
  }

  async function selectFile(file: File): Promise<void> {
    if (uploadState.value === 'uploading') {
      return
    }

    const issue = validateReferenceFile(file)

    if (issue) {
      issues.value = [issue]
      return
    }

    const request = buildUploadRequest(file)

    if (!request) {
      issues.value = [
        {
          code: 'unsupported-reference-type',
          field: 'reference',
          message: 'Formato no admitido. Usa PNG, JPG o WebP.',
        },
      ]
      return
    }

    abortController?.abort()
    revokeObjectUrl(reference.value?.previewUrl ?? null)
    revokeObjectUrl(pendingPreviewUrl)
    reference.value = null
    pendingFile = file
    pendingPreviewUrl = createObjectUrl(file)
    issues.value = []

    await runUpload(file, pendingPreviewUrl, request)
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

    await runUpload(file, pendingPreviewUrl, request)
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
