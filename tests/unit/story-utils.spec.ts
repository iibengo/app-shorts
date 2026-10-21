import { describe, expect, it } from 'vitest'
import type { StoryScene } from '~/models/story'
import {
  canRegenerateKeyframe,
  containsStoryMarkup,
  countReadyVideos,
  formatStoryDuration,
  formatStoryElapsed,
  formatStoryFileSize,
  getStoryPreset,
  hasStoryControlCharacters,
  isStoryImageMimeType,
  isStoryMediaUrl,
  isStoryTerminal,
  normalizeStoryMimeType,
  normalizeStoryText,
  preferredPollDelay,
  sceneStatusLabel,
  storyAttemptLabel,
  storyError,
  storyModelIdForPreset,
  storyPollAfterMs,
  storyPosterUrl,
  storyReferenceLabel,
  storySceneTitle,
  storyStepForStatus,
  storyTotalDuration,
  validateStoryNarration,
  validateStoryPremise,
  validateStoryReferenceFile,
  validateStoryVisualPrompt,
} from '~/utils/story'

function scene(overrides: Partial<StoryScene> & { order: number }): StoryScene {
  return {
    id: `scene-${overrides.order}`,
    order: overrides.order,
    visualPrompt: 'Un prompt visual de prueba con longitud suficiente.',
    narration: 'Una narración breve de prueba.',
    status: 'KEYFRAME_READY',
    keyframeUrl: null,
    keyframeAttempts: 1,
    videoUrl: null,
    videoAttempts: 0,
    error: null,
    ...overrides,
  }
}

describe('story text validation helpers', () => {
  it('normalizes NFC and trims without losing inner line breaks', () => {
    expect(normalizeStoryText('  Cafe\u0301  ')).toBe('Café')
    expect(normalizeStoryText('  primera\nsegunda  ')).toBe('primera\nsegunda')
  })

  it('accepts a ten character premise and rejects shorter or empty ones', () => {
    expect(validateStoryPremise('Premisa ok')).toBeNull()
    expect(validateStoryPremise('123456789')).toMatchObject({
      code: 'premise-required',
      message: 'Escribe una premisa para crear tu historia.',
      retryable: false,
    })
    expect(validateStoryPremise('        ')).toMatchObject({ code: 'premise-required' })
  })

  it('accepts exactly 600 premise characters and rejects 601', () => {
    expect(validateStoryPremise('a'.repeat(600))).toBeNull()
    expect(validateStoryPremise('a'.repeat(601))).toMatchObject({
      code: 'premise-too-long',
      message: 'La premisa no puede superar los 600 caracteres.',
    })
  })

  it('measures an emoji with String.length', () => {
    expect('😀'.repeat(5).length).toBe(10)
    expect(validateStoryPremise('😀'.repeat(5))).toBeNull()
    expect(validateStoryPremise('😀'.repeat(4))).toMatchObject({ code: 'premise-required' })
  })

  it('allows line breaks but rejects control characters in the premise', () => {
    expect(validateStoryPremise('Una premisa\ncon salto')).toBeNull()
    expect(validateStoryPremise('Una premisa\tcon tabulador')).toBeNull()
    expect(validateStoryPremise('Una premisa\u0000rota')).toMatchObject({
      code: 'invalid-premise',
      message: 'La premisa contiene caracteres no admitidos.',
    })
  })

  it('validates visual prompt boundaries, markup and markdown', () => {
    expect(validateStoryVisualPrompt('a'.repeat(20))).toBeNull()
    expect(validateStoryVisualPrompt('a'.repeat(19))).toMatchObject({
      code: 'invalid-visual-prompt',
      message: 'El prompt visual no es válido.',
    })
    expect(validateStoryVisualPrompt('a'.repeat(601))).toMatchObject({
      code: 'invalid-visual-prompt',
    })
    expect(validateStoryVisualPrompt('<script>alert(1)</script>')).toMatchObject({
      code: 'invalid-visual-prompt',
    })
    expect(validateStoryVisualPrompt('Un prompt con `backtick` suficiente')).toMatchObject({
      code: 'invalid-visual-prompt',
    })
    expect(validateStoryVisualPrompt('Primera línea\n# Título markdown')).toMatchObject({
      code: 'invalid-visual-prompt',
    })
    expect(
      validateStoryVisualPrompt('Un prompt con # en medio y longitud más que suficiente'),
    ).toBeNull()
    expect(validateStoryVisualPrompt('Un prompt con \u0007 control y longitud suficiente'))
      .toMatchObject({ code: 'invalid-visual-prompt' })
  })

  it('validates narration boundaries, markup and collapsed lines', () => {
    expect(validateStoryNarration('a'.repeat(10))).toBeNull()
    expect(validateStoryNarration('a'.repeat(9))).toMatchObject({
      code: 'invalid-narration',
      message: 'La narración no es válida.',
    })
    expect(validateStoryNarration('a'.repeat(281))).toMatchObject({
      code: 'invalid-narration',
    })
    expect(validateStoryNarration('Una narración\ncon varias\nlíneas')).toBeNull()
    expect(validateStoryNarration('Una narración con <b>HTML</b>')).toMatchObject({
      code: 'invalid-narration',
    })
  })

  it('exposes markup and control character guards', () => {
    expect(containsStoryMarkup('<b>hola</b>')).toBe(true)
    expect(containsStoryMarkup('texto normal')).toBe(false)
    expect(hasStoryControlCharacters('texto\u0001')).toBe(true)
    expect(hasStoryControlCharacters('texto\ncon salto')).toBe(false)
  })
})

