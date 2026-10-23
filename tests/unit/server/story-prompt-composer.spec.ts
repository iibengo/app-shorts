// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  KEYFRAME_PROMPT_MAX_CHARS,
  KLING_LEGACY_NEGATIVE_PROMPT,
  STORY_VIDEO_PROMPT_MAX_LENGTH,
  VIDEO_STAGE_BLOCK,
  composeGlobalBlock,
  composeKeyframe,
  composeNegative,
  composeVideo,
  composeVideoGlobalBlock,
  storyBeatForScene,
  storyKeyframeFluxPrompt,
  storyVideoLegacyPrompt,
  storyPromptComposer,
} from '../../../server/story/story-prompt-composer'
import type { StoryPlan } from '~/models/story'
import { StoryError } from '../../../server/story/errors'
import { styleBlockFor, styleNegativeFor } from '../../../server/story/visual-style'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'
import creative from '../../fixtures/story/plan-creative-scene-changes.json'

const PLAN = plan5 as StoryPlan
const BIBLE = PLAN.storyBible!

function beats(plan: StoryPlan) {
  return plan.beats.map((beat) => storyBeatForScene(plan, beat, plan.beats.length))
}

describe('story-prompt-composer: global canon', () => {
  it('starts the keyframe with the shot and keeps the video global block first', () => {
    for (const beat of beats(PLAN)) {
      const keyframe = composeKeyframe({ bible: BIBLE, beat, hasReference: false })
      const video = composeVideo({ bible: BIBLE, beat, preset: 'quality' })

      expect(keyframe.prompt).not.toContain(composeGlobalBlock(BIBLE))
      expect(keyframe.prompt).not.toContain('CONTINUIDAD GLOBAL')
      expect(video.prompt.startsWith(composeVideoGlobalBlock(BIBLE, beat))).toBe(true)
    }
  })

  it('keeps the scene location, time and weather in each scene block', () => {
    const creativePlan = creative as StoryPlan
    const scenes = beats(creativePlan)
    const first = composeKeyframe({
      bible: creativePlan.storyBible!,
      beat: scenes[0]!,
      hasReference: false,
    })
    const second = composeKeyframe({
      bible: creativePlan.storyBible!,
      beat: scenes[3]!,
      hasReference: false,
    })

    expect(first.prompt).toContain('Location: Obrador de Clara.')
    expect(second.prompt).toContain('Location: Calle.')
    expect(second.prompt).toContain('Time: night.')
  })

  it('keeps video prompts under 2000 and never includes narration or gag', () => {
    for (const beat of beats(creative as StoryPlan)) {
      const keyframe = composeKeyframe({
        bible: (creative as StoryPlan).storyBible!,
        beat,
        hasReference: false,
      })
      const video = composeVideo({ bible: (creative as StoryPlan).storyBible!, beat, preset: 'fast' })

      expect(keyframe.prompt).not.toContain(beat.narration)
      if (beat.gag) expect(keyframe.prompt).not.toContain(beat.gag)
      expect(video.prompt.length).toBeLessThanOrEqual(STORY_VIDEO_PROMPT_MAX_LENGTH)
      expect(video.prompt).toContain(VIDEO_STAGE_BLOCK)
      expect(video.prompt).toContain(beat.visualPrompt)
      expect(video.prompt).not.toContain(beat.narration)
      if (beat.gag) expect(video.prompt).not.toContain(beat.gag)
    }
  })

  it('keeps keyframe prompts inside the FLUX token budget', () => {
    for (const beat of beats(PLAN)) {
      const keyframe = composeKeyframe({ bible: BIBLE, beat, hasReference: false })

      expect(keyframe.prompt.length).toBeLessThanOrEqual(KEYFRAME_PROMPT_MAX_CHARS)
    }
  })
})

