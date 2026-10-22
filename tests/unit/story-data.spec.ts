// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  STORY_CANON_LABELS,
  STORY_COPY,
  STORY_DEFAULT_MODE,
  STORY_DEFAULT_PRESET,
  STORY_DEFAULT_SCENE_COUNT,
  STORY_FILE_ACCEPT,
  STORY_IMAGE_MIME_TYPES,
  STORY_MAX_IMAGE_BYTES,
  STORY_MAX_KEYFRAME_ATTEMPTS,
  STORY_MAX_NARRATION_LENGTH,
  STORY_MAX_PREMISE_LENGTH,
  STORY_MAX_REFERENCES,
  STORY_MAX_VIDEO_ATTEMPTS,
  STORY_MAX_VISUAL_PROMPT_LENGTH,
  STORY_MIN_NARRATION_LENGTH,
  STORY_MODE_CREATIVE_NOTICE,
  STORY_MODE_DESCRIPTIONS,
  STORY_MODE_HELP,
  STORY_MODE_LABELS,
  STORY_MODES,
  STORY_MIN_PREMISE_LENGTH,
  STORY_MIN_VISUAL_PROMPT_LENGTH,
  STORY_POLL_AFTER_MS,
  STORY_PRESET_COPY,
  STORY_PRESETS,
  STORY_SCENE_COUNTS,
  STORY_SCENE_COUNT_LABELS,
  STORY_SCENE_DURATION_SECONDS,
  STORY_SCENE_LABELS,
  STORY_STEPS,
  STORY_TERMINAL_STATUSES,
  STORY_TONE_LABELS,
} from '~/data/story'
import {
  STORY_CREATE_MAX_BODY_BYTES,
  STORY_MAX_IMAGE_BYTES as SERVER_MAX_IMAGE_BYTES,
  STORY_MAX_NARRATION_LENGTH as SERVER_MAX_NARRATION_LENGTH,
  STORY_MAX_PREMISE_LENGTH as SERVER_MAX_PREMISE_LENGTH,
  STORY_MAX_VISUAL_PROMPT_LENGTH as SERVER_MAX_VISUAL_PROMPT_LENGTH,
  STORY_MIN_NARRATION_LENGTH as SERVER_MIN_NARRATION_LENGTH,
  STORY_MIN_PREMISE_LENGTH as SERVER_MIN_PREMISE_LENGTH,
  STORY_MIN_VISUAL_PROMPT_LENGTH as SERVER_MIN_VISUAL_PROMPT_LENGTH,
  STORY_REFERENCE_MAX_AGE_MS,
} from '../../server/story/validation'

const source = readFileSync(resolve(process.cwd(), 'app/data/story.ts'), 'utf8')

