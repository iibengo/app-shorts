import { describe, expect, it } from 'vitest'
import {
  COMPOSER_MAX_DURATION_SECONDS,
  COMPOSER_MAX_IMAGE_BYTES,
  COMPOSER_MAX_PROMPT_LENGTH,
  COMPOSER_MAX_VIDEO_BYTES,
  COMPOSER_MIN_DURATION_SECONDS,
  COMPOSER_POSTERS,
  COMPOSER_TITLES,
} from '~/data/composer'
import type {
  ComposerReference,
  ComposerReferenceMimeType,
} from '~/models/composer'
import {
  buildComposerGenerationRequest,
  buildGeneratedShortPreview,
  composerStageLabel,
  fnv1a32,
  formatFileSize,
  formatReferenceCount,
  getReferenceKind,
  isComposerReferenceMimeType,
  normalizeComposerMimeType,
  normalizeComposerPrompt,
  validateComposerPrompt,
  validateReferenceFile,
} from '~/utils/composer'

const IMAGE_REFERENCE: ComposerReference = {
  id: 'ref-1',
  kind: 'image',
  name: 'foto.png',
  mimeType: 'image/png',
  sizeBytes: 2048,
  thumbnailUrl: 'blob:foto',
  durationSeconds: null,
}

const VIDEO_REFERENCE: ComposerReference = {
  id: 'ref-2',
  kind: 'video',
  name: 'clip.mp4',
  mimeType: 'video/mp4',
  sizeBytes: 4096,
  thumbnailUrl: null,
  durationSeconds: null,
}

function signature(prompt: string, references: readonly ComposerReferenceSignature[] = []) {
  return JSON.stringify([
    normalizeComposerPrompt(prompt).replace(/\s+/g, ' ').toLowerCase(),
    references.map((reference) => [
      reference.kind,
      reference.name,
      reference.sizeBytes,
    ]),
  ])
}

describe('normalizeComposerPrompt / validateComposerPrompt', () => {
  it('trims and applies NFC without collapsing inner newlines', () => {
    const decomposed = '  Cafe\u0301\nlinea  '
    expect(normalizeComposerPrompt(decomposed)).toBe('Café\nlinea')
  })

  it('rejects an empty or whitespace-only prompt with the exact copy', () => {
    for (const prompt of ['', '   ', '\n\t ']) {
      const issue = validateComposerPrompt(prompt)
      expect(issue).toEqual({
        code: 'prompt-required',
        field: 'prompt',
        message: 'Escribe una idea para generar tu short.',
      })
    }
  })

  it('accepts exactly 280 characters and rejects 281', () => {
    expect(validateComposerPrompt('a'.repeat(COMPOSER_MAX_PROMPT_LENGTH))).toBeNull()

    expect(validateComposerPrompt('a'.repeat(COMPOSER_MAX_PROMPT_LENGTH + 1))).toEqual({
      code: 'prompt-too-long',
      field: 'prompt',
      message: 'La idea no puede superar los 280 caracteres.',
    })
  })

  it('measures the limit after trimming, not on raw padding', () => {
    expect(validateComposerPrompt(`  ${'a'.repeat(280)}  `)).toBeNull()
  })
})