describe('story reference validation helpers', () => {
  it('normalizes mime types and accepts only png, jpeg and webp', () => {
    expect(normalizeStoryMimeType('IMAGE/PNG; charset=binary')).toBe('image/png')
    expect(normalizeStoryMimeType('')).toBe('')
    expect(isStoryImageMimeType('image/webp')).toBe(true)
    expect(isStoryImageMimeType('image/gif')).toBe(false)
  })

  it('rejects empty, unsupported and oversized reference files', () => {
    expect(validateStoryReferenceFile({ name: 'a.png', type: 'image/png', size: 0 }))
      .toMatchObject({ code: 'reference-empty' })
    expect(validateStoryReferenceFile({ name: 'a.gif', type: 'image/gif', size: 10 }))
      .toMatchObject({ code: 'unsupported-reference-type' })
    expect(validateStoryReferenceFile({
      name: 'a.png',
      type: 'image/png',
      size: 8_388_609,
    })).toMatchObject({ code: 'reference-too-large' })
    expect(validateStoryReferenceFile({
      name: 'a.png',
      type: 'image/png',
      size: 8_388_608,
    })).toBeNull()
    expect(validateStoryReferenceFile({
      name: 'a.webp',
      type: 'image/webp; charset=binary',
      size: 1_024,
    })).toBeNull()
  })
})

describe('story formatting helpers', () => {
  it('formats durations as m:ss', () => {
    expect(formatStoryDuration(24)).toBe('0:24')
    expect(formatStoryDuration(30)).toBe('0:30')
    expect(formatStoryDuration(36)).toBe('0:36')
    expect(formatStoryDuration(7)).toBe('0:07')
    expect(formatStoryDuration(62)).toBe('1:02')
    expect(formatStoryDuration(-1)).toBe('0:00')
    expect(formatStoryDuration(60.9)).toBe('1:00')
    expect(formatStoryElapsed(59)).toBe('0:59')
  })

  it('formats file sizes with comma decimals and no trailing ,0', () => {
    expect(formatStoryFileSize(0)).toBe('0 B')
    expect(formatStoryFileSize(512)).toBe('512 B')
    expect(formatStoryFileSize(1_024)).toBe('1 KB')
    expect(formatStoryFileSize(1_500)).toBe('2 KB')
    expect(formatStoryFileSize(1_048_576)).toBe('1 MB')
    expect(formatStoryFileSize(1_572_864)).toBe('1,5 MB')
    expect(formatStoryFileSize(8_388_608)).toBe('8 MB')
    expect(formatStoryFileSize(-5)).toBe('0 B')
  })

  it('formats scene titles and attempt labels', () => {
    expect(storySceneTitle(3, 5)).toBe('Escena 3 de 5')
    expect(storyAttemptLabel(0)).toBe('Imagen 1 de 2')
    expect(storyAttemptLabel(1)).toBe('Imagen 1 de 2')
    expect(storyAttemptLabel(2)).toBe('Imagen 2 de 2')
    expect(storyAttemptLabel(9)).toBe('Imagen 2 de 2')
  })
})