describe('story data constants', () => {
  it('exposes the normative limits and defaults', () => {
    expect(STORY_MIN_PREMISE_LENGTH).toBe(10)
    expect(STORY_MAX_PREMISE_LENGTH).toBe(600)
    expect(STORY_MIN_VISUAL_PROMPT_LENGTH).toBe(20)
    expect(STORY_MAX_VISUAL_PROMPT_LENGTH).toBe(600)
    expect(STORY_MIN_NARRATION_LENGTH).toBe(10)
    expect(STORY_MAX_NARRATION_LENGTH).toBe(280)
    expect(STORY_MAX_IMAGE_BYTES).toBe(8_388_608)
    expect(STORY_MAX_REFERENCES).toBe(1)
    expect(STORY_MAX_KEYFRAME_ATTEMPTS).toBe(2)
    expect(STORY_MAX_VIDEO_ATTEMPTS).toBe(2)
    expect(STORY_POLL_AFTER_MS).toBe(2_500)
    expect(STORY_SCENE_DURATION_SECONDS).toBe(6)
  })

  it('keeps the scene count options and default at 4, 5 and 6', () => {
    expect(STORY_SCENE_COUNTS).toEqual([4, 5, 6])
    expect(STORY_DEFAULT_SCENE_COUNT).toBe(5)
    expect(STORY_SCENE_COUNT_LABELS).toEqual({
      4: '4 escenas',
      5: '5 escenas',
      6: '6 escenas',
    })
  })

  it('keeps the accepted image types and file accept list stable', () => {
    expect(STORY_IMAGE_MIME_TYPES).toEqual(['image/png', 'image/jpeg', 'image/webp'])
    expect(STORY_FILE_ACCEPT).toBe('image/png,image/jpeg,image/webp')
  })

  it('keeps the preset table aligned with the server models', () => {
    expect(STORY_PRESETS).toEqual([
      {
        preset: 'fast',
        modelId: 'minimax-hailuo-02',
        label: 'Rápido',
        description: 'MiniMax Hailuo 02. Menos espera.',
      },
      {
        preset: 'quality',
        modelId: 'kling-2.5-turbo-pro',
        label: 'Calidad',
        description: 'Kling 2.5 Turbo Pro. Más detalle y coste.',
      },
    ])
    expect(STORY_DEFAULT_PRESET).toBe('fast')
    expect(STORY_PRESET_COPY).toEqual({ fast: 'Rápido', quality: 'Calidad' })
  })

  it('exposes the 007 mode and tone copy exactly', () => {
    expect(STORY_MODES).toEqual(['faithful', 'creative'])
    expect(STORY_DEFAULT_MODE).toBe('faithful')
    expect(STORY_MODE_LABELS).toEqual({
      faithful: 'Fiel a la premisa',
      creative: 'Modo creativo',
    })
    expect(STORY_MODE_DESCRIPTIONS).toEqual({
      faithful: 'Solo aparecen los personajes, lugares y objetos de tu premisa.',
      creative: 'El narrador puede añadir personajes secundarios, lugares y giros que sirvan a tu premisa.',
    })
    expect(STORY_MODE_HELP).toEqual({
      faithful: 'El guion se ciñe a lo que escribiste.',
      creative: 'Puede añadir hasta 2 personajes, 3 lugares y 4 objetos inventados. El protagonista, el tema y el conflicto salen de tu premisa.',
    })
    expect(STORY_MODE_CREATIVE_NOTICE).toBe(
      'En modo creativo pueden aparecer personajes, lugares y objetos que no están en tu premisa.',
    )
    expect(STORY_TONE_LABELS).toEqual({
      humor: 'Humor',
      aventura: 'Aventura',
      absurdo: 'Absurdo',
      heartwarming: 'Emotivo',
      dramatic: 'Dramático',
      neutral: 'Neutro',
    })
    expect(STORY_CANON_LABELS.summary).toBe('Canon de la historia')
    expect(STORY_SCENE_LABELS.locationChange).toBe('Cambio de escena')
  })

  it('keeps the four stepper steps', () => {
    expect(STORY_STEPS).toEqual([
      { id: 'plan', label: 'Guion' },
      { id: 'images', label: 'Imágenes' },
      { id: 'videos', label: 'Vídeos' },
      { id: 'result', label: 'Resultado' },
    ])
    expect(STORY_TERMINAL_STATUSES).toEqual(['READY', 'FAILED', 'CANCELLED', 'WAITING_QC'])
  })
})