describe('story-prompt-composer: negative', () => {
  it('derives contrast from the scene, not from a fixed bicycle list', () => {
    const beat = beats(PLAN)[1]!
    const terms = composeNegative(BIBLE, beat).split(', ')

    expect(terms).not.toContain('bicycle')
  })

  it('filters canon names and the scene context from the negative', () => {
    const beat = beats(PLAN)[1]!
    const terms = composeNegative(BIBLE, beat).split(', ')

    for (const character of BIBLE.characters) {
      expect(terms).not.toContain(character.id)
      expect(terms).not.toContain(character.name)
    }
    for (const location of BIBLE.locations) {
      expect(terms).not.toContain(location.id)
      expect(terms).not.toContain(location.name)
    }
  })

  it('never writes negatives into the positive video prompt', () => {
    const beat = beats(PLAN)[1]!
    const fast = composeVideo({ bible: BIBLE, beat, preset: 'fast' })
    const quality = composeVideo({ bible: BIBLE, beat, preset: 'quality' })

    expect(fast.prompt).not.toContain('Avoid:')
    expect(quality.prompt).not.toContain('Avoid:')
    expect(fast.negativePrompt.length).toBeGreaterThan(0)
    expect(quality.negativePrompt.length).toBeGreaterThan(0)
  })
})

describe('story-prompt-composer: legacy', () => {
  it('returns the exact 005 templates with bible null', () => {
    const beat = beats(PLAN)[0]!
    const keyframe = composeKeyframe({ bible: null, beat, hasReference: false })
    const video = composeVideo({ bible: null, beat, preset: 'quality' })

    expect(keyframe.prompt).toBe(storyKeyframeFluxPrompt(beat.visualPrompt))
    expect(video.prompt).toBe(storyVideoLegacyPrompt(beat.visualPrompt))
    expect(video.negativePrompt).toBe(KLING_LEGACY_NEGATIVE_PROMPT)
  })

  it('exposes the StoryPromptComposer contract', () => {
    expect(storyPromptComposer.composeGlobalBlock(BIBLE)).toBe(composeGlobalBlock(BIBLE))
  })
})