describe('story status, preset and scene helpers', () => {
  it('maps presets to models and back', () => {
    expect(storyModelIdForPreset('fast')).toBe('minimax-hailuo-02')
    expect(storyModelIdForPreset('quality')).toBe('kling-2.5-turbo-pro')
    expect(getStoryPreset('fast').label).toBe('Rápido')
    expect(getStoryPreset('quality').label).toBe('Calidad')
    expect(getStoryPreset('quality').modelId).toBe('kling-2.5-turbo-pro')
  })

  it('derives the total duration from the scene count', () => {
    expect(storyTotalDuration(4)).toBe(24)
    expect(storyTotalDuration(5)).toBe(30)
    expect(storyTotalDuration(6)).toBe(36)
  })

  it('knows terminal statuses and poll delays', () => {
    expect(isStoryTerminal('READY')).toBe(true)
    expect(isStoryTerminal('FAILED')).toBe(true)
    expect(isStoryTerminal('CANCELLED')).toBe(true)
    expect(isStoryTerminal('ASSEMBLING')).toBe(false)
    expect(storyPollAfterMs('READY')).toBe(0)
    expect(storyPollAfterMs('FAILED')).toBe(0)
    expect(storyPollAfterMs('WAITING_APPROVAL')).toBe(2_500)
  })

  it('maps every story status to a stepper step', () => {
    expect(storyStepForStatus('PLANNING')).toBe('plan')
    expect(storyStepForStatus('GENERATING_KEYFRAMES')).toBe('images')
    expect(storyStepForStatus('WAITING_APPROVAL')).toBe('images')
    expect(storyStepForStatus('GENERATING_VIDEOS')).toBe('videos')
    expect(storyStepForStatus('VIDEOS_READY')).toBe('videos')
    expect(storyStepForStatus('ASSEMBLING')).toBe('plan')
    expect(storyStepForStatus('READY')).toBe('result')
    expect(storyStepForStatus('FAILED')).toBe('plan')
    expect(storyStepForStatus('CANCELLED')).toBe('plan')
  })

  it('maps every scene status to a Spanish label', () => {
    expect(sceneStatusLabel('PENDING')).toBe('Pendiente')
    expect(sceneStatusLabel('KEYFRAME_QUEUED')).toBe('En cola')
    expect(sceneStatusLabel('KEYFRAME_RUNNING')).toBe('Generando imagen')
    expect(sceneStatusLabel('KEYFRAME_READY')).toBe('Imagen lista')
    expect(sceneStatusLabel('KEYFRAME_FAILED')).toBe('Imagen fallida')
    expect(sceneStatusLabel('VIDEO_QUEUED')).toBe('En cola')
    expect(sceneStatusLabel('VIDEO_RUNNING')).toBe('Generando vídeo')
    expect(sceneStatusLabel('VIDEO_READY')).toBe('Vídeo listo')
    expect(sceneStatusLabel('VIDEO_FAILED')).toBe('Vídeo fallido')
    expect(sceneStatusLabel('CANCELLED')).toBe('Cancelada')
  })

  it('counts ready videos and only allows regeneration with attempts left', () => {
    const scenes = [
      scene({ order: 1, status: 'VIDEO_READY' }),
      scene({ order: 2, status: 'VIDEO_READY' }),
      scene({ order: 3, status: 'VIDEO_RUNNING' }),
      scene({ order: 4, status: 'VIDEO_FAILED' }),
    ]

    expect(countReadyVideos(scenes)).toBe(2)
    expect(canRegenerateKeyframe(scene({ order: 1, keyframeAttempts: 1 }))).toBe(true)
    expect(canRegenerateKeyframe(scene({ order: 1, keyframeAttempts: 2 }))).toBe(false)
    expect(
      canRegenerateKeyframe(scene({ order: 1, status: 'PENDING', keyframeAttempts: 0 })),
    ).toBe(false)
    expect(
      canRegenerateKeyframe(scene({ order: 1, status: 'KEYFRAME_FAILED', keyframeAttempts: 1 })),
    ).toBe(true)
  })

  it('labels references and builds recoverable error objects', () => {
    expect(storyReferenceLabel(null)).toBe('Sin referencia')
    expect(storyReferenceLabel('https://v3.fal.media/files/a.png')).toBe('1 imagen')
    expect(storyError('rate-limited', 'Mensaje', true)).toEqual({
      code: 'rate-limited',
      message: 'Mensaje',
      retryable: true,
    })
  })

  it('prefers the story poll delay within the client bounds', () => {
    expect(preferredPollDelay(undefined)).toBe(2_500)
    expect(preferredPollDelay(200)).toBe(1_000)
    expect(preferredPollDelay(2_500)).toBe(2_500)
    expect(preferredPollDelay(60_000)).toBe(10_000)
  })
})

describe('story media allowlist helpers', () => {
  it('accepts only https Fal CDN URLs without credentials, hash or custom port', () => {
    expect(isStoryMediaUrl('https://v3.fal.media/files/a.png')).toBe(true)
    expect(isStoryMediaUrl('https://v3b.fal.media/files/a.png')).toBe(true)
    expect(isStoryMediaUrl('https://fal.media/files/a.png')).toBe(true)
    expect(isStoryMediaUrl('https://v3.fal.media:443/files/a.png')).toBe(true)
    expect(isStoryMediaUrl('http://v3.fal.media/files/a.png')).toBe(false)
    expect(isStoryMediaUrl('https://evil.example/files/a.png')).toBe(false)
    expect(isStoryMediaUrl('https://user:pass@v3.fal.media/a.png')).toBe(false)
    expect(isStoryMediaUrl('https://v3.fal.media/a.png#fragment')).toBe(false)
    expect(isStoryMediaUrl('https://v3.fal.media:8443/a.png')).toBe(false)
    expect(isStoryMediaUrl('not a url')).toBe(false)
    expect(isStoryMediaUrl(null)).toBe(false)
    expect(isStoryMediaUrl(undefined)).toBe(false)
  })

  it('uses the first ordered keyframe as the poster only when allowlisted', () => {
    expect(
      storyPosterUrl([
        scene({ order: 2, keyframeUrl: 'https://v3.fal.media/files/two.png' }),
        scene({ order: 1, keyframeUrl: 'https://v3.fal.media/files/one.png' }),
      ]),
    ).toBe('https://v3.fal.media/files/one.png')

    expect(
      storyPosterUrl([scene({ order: 1, keyframeUrl: 'https://evil.example/one.png' })]),
    ).toBeNull()
    expect(storyPosterUrl([])).toBeNull()
  })
})