describe('story copy deck', () => {
  it('matches the normative visible copy exactly', () => {
    expect(STORY_COPY.brand).toBe('AI Shorts')
    expect(STORY_COPY.beta).toBe('BETA')
    expect(STORY_COPY.betaExplanation).toBe(
      'BETA. La creación de historias con IA es real, consume créditos y puede tardar varios minutos.',
    )
    expect(STORY_COPY.back).toBe('Volver al feed')
    expect(STORY_COPY.h1).toBe('Crea una historia con IA')
    expect(STORY_COPY.intro).toBe(
      'Escribe una premisa. La IA prepara entre 4 y 6 escenas de 6 segundos con sus imágenes y tú decides cuándo generar los vídeos.',
    )
    expect(STORY_COPY.formTitle).toBe('Tu historia')
    expect(STORY_COPY.premiseLabel).toBe('Premisa')
    expect(STORY_COPY.premisePlaceholder).toBe(
      'Una repostera descubre que sus postres pueden predecir el futuro.',
    )
    expect(STORY_COPY.premiseHelp).toBe('Máximo 600 caracteres.')
    expect(STORY_COPY.sceneCountLegend).toBe('Escenas')
    expect(STORY_COPY.sceneCountHelp).toBe('Cada escena dura 6 segundos.')
    expect(STORY_COPY.presetLegend).toBe('Calidad de vídeo')
    expect(STORY_COPY.referenceTitle).toBe('Imagen de referencia (opcional)')
    expect(STORY_COPY.referenceEmpty).toBe(
      'Sin imagen. Puedes crear la historia solo con texto.',
    )
    expect(STORY_COPY.referenceMax).toBe(
      'Máximo 1 imagen. Elimina la actual para cambiarla.',
    )
    expect(STORY_COPY.create).toBe('Crear historia')
    expect(STORY_COPY.planning).toBe('Escribiendo el guion')
    expect(STORY_COPY.planningNote).toBe(
      'La IA está preparando las escenas. Puede tardar unos segundos.',
    )
    expect(STORY_COPY.keyframes).toBe('Preparando las imágenes')
    expect(STORY_COPY.keyframesNote).toBe('Estamos creando una imagen por escena.')
    expect(STORY_COPY.reviewTitle).toBe('Revisa las imágenes')
    expect(STORY_COPY.sceneTitle).toBe('Escena {n} de {total}')
    expect(STORY_COPY.narrationLabel).toBe('Narración (solo en pantalla)')
    expect(STORY_COPY.visualPromptLabel).toBe('Prompt visual')
    expect(STORY_COPY.regenerate).toBe('Guardar y regenerar')
    expect(STORY_COPY.regenerating).toBe('Regenerando imagen…')
    expect(STORY_COPY.regenerateFailed).toBe('No se pudo regenerar la imagen.')
    expect(STORY_COPY.attempt).toBe('Imagen {n} de 2')
    expect(STORY_COPY.approve).toBe('Aprobar y generar vídeos')
    expect(STORY_COPY.videosTitle).toBe('Generando los vídeos')
    expect(STORY_COPY.videosNote).toBe(
      'Los vídeos se generan de dos en dos. Puede tardar varios minutos.',
    )
    expect(STORY_COPY.assemblyTitle).toBe('Montando el vídeo final')
    expect(STORY_COPY.assemblyStepDownload).toBe('Descargando los vídeos')
    expect(STORY_COPY.assemblyStepConcat).toBe('Uniendo las escenas')
    expect(STORY_COPY.assemblyStepUpload).toBe('Subiendo el resultado')
    expect(STORY_COPY.cancel).toBe('Cancelar historia')
    expect(STORY_COPY.cancelled).toBe('Historia cancelada.')
    expect(STORY_COPY.failedTitle).toBe('No se pudo completar la historia')
    expect(STORY_COPY.retryScene).toBe('Reintentar escena')
    expect(STORY_COPY.retryAssembly).toBe('Reintentar montaje')
    expect(STORY_COPY.startOver).toBe('Empezar de nuevo')
    expect(STORY_COPY.startAnother).toBe('Empezar otra historia')
    expect(STORY_COPY.resultBadge).toBe('IA')
    expect(STORY_COPY.resultTitle).toBe('Tu historia')
    expect(STORY_COPY.resultReferenceZero).toBe('Sin referencia')
    expect(STORY_COPY.resultReferenceOne).toBe('1 imagen')
    expect(STORY_COPY.expired).toBe(
      'Esta historia ya no está disponible. Empieza de nuevo.',
    )
    expect(STORY_COPY.notOwned).toBe(
      'Esta historia no está disponible en este navegador.',
    )
    expect(STORY_COPY.offlineCreate).toBe('Sin conexión. La creación necesita internet.')
    expect(STORY_COPY.offlinePolling).toBe(
      'Sin conexión. Reintentaremos cuando vuelvas a estar en línea.',
    )
    expect(STORY_COPY.metaTitle).toBe('AI Shorts — Historias con IA')
    expect(STORY_COPY.metaDetailTitle).toBe('Tu historia — AI Shorts')
  })
})

describe('story data parity with the server', () => {
  it('shares limits with server/story/validation.ts', () => {
    expect(SERVER_MIN_PREMISE_LENGTH).toBe(STORY_MIN_PREMISE_LENGTH)
    expect(SERVER_MAX_PREMISE_LENGTH).toBe(STORY_MAX_PREMISE_LENGTH)
    expect(SERVER_MIN_VISUAL_PROMPT_LENGTH).toBe(STORY_MIN_VISUAL_PROMPT_LENGTH)
    expect(SERVER_MAX_VISUAL_PROMPT_LENGTH).toBe(STORY_MAX_VISUAL_PROMPT_LENGTH)
    expect(SERVER_MIN_NARRATION_LENGTH).toBe(STORY_MIN_NARRATION_LENGTH)
    expect(SERVER_MAX_NARRATION_LENGTH).toBe(STORY_MAX_NARRATION_LENGTH)
    expect(SERVER_MAX_IMAGE_BYTES).toBe(STORY_MAX_IMAGE_BYTES)
    expect(STORY_REFERENCE_MAX_AGE_MS).toBe(3_600_000)
    expect(STORY_CREATE_MAX_BODY_BYTES).toBe(16_384)
  })

  it('does not expose endpoints, hosts or secrets from static data', () => {
    expect(source).not.toMatch(/fal-ai\//)
    expect(source).not.toMatch(/queue\.fal\.run|fal\.run|rest\.fal\.ai|fal\.media/)
    expect(source).not.toMatch(/https?:\/\//)
    expect(source).not.toMatch(/NUXT_|DATABASE_URL|DEEPSEEK_KEY|FFMPEG_PATH/)
  })
})