describe('story-prompt-composer: keyframe layout', () => {
  const BIBLE2 = {
    style: 'animación 3D cartoon, colores cálidos',
    tone: 'humor',
    theme: 'el ingenio vence al destino',
    leadCharacterId: 'clara',
    signaturePropId: 'merengue',
    characters: [
      { id: 'clara', name: 'Clara', description: 'Repostera de delantal azul', wardrobe: 'delantal azul', source: 'premise' },
      { id: 'rival', name: 'Rival', description: 'Panadero de bigote', wardrobe: 'chaqueta roja', source: 'invented' },
    ],
    locations: [{ id: 'obrador', name: 'Obrador', description: 'Cocina con horno antiguo', source: 'premise' }],
    props: [
      { id: 'merengue', name: 'Merengue', description: 'Bol metálico', source: 'premise' },
      { id: 'varita', name: 'Varita', description: 'Cuchara de madera', source: 'invented' },
    ],
    forbidden: ['bicicleta', 'nieve'],
    continuityRules: ['El delantal no cambia', 'El bol sigue en la mesa'],
  } as const

  function beatOf(overrides: Record<string, unknown> = {}) {
    return {
      order: 2,
      sceneRole: 'development',
      locationId: 'obrador',
      timeOfDay: 'night',
      weather: 'rain',
      characters: ['clara'],
      props: ['merengue'],
      action: 'Clara bate el merengue y este dibuja una cara.',
      narration: 'Algo raro pasa.',
      storyFunction: 'escalation',
      gag: null,
      visualPrompt: 'Primer plano del merengue.',
      camera: 'medium',
      continuityFromPrevious: 'Clara conserva el bol.',
      transition: 'cut',
      ...overrides,
    } as unknown as Parameters<typeof composeKeyframe>[0]['beat']
  }

  it('puts the shot first and the style last', () => {
    const prompt = composeKeyframe({
      bible: BIBLE2 as unknown as Parameters<typeof composeKeyframe>[0]['bible'],
      beat: beatOf({ subject: 'Clara batiendo merengue', framing: 'close-up' }),
      hasReference: false,
    }).prompt

    expect(prompt.startsWith('Close-up of Clara batiendo merengue: Clara bate el merengue')).toBe(true)
    expect(prompt.indexOf('Characters:')).toBeLessThan(prompt.indexOf('Location:'))
    expect(prompt.indexOf('Location:')).toBeLessThan(prompt.indexOf('Style:'))
    expect(prompt.indexOf('Style:')).toBeLessThan(prompt.indexOf('Static vertical 9:16'))
  })

  it('includes only the entities present in the shot', () => {
    const prompt = composeKeyframe({
      bible: BIBLE2 as unknown as Parameters<typeof composeKeyframe>[0]['bible'],
      beat: beatOf(),
      hasReference: false,
    }).prompt

    expect(prompt).toContain('Clara')
    expect(prompt).toContain('Merengue')
    expect(prompt).not.toContain('Rival')
    expect(prompt).not.toContain('Varita')
    expect(prompt).not.toContain('bicicleta')
  })

  it('writes the keyframe in English without inline negatives', () => {
    const prompt = composeKeyframe({
      bible: BIBLE2 as unknown as Parameters<typeof composeKeyframe>[0]['bible'],
      beat: beatOf(),
      hasReference: false,
    }).prompt

    for (const marker of ['Localización', 'Hora:', 'Clima:', 'Presentes', 'Objetos', 'Composición', 'Prohibido', 'Avoid:', 'Evita']) {
      expect(prompt).not.toContain(marker)
    }
    expect(prompt).toContain('Location: Obrador.')
    expect(prompt).toContain('Time: night.')
    expect(prompt).toContain('Weather: rain.')
  })

  it('degrades deterministically and never loses the shot line', () => {
    const longText = 'palabra '.repeat(80).trim()
    const prompt = composeKeyframe({
      bible: BIBLE2 as unknown as Parameters<typeof composeKeyframe>[0]['bible'],
      beat: beatOf({ action: longText, subject: longText }),
      hasReference: false,
    }).prompt

    expect(prompt.length).toBeLessThanOrEqual(KEYFRAME_PROMPT_MAX_CHARS)
    expect(prompt.startsWith('Medium shot of palabra palabra')).toBe(true)
    expect(prompt).toContain('Location: Obrador.')
    expect(prompt).toContain('Static vertical 9:16')
  })

  it('falls back to the camera when the shot has no framing', () => {
    const prompt = composeKeyframe({
      bible: BIBLE2 as unknown as Parameters<typeof composeKeyframe>[0]['bible'],
      beat: beatOf({ camera: 'wide' }),
      hasReference: false,
    }).prompt

    expect(prompt.startsWith('Wide shot: Clara bate el merengue')).toBe(true)
  })
})

describe('story-prompt-composer: visual style', () => {
  it('opens the keyframe with the style block and keeps the budget', () => {
    const beat = beats(PLAN)[0]!
    const prompt = composeKeyframe({
      bible: BIBLE,
      beat,
      hasReference: false,
      visualStyle: 'papercraft',
    }).prompt

    expect(prompt.startsWith(styleBlockFor('papercraft'))).toBe(true)
    expect(prompt.length).toBeLessThanOrEqual(KEYFRAME_PROMPT_MAX_CHARS)
  })

  it('opens the video prompt with the style block and adds the style negative', () => {
    const beat = beats(PLAN)[0]!
    const video = composeVideo({ bible: BIBLE, beat, preset: 'fast', visualStyle: 'anime' })

    expect(video.prompt.startsWith(styleBlockFor('anime'))).toBe(true)
    expect(video.negativePrompt).toContain(styleNegativeFor('anime'))
  })
})
