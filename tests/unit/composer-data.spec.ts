// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPOSER_DEFAULT_DURATION_SECONDS,
  COMPOSER_DEFAULT_PRESET,
  COMPOSER_DURATIONS,
  COMPOSER_FILE_ACCEPT,
  COMPOSER_GENERATION_ERROR_MESSAGE,
  COMPOSER_IMAGE_MIME_TYPES,
  COMPOSER_MAX_IMAGE_BYTES,
  COMPOSER_MAX_PROMPT_LENGTH,
  COMPOSER_MAX_REFERENCES,
  COMPOSER_MODELS,
  COMPOSER_PRESETS,
  COMPOSER_UPLOAD_ERROR_MESSAGE,
  COMPOSER_UPLOAD_EXPIRED_MESSAGE,
} from '~/data/composer'

const ROOT = process.cwd()

describe('composer presets', () => {
  it('declares exactly Rápido and Calidad in order', () => {
    expect(COMPOSER_PRESETS).toEqual([
      {
        preset: 'fast',
        modelId: 'minimax-hailuo-02',
        label: 'Rápido',
        description: 'Menos espera, ideal para probar.',
        durations: [6, 10],
        defaultDurationSeconds: 6,
      },
      {
        preset: 'quality',
        modelId: 'kling-2.5-turbo-pro',
        label: 'Calidad',
        description: 'Más detalle y movimiento, tarda más.',
        durations: [5, 10],
        defaultDurationSeconds: 5,
      },
    ])
  })

  it('exposes one model capability per preset with one-image support', () => {
    expect(COMPOSER_MODELS).toHaveLength(2)

    expect(COMPOSER_MODELS[0]).toMatchObject({
      id: 'minimax-hailuo-02',
      preset: 'fast',
      label: 'MiniMax Hailuo 02',
      durations: [6, 10],
      defaultDurationSeconds: 6,
      supportsImageReference: true,
      maxReferenceCount: 1,
      estimatedCostUsd: null,
    })
    expect(COMPOSER_MODELS[1]).toMatchObject({
      id: 'kling-2.5-turbo-pro',
      preset: 'quality',
      label: 'Kling 2.5 Turbo Pro',
      durations: [5, 10],
      defaultDurationSeconds: 5,
      supportsImageReference: true,
      maxReferenceCount: 1,
      estimatedCostUsd: null,
    })

    for (const model of COMPOSER_MODELS) {
      expect(model.estimatedLatencySeconds.min).toBeGreaterThan(0)
      expect(model.estimatedLatencySeconds.max).toBeGreaterThan(
        model.estimatedLatencySeconds.min,
      )
    }
  })

  it('declares the fast/6 s defaults and the global duration list', () => {
    expect(COMPOSER_DEFAULT_PRESET).toBe('fast')
    expect(COMPOSER_DEFAULT_DURATION_SECONDS).toBe(6)
    expect(COMPOSER_DURATIONS).toEqual([5, 6, 10])
  })
})

describe('composer limits and copy', () => {
  it('declares the normative prompt and image limits', () => {
    expect(COMPOSER_MAX_PROMPT_LENGTH).toBe(280)
    expect(COMPOSER_MAX_IMAGE_BYTES).toBe(8_388_608)
    expect(COMPOSER_MAX_REFERENCES).toBe(1)
  })

  it('accepts only the three image MIME types', () => {
    expect(COMPOSER_IMAGE_MIME_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
    ])
    expect(COMPOSER_FILE_ACCEPT).toBe('image/png,image/jpeg,image/webp')
  })

  it('declares the exact client error copy', () => {
    expect(COMPOSER_GENERATION_ERROR_MESSAGE).toBe(
      'No se pudo iniciar la generación. Inténtalo de nuevo.',
    )
    expect(COMPOSER_UPLOAD_ERROR_MESSAGE).toBe(
      'No se pudo subir la imagen. Inténtalo de nuevo.',
    )
    expect(COMPOSER_UPLOAD_EXPIRED_MESSAGE).toBe(
      'La subida ha caducado. Vuelve a seleccionar la imagen.',
    )
  })
})

describe('retired mock contract', () => {
  it('does not ship mock composer posters or exports', () => {
    expect(existsSync(resolve(ROOT, 'public/mock/composer'))).toBe(false)

    const source = readFileSync(resolve(ROOT, 'app/data/composer.ts'), 'utf8')
    expect(source).not.toMatch(/COMPOSER_POSTERS|COMPOSER_TITLES|COMPOSER_STAGE_TIMELINE/)
    expect(source).not.toMatch(/COMPOSER_MAX_VIDEO_BYTES|COMPOSER_VIDEO_MIME_TYPES/)
    expect(source).not.toMatch(/COMPOSER_READY_DELAY_MS/)
  })

  it('does not expose Fal endpoints from the client data file', () => {
    const source = readFileSync(resolve(ROOT, 'app/data/composer.ts'), 'utf8')

    expect(source).not.toMatch(/fal-ai\//)
    expect(source).not.toMatch(/queue\.fal\.run|fal\.run|rest\.fal\.ai/)
    expect(source).not.toMatch(/endpointId/)
  })
})
