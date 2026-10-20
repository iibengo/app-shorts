import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue'
import {
  COMPOSER_MAX_REFERENCES,
} from '~/data/composer'
import type {
  ComposerReference,
  ComposerReferenceId,
  ComposerReferenceMimeType,
  ComposerValidationIssue,
} from '~/models/composer'
import {
  getReferenceKind,
  isComposerReferenceMimeType,
  normalizeComposerMimeType,
  validateReferenceFile,
} from '~/utils/composer'

export interface UseComposerReferencesReturn {
  references: Ref<ComposerReference[]>
  issues: Ref<ComposerValidationIssue[]>
  canAddMore: ComputedRef<boolean>
  addFiles: (files: readonly File[]) => void
  removeReference: (id: ComposerReferenceId) => void
  clearReferences: () => void
  clearIssues: () => void
}

function dedupeIssues(
  source: readonly ComposerValidationIssue[],
): ComposerValidationIssue[] {
  const byCode = new Map<string, ComposerValidationIssue>()

  for (const issue of source) {
    if (!byCode.has(issue.code)) {
      byCode.set(issue.code, issue)
    }
  }

  return [...byCode.values()]
}

function createThumbnail(file: File): string | null {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null
  }

  try {
    return URL.createObjectURL(file)
  } catch {
    return null
  }
}

function revokeThumbnail(url: string | null): void {
  if (!url) return
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return

  try {
    URL.revokeObjectURL(url)
  } catch {
    // A failed revocation must never break the composer flow.
  }
}

export function useComposerReferences(): UseComposerReferencesReturn {
  const references = ref<ComposerReference[]>([])
  const issues = ref<ComposerValidationIssue[]>([])
  const files = new Map<ComposerReferenceId, File>()
  let nextReferenceNumber = 1

  const canAddMore = computed(() => references.value.length < COMPOSER_MAX_REFERENCES)

  function createReference(file: File): ComposerReference | null {
    const mimeType = normalizeComposerMimeType(file.type)

    if (!isComposerReferenceMimeType(mimeType)) {
      return null
    }

    const id = `ref-${nextReferenceNumber}` as ComposerReferenceId
    nextReferenceNumber += 1

    const kind = getReferenceKind(mimeType)
    const reference: ComposerReference = {
      id,
      kind,
      name: file.name,
      mimeType: mimeType as ComposerReferenceMimeType,
      sizeBytes: file.size,
      thumbnailUrl: kind === 'image' ? createThumbnail(file) : null,
      durationSeconds: null,
    }

    files.set(id, file)

    return reference
  }

  function addFiles(selectedFiles: readonly File[]): void {
    if (selectedFiles.length === 0) return

    const nextIssues: ComposerValidationIssue[] = []
    let reachedLimit = false

    for (const file of selectedFiles) {
      if (references.value.length >= COMPOSER_MAX_REFERENCES) {
        reachedLimit = true
        break
      }

      const issue = validateReferenceFile(file)

      if (issue) {
        nextIssues.push(issue)
        continue
      }

      const reference = createReference(file)

      if (reference) {
        references.value = [...references.value, reference]
      }
    }

    if (references.value.length >= COMPOSER_MAX_REFERENCES && reachedLimit) {
      nextIssues.push({
        code: 'references-limit',
        field: 'references',
        message: 'Puedes añadir hasta 3 referencias.',
      })
    }

    issues.value = dedupeIssues(nextIssues)
  }

  function removeReference(id: ComposerReferenceId): void {
    const reference = references.value.find((item) => item.id === id)

    if (!reference) return

    revokeThumbnail(reference.thumbnailUrl)
    files.delete(id)
    references.value = references.value.filter((item) => item.id !== id)
    // Issues describe the last selection; after a removal the limit/stale
    // messages no longer reflect the visible list.
    issues.value = []
  }

  function clearReferences(): void {
    for (const reference of references.value) {
      revokeThumbnail(reference.thumbnailUrl)
    }

    files.clear()
    references.value = []
  }

  function clearIssues(): void {
    issues.value = []
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(clearReferences)
  }

  return {
    references,
    issues,
    canAddMore,
    addFiles,
    removeReference,
    clearReferences,
    clearIssues,
  }
}