describe('MIME normalisation and reference validation', () => {
  it('normalizes MIME parameters and casing', () => {
    expect(normalizeComposerMimeType(' image/PNG ; charset=binary')).toBe('image/png')
    expect(normalizeComposerMimeType('video/mp4')).toBe('video/mp4')
    expect(normalizeComposerMimeType('')).toBe('')
  })

  it('recognises only the normative MIME types', () => {
    for (const mime of [
      'image/png',
      'image/jpeg',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ] as const) {
      expect(isComposerReferenceMimeType(mime)).toBe(true)
    }

    for (const mime of ['image/gif', 'video/avi', 'image/svg+xml', 'text/plain', '']) {
      expect(isComposerReferenceMimeType(mime)).toBe(false)
    }
  })

  it('derives the reference kind from the normalized MIME', () => {
    expect(getReferenceKind('image/png')).toBe('image')
    expect(getReferenceKind('image/webp; charset=binary')).toBe('image')
    expect(getReferenceKind('video/quicktime')).toBe('video')
  })

  it('rejects empty files before checking the type', () => {
    expect(validateReferenceFile({ name: 'empty.png', type: 'image/png', size: 0 })).toEqual({
      code: 'reference-empty',
      field: 'references',
      message: 'El archivo está vacío.',
    })
  })

  it('rejects unknown MIME types without guessing from the extension', () => {
    expect(
      validateReferenceFile({ name: 'foto.png', type: 'application/octet-stream', size: 10 }),
    ).toEqual({
      code: 'reference-type',
      field: 'references',
      message: 'Formato no admitido. Usa PNG, JPG, WebP, MP4, WebM o MOV.',
    })
  })

  it('accepts the exact image byte limit and rejects one byte more', () => {
    expect(
      validateReferenceFile({
        name: 'limite.png',
        type: 'image/png',
        size: COMPOSER_MAX_IMAGE_BYTES,
      }),
    ).toBeNull()

    expect(
      validateReferenceFile({
        name: 'grande.png',
        type: 'image/png',
        size: COMPOSER_MAX_IMAGE_BYTES + 1,
      }),
    ).toEqual({
      code: 'reference-too-large',
      field: 'references',
      message: 'La imagen supera el máximo de 8 MB.',
    })
  })

  it('accepts the exact video byte limit and rejects one byte more', () => {
    expect(
      validateReferenceFile({
        name: 'limite.mp4',
        type: 'video/mp4',
        size: COMPOSER_MAX_VIDEO_BYTES,
      }),
    ).toBeNull()

    expect(
      validateReferenceFile({
        name: 'grande.mp4',
        type: 'video/mp4',
        size: COMPOSER_MAX_VIDEO_BYTES + 1,
      }),
    ).toEqual({
      code: 'reference-too-large',
      field: 'references',
      message: 'El vídeo supera el máximo de 50 MB.',
    })
  })

  it('normalizes MIME parameters before validating size limits', () => {
    const file = {
      name: 'foto.png',
      type: 'image/png; charset=binary',
      size: COMPOSER_MAX_IMAGE_BYTES,
    }

    expect(validateReferenceFile(file)).toBeNull()
  })
})

describe('formatFileSize', () => {
  it('formats bytes, kilobytes and mebibytes with Spanish decimal comma', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1023)).toBe('1023 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1537)).toBe('2 KB')
    expect(formatFileSize(1_048_576)).toBe('1 MB')
    expect(formatFileSize(7_864_320)).toBe('7,5 MB')
    expect(formatFileSize(COMPOSER_MAX_IMAGE_BYTES)).toBe('8 MB')
  })
})

describe('formatReferenceCount / composerStageLabel', () => {
  it('uses singular for one reference and plural otherwise', () => {
    expect(formatReferenceCount(0)).toBe('0 referencias')
    expect(formatReferenceCount(1)).toBe('1 referencia')
    expect(formatReferenceCount(2)).toBe('2 referencias')
    expect(formatReferenceCount(3)).toBe('3 referencias')
  })

  it('maps every stage to the normative label', () => {
    expect(composerStageLabel('analyzing')).toBe('Analizando tu idea')
    expect(composerStageLabel('composing')).toBe('Componiendo la escena')
    expect(composerStageLabel('rendering')).toBe('Preparando la vista previa')
  })
})

