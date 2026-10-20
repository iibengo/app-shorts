import { describe, expect, it } from 'vitest'
import {
  COMPOSER_MAX_IMAGE_BYTES,
  COMPOSER_MAX_PROMPT_LENGTH,
} from '~/data/composer'
import {
  COMPOSER_JOB_STAGES,
  buildComposerGenerationRequest,
  composerStageLabel,
  formatComposerDuration,
  formatComposerReference,
  formatElapsedSeconds,
  formatFileSize,
  getComposerDurations,
  getComposerModel,
  getComposerPreset,
  isComposerDurationAllowed,
  isComposerImageMimeType,
  normalizeComposerMimeType,
  normalizeComposerPrompt,
  resolveComposerDuration,
  validateComposerPrompt,
  validateReferenceFile,
} from '~/utils/composer'

describe('prompt helpers', () => {
  it('normalises with NFC and trims without collapsing newlines', () => {
    expect(normalizeComposerPrompt('  Cafe\u0301\nlinea  ')).toBe('Café\nlinea')
  })

  it('rejects an empty prompt with the exact copy', () => {
    for (const prompt of ['', '   ', '\n\t ']) {
      expect(validateComposerPrompt(prompt)).toEqual({
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

  it('measures the limit after trimming', () => {
    expect(validateComposerPrompt(`  ${'a'.repeat(280)}  `)).toBeNull()
  })

  it('rejects control characters but allows newlines and tabs', () => {
    expect(validateComposerPrompt('Idea\ncon\tsalto')).toBeNull()
    expect(validateComposerPrompt('Idea\u0000')).toEqual({
      code: 'invalid-prompt',
      field: 'prompt',
      message: 'La idea contiene caracteres no admitidos.',
    })
  })

  it('counts emoji with String.length like maxlength', () => {
    const emoji = '😀'
    expect(emoji.length).toBe(2)
    expect(validateComposerPrompt(emoji)).toBeNull()
  })
})

describe('MIME and reference validation', () => {
  it('normalises MIME parameters and casing', () => {
    expect(normalizeComposerMimeType(' image/PNG ; charset=binary')).toBe('image/png')
    expect(normalizeComposerMimeType('')).toBe('')
  })

  it('recognises only PNG, JPEG and WebP', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(isComposerImageMimeType(mime)).toBe(true)
    }

    for (const mime of ['image/gif', 'image/svg+xml', 'video/mp4', 'text/plain', '']) {
      expect(isComposerImageMimeType(mime)).toBe(false)
    }
  })

  it('rejects empty files before checking the type', () => {
    expect(validateReferenceFile({ name: 'empty.png', type: 'image/png', size: 0 })).toEqual({
      code: 'reference-empty',
      field: 'reference',
      message: 'El archivo está vacío.',
    })
  })

  it('rejects unknown MIME types without guessing from the extension', () => {
    expect(
      validateReferenceFile({ name: 'foto.png', type: 'application/octet-stream', size: 10 }),
    ).toEqual({
      code: 'unsupported-reference-type',
      field: 'reference',
      message: 'Formato no admitido. Usa PNG, JPG o WebP.',
    })
  })

  it('accepts the exact byte limit and rejects one byte more', () => {
    expect(validateReferenceFile({
      name: 'limite.png',
      type: 'image/png',
      size: COMPOSER_MAX_IMAGE_BYTES,
    })).toBeNull()

    expect(validateReferenceFile({
      name: 'grande.png',
      type: 'image/png',
      size: COMPOSER_MAX_IMAGE_BYTES + 1,
    })).toEqual({
      code: 'reference-too-large',
      field: 'reference',
      message: 'La imagen supera el máximo de 8 MB.',
    })
  })

  it('normalises MIME parameters before checking the file', () => {
    expect(validateReferenceFile({
      name: 'foto.png',
      type: 'image/png; charset=binary',
      size: COMPOSER_MAX_IMAGE_BYTES,
    })).toBeNull()
  })
})

describe('formatting helpers', () => {
  it('formats bytes, kilobytes and mebibytes with a Spanish decimal comma', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1023)).toBe('1023 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1537)).toBe('2 KB')
    expect(formatFileSize(1_048_576)).toBe('1 MB')
    expect(formatFileSize(7_864_320)).toBe('7,5 MB')
    expect(formatFileSize(COMPOSER_MAX_IMAGE_BYTES)).toBe('8 MB')
  })

  it('formats durations as m:ss', () => {
    expect(formatComposerDuration(5)).toBe('0:05')
    expect(formatComposerDuration(6)).toBe('0:06')
    expect(formatComposerDuration(10)).toBe('0:10')
    expect(formatComposerDuration(62)).toBe('1:02')
    expect(formatComposerDuration(-1)).toBe('0:00')
    expect(formatElapsedSeconds(67)).toBe('1:07')
  })

  it('formats the reference count with the exact copy', () => {
    expect(formatComposerReference(0)).toBe('Sin referencia')
    expect(formatComposerReference(1)).toBe('1 imagen')
  })

  it('maps the four real stages to their labels', () => {
    expect(COMPOSER_JOB_STAGES).toEqual(['keyframe', 'queued', 'video', 'finalizing'])
    expect(composerStageLabel('keyframe')).toBe('Creando el fotograma base')
    expect(composerStageLabel('queued')).toBe('En cola')
    expect(composerStageLabel('video')).toBe('Generando el vídeo')
    expect(composerStageLabel('finalizing')).toBe('Preparando el resultado')
  })
})

describe('preset and model helpers', () => {
  it('returns the preset definitions and durations', () => {
    expect(getComposerPreset('fast').label).toBe('Rápido')
    expect(getComposerPreset('quality').label).toBe('Calidad')
    expect(getComposerDurations('fast')).toEqual([6, 10])
    expect(getComposerDurations('quality')).toEqual([5, 10])
  })

  it('returns the display model for each preset', () => {
    expect(getComposerModel('fast').label).toBe('MiniMax Hailuo 02')
    expect(getComposerModel('quality').label).toBe('Kling 2.5 Turbo Pro')
  })

  it('validates and resolves durations per preset', () => {
    expect(isComposerDurationAllowed('fast', 6)).toBe(true)
    expect(isComposerDurationAllowed('fast', 5)).toBe(false)
    expect(isComposerDurationAllowed('quality', 5)).toBe(true)
    expect(resolveComposerDuration('fast', 10)).toBe(10)
    expect(resolveComposerDuration('fast', 5)).toBe(6)
    expect(resolveComposerDuration('quality', 6)).toBe(5)
  })
})

describe('buildComposerGenerationRequest', () => {
  it('normalises the prompt and keeps the selected preset, duration and reference', () => {
    expect(buildComposerGenerationRequest(
      '  Un short\nsobre luz  ',
      'quality',
      10,
      'https://v3.fal.media/files/test/ref.webp',
    )).toEqual({
      prompt: 'Un short\nsobre luz',
      preset: 'quality',
      durationSeconds: 10,
      referenceUrl: 'https://v3.fal.media/files/test/ref.webp',
    })
  })

  it('resolves an invalid duration to the preset default', () => {
    expect(buildComposerGenerationRequest('Idea', 'quality', 6, null)).toEqual({
      prompt: 'Idea',
      preset: 'quality',
      durationSeconds: 5,
      referenceUrl: null,
    })
  })
})