describe('fnv1a32', () => {
  it('matches the canonical FNV-1a 32-bit value for "hello"', () => {
    expect(fnv1a32('hello')).toBe(0x4f9f2cab)
  })

  it('is stable across repeated calls and returns an unsigned 32-bit integer', () => {
    const first = fnv1a32('Un short sobre luz natural')
    const second = fnv1a32('Un short sobre luz natural')

    expect(first).toBe(second)
    expect(Number.isInteger(first)).toBe(true)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('buildComposerGenerationRequest', () => {
  it('freezes the display prompt, ordered signatures and attempt', () => {
    const request = buildComposerGenerationRequest(
      '  Idea\ncon salto  ',
      [IMAGE_REFERENCE, VIDEO_REFERENCE],
      2,
    )

    expect(request).toEqual({
      prompt: 'Idea\ncon salto',
      references: [
        { kind: 'image', name: 'foto.png', sizeBytes: 2048 },
        { kind: 'video', name: 'clip.mp4', sizeBytes: 4096 },
      ],
      attempt: 2,
    })
  })

  it('clamps non-positive or fractional attempts to an integer >= 1', () => {
    expect(buildComposerGenerationRequest('Idea', [], 0).attempt).toBe(1)
    expect(buildComposerGenerationRequest('Idea', [], 3.9).attempt).toBe(3)
  })
})

describe('buildGeneratedShortPreview determinism', () => {
  it('produces the same preview for the same prompt, references and attempt', () => {
    const request = buildComposerGenerationRequest(
      'Un short sobre luz natural',
      [IMAGE_REFERENCE],
      1,
    )

    const first = buildGeneratedShortPreview(request)
    const second = buildGeneratedShortPreview(request)

    expect(second).toEqual(first)
  })

  it('normalises case, surrounding whitespace and repeated spaces in the signature', () => {
    const first = buildGeneratedShortPreview(
      buildComposerGenerationRequest('  Un   Short  sobre Luz  ', [], 1),
    )
    const second = buildGeneratedShortPreview(
      buildComposerGenerationRequest('un short sobre luz', [], 1),
    )

    expect(second.id).toBe(first.id)
    expect(second.title).toBe(first.title)
    expect(second.poster).toEqual(first.poster)
    expect(second.durationSeconds).toBe(first.durationSeconds)
  })

  it('honours the normative index, duration and id algorithm', () => {
    const request = buildComposerGenerationRequest('Idea determinista', [], 1)
    const baseHash = fnv1a32(signature('Idea determinista'))
    const attempt = 1
    const preview = buildGeneratedShortPreview(request)

    expect(preview.id).toBe(
      `preview-${baseHash.toString(16).padStart(8, '0')}-${attempt}`,
    )
    expect(preview.title).toBe(COMPOSER_TITLES[(baseHash + (attempt - 1) * 3) % 4])
    expect(preview.poster).toEqual(COMPOSER_POSTERS[(baseHash + attempt - 1) % 4])
    expect(preview.durationSeconds).toBe(
      COMPOSER_MIN_DURATION_SECONDS + ((baseHash + (attempt - 1) * 7) % 19),
    )
  })

  it('keeps the contract invariants', () => {
    const preview = buildGeneratedShortPreview(
      buildComposerGenerationRequest(
        'Idea con referencias',
        [IMAGE_REFERENCE, VIDEO_REFERENCE],
        2,
      ),
    )

    expect(preview.id).toMatch(/^preview-[0-9a-f]{8}-2$/)
    expect(COMPOSER_TITLES).toContain(preview.title)
    expect(COMPOSER_POSTERS).toContainEqual(preview.poster)
    expect(preview.poster.width).toBe(1080)
    expect(preview.poster.height).toBe(1920)
    expect(preview.durationSeconds).toBeGreaterThanOrEqual(COMPOSER_MIN_DURATION_SECONDS)
    expect(preview.durationSeconds).toBeLessThanOrEqual(COMPOSER_MAX_DURATION_SECONDS)
    expect(preview.referenceCount).toBe(2)
    expect(preview.attempt).toBe(2)
    expect(preview.prompt).toBe('Idea con referencias')
  })

  it('changes poster, title and duration when the attempt increments', () => {
    const first = buildGeneratedShortPreview(
      buildComposerGenerationRequest('Misma idea', [], 1),
    )
    const second = buildGeneratedShortPreview(
      buildComposerGenerationRequest('Misma idea', [], 2),
    )

    expect(second.id).not.toBe(first.id)
    expect(second.title).not.toBe(first.title)
    expect(second.poster.src).not.toBe(first.poster.src)
    expect(second.durationSeconds).not.toBe(first.durationSeconds)
    expect(second.attempt).toBe(2)
  })

  it('returns the same result in a fresh build for the same signature and attempt', () => {
    const prompt = 'Una idea que se mueve en vertical'

    const preview = buildGeneratedShortPreview(
      buildComposerGenerationRequest(prompt, [IMAGE_REFERENCE, VIDEO_REFERENCE], 3),
    )
    const baseHash = fnv1a32(JSON.stringify([prompt.toLowerCase(), [
      ['image', 'foto.png', 2048],
      ['video', 'clip.mp4', 4096],
    ]]))

    expect(preview.attempt).toBe(3)
    expect(preview.id).toBe(`preview-${baseHash.toString(16).padStart(8, '0')}-3`)
    expect(preview.referenceCount).toBe(2)
  })
})

describe('reference MIME typing', () => {
  it('uses the declared MIME union at compile time', () => {
    const mime: ComposerReferenceMimeType = 'video/webm'
    expect(mime).toBe('video/webm')
  })
})
