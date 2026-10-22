// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  KLING_LEGACY_NEGATIVE_PROMPT,
  composeGlobalBlock,
  composeKeyframe,
  composeNegative,
  composeVideo,
  composeVideoGlobalBlock,
  STORY_PROMPT_MAX_LENGTH,
  STORY_VIDEO_PROMPT_MAX_LENGTH,
  VIDEO_STAGE_BLOCK,
  storyBeatForScene,
  storyKeyframeFluxPrompt,
  storyKeyframeKontextPrompt,
  storyPromptComposer,
  storyVideoLegacyPrompt,
} from '../../../server/story/story-prompt-composer'
import type { StoryBible, StoryPlan } from '~/models/story'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'

const PLAN = plan5 as StoryPlan
const BIBLE = PLAN.storyBible!

function beats() {
  return PLAN.beats.map((beat) => storyBeatForScene(PLAN, beat, PLAN.beats.length))
}

describe('story-prompt-composer: global block', () => {
  it('uses the full global block for keyframes and a stable compact block for video', () => {
    const global = composeGlobalBlock(BIBLE)
    const scenes = beats()
    const videoGlobal = composeVideoGlobalBlock(BIBLE, scenes[0]!)

    for (const beat of scenes) {
      const keyframe = composeKeyframe({ bible: BIBLE, beat, hasReference: false })
      const kontext = composeKeyframe({ bible: BIBLE, beat, hasReference: true })
      const fast = composeVideo({ bible: BIBLE, beat, preset: 'fast' })
      const quality = composeVideo({ bible: BIBLE, beat, preset: 'quality' })

      expect(keyframe.prompt.startsWith(global)).toBe(true)
      expect(kontext.prompt.startsWith(global)).toBe(true)
      expect(fast.prompt.startsWith(composeVideoGlobalBlock(BIBLE, beat))).toBe(true)
      expect(quality.prompt.startsWith(composeVideoGlobalBlock(BIBLE, beat))).toBe(true)
    }

    expect(videoGlobal).toContain('CONTINUIDAD DE VÍDEO')
  })

  it('keeps the global block under the 2600 character budget', () => {
    expect(composeGlobalBlock(BIBLE).length).toBeLessThanOrEqual(2_600)
  })

  it('orders global, scene, stage and Avoid', () => {
    const beat = beats()[1]!
    const prompt = composeKeyframe({ bible: BIBLE, beat, hasReference: false }).prompt
    const globalIndex = prompt.indexOf('CONTINUIDAD GLOBAL')
    const sceneIndex = prompt.indexOf('ESCENA 2')
    const stageIndex = prompt.indexOf('Fotograma estático')
    const avoidIndex = prompt.indexOf('Avoid:')

    expect(globalIndex).toBe(0)
    expect(sceneIndex).toBeGreaterThan(globalIndex)
    expect(stageIndex).toBeGreaterThan(sceneIndex)
    expect(avoidIndex).toBeGreaterThan(stageIndex)
  })

  it('never includes the narration in any prompt', () => {
    for (const beat of beats()) {
      const prompts = [
        composeKeyframe({ bible: BIBLE, beat, hasReference: false }).prompt,
        composeVideo({ bible: BIBLE, beat, preset: 'fast' }).prompt,
        composeVideo({ bible: BIBLE, beat, preset: 'quality' }).prompt,
      ]

      for (const prompt of prompts) {
        expect(prompt).not.toContain(beat.narration)
      }
    }
  })

  it('is deterministic', () => {
    const beat = beats()[3]!
    const first = composeVideo({ bible: BIBLE, beat, preset: 'fast' })
    const second = composeVideo({ bible: BIBLE, beat, preset: 'fast' })

    expect(first).toEqual(second)
  })
})

describe('story-prompt-composer: compact video budget', () => {
  function longBible(): StoryBible {
    return {
      ...BIBLE,
      style: 'x'.repeat(160),
      location: {
        name: 'Parque de Springfield',
        description: 'Sendero de tierra, césped verde, árboles frondosos y una rampa roja. '.repeat(2).slice(0, 160),
      },
      characters: [
        {
          id: 'bart',
          name: 'Bart',
          description: 'Niño de piel amarilla y pelo puntiagudo. '.repeat(3).slice(0, 100),
          wardrobe: 'Camiseta naranja, shorts azules y zapatillas azules. '.repeat(2).slice(0, 80),
        },
        {
          id: 'milhouse',
          name: 'Milhouse',
          description: 'Amigo de Bart con gafas grandes y ropa de colores. '.repeat(3).slice(0, 100),
          wardrobe: 'Camisa azul, pantalón corto beige y zapatillas rojas. '.repeat(2).slice(0, 80),
        },
        {
          id: 'lisa',
          name: 'Lisa',
          description: 'Hermana de Bart con vestido rojo y collar blanco. '.repeat(3).slice(0, 100),
          wardrobe: 'Vestido rojo, collar blanco y zapatos negros. '.repeat(2).slice(0, 80),
        },
      ],
      props: [
        {
          id: 'skateboard',
          name: 'Patinete azul',
          description: 'Patinete azul con manillar negro y ruedas rojas. '.repeat(2).slice(0, 90),
        },
        {
          id: 'helmet',
          name: 'Casco',
          description: 'Casco de protección azul con correas negras. '.repeat(2).slice(0, 90),
        },
        {
          id: 'backpack',
          name: 'Mochila',
          description: 'Mochila escolar roja con cremallera amarilla. '.repeat(2).slice(0, 90),
        },
      ],
      forbidden: Array.from({ length: 8 }, (_value, index) =>
        `elemento prohibido ${index}`),
      continuityRules: Array.from({ length: 3 }, (_value, index) =>
        `Regla ${index}: mantén el vestuario, el patinete, el fondo y el clima.`),
    }
  }

  function longBeat(): StoryPlan['beats'][number] {
    return {
      order: 2,
      sceneRole: 'development',
      visualPrompt: 'Bart acelera por el sendero del parque con su patinete azul mientras Milhouse lo sigue corriendo. '.repeat(5).slice(0, 600),
      narration: 'Bart acelera por el parque con su patinete azul mientras Milhouse lo sigue.',
      characters: ['bart', 'milhouse'],
      props: ['skateboard', 'helmet', 'backpack'],
      camera: 'tracking',
      continuityFromPrevious: 'El patinete azul, el casco y la mochila siguen en el mismo sendero de tierra. '.repeat(2).slice(0, 200),
      transition: 'cut',
    }
  }

  it('keeps the composed video prompt within 2000 characters with a long bible', () => {
    const bible = longBible()
    const beat = longBeat()

    for (const preset of ['fast', 'quality'] as const) {
      const composed = composeVideo({ bible, beat, preset })

      expect(composed.prompt.length).toBeLessThanOrEqual(STORY_VIDEO_PROMPT_MAX_LENGTH)
      expect(composed.prompt).toContain(beat.visualPrompt)
      expect(composed.prompt).toContain(VIDEO_STAGE_BLOCK)
      expect(composed.prompt).not.toContain(beat.narration)
    }
  })

  it('keeps the keyframe on the full global block with the 4000 budget', () => {
    const bible = longBible()
    const beat = longBeat()
    const keyframe = composeKeyframe({ bible, beat, hasReference: false })

    expect(keyframe.prompt.startsWith(composeGlobalBlock(bible))).toBe(true)
    expect(keyframe.prompt.length).toBeLessThanOrEqual(STORY_PROMPT_MAX_LENGTH)
  })

  it('falls back to the short Avoid list without breaking words', () => {
    const bible = longBible()
    const beat = longBeat()
    const fast = composeVideo({ bible, beat, preset: 'fast' })
    const quality = composeVideo({ bible, beat, preset: 'quality' })

    expect(fast.prompt).toContain('Avoid:')
    expect(fast.prompt).not.toContain('Avoid: ' + fast.negativePrompt)
    expect(quality.prompt).not.toContain('Avoid:')
    expect(quality.negativePrompt.length).toBeGreaterThan(0)
    expect(fast.prompt).toContain(beat.visualPrompt)
    expect(fast.prompt).toContain(VIDEO_STAGE_BLOCK)
  })
})

describe('story-prompt-composer: negative', () => {
  it('derives the base, the forbidden list and the contrast terms once', () => {
    const beat = beats()[1]!
    const negative = composeNegative(BIBLE, beat)
    const terms = negative.split(', ')

    for (const expected of [
      'extra characters',
      'characters not in the story bible',
      'different vehicle or prop',
      'different clothing',
      'different weather',
      'different time of day',
      'text',
      'subtitles',
      'watermark',
      'logo',
      'low quality',
      'artifacts',
      'Homer',
      'bicicleta',
      'lluvia',
      'noche',
      'night',
      'rain',
      'storm',
      'snow',
      'fog',
      'bicycle',
    ]) {
      expect(terms).toContain(expected)
    }

    expect(new Set(terms).size).toBe(terms.length)
  })

  it('never contradicts night, rain or a bicycle signature prop', () => {
    const bible: StoryBible = {
      ...BIBLE,
      timeOfDay: 'night',
      weather: 'rain',
      props: [
        {
          id: 'bicycle',
          name: 'Bicicleta roja',
          description: 'Bicicleta roja con cesta de mimbre y timbre plateado.',
        },
      ],
      signaturePropId: 'bicycle',
      forbidden: ['texto'],
    }
    const beat = { ...beats()[0]!, props: ['bicycle'] }
    const terms = composeNegative(bible, beat).split(', ')

    expect(terms).not.toContain('night')
    expect(terms).not.toContain('rain')
    expect(terms).not.toContain('bicycle')
  })

  it('uses Avoid for MiniMax and a field for Kling', () => {
    const beat = beats()[2]!
    const fast = composeVideo({ bible: BIBLE, beat, preset: 'fast' })
    const quality = composeVideo({ bible: BIBLE, beat, preset: 'quality' })

    expect(fast.prompt).toContain(`Avoid: ${fast.negativePrompt}`)
    expect(quality.prompt).not.toContain('Avoid:')
    expect(quality.negativePrompt.length).toBeGreaterThan(0)
    expect(quality.negativePrompt).toBe(fast.negativePrompt)
  })
})

describe('story-prompt-composer: legacy templates', () => {
  it('returns the exact 005 templates without inventing a bible', () => {
    const beat = beats()[0]!
    const flux = composeKeyframe({ bible: null, beat, hasReference: false })
    const kontext = composeKeyframe({ bible: null, beat, hasReference: true })
    const video = composeVideo({ bible: null, beat, preset: 'quality' })

    expect(flux.prompt).toBe(storyKeyframeFluxPrompt(beat.visualPrompt))
    expect(kontext.prompt).toBe(storyKeyframeKontextPrompt(beat.visualPrompt))
    expect(video.prompt).toBe(storyVideoLegacyPrompt(beat.visualPrompt))
    expect(video.negativePrompt).toBe(KLING_LEGACY_NEGATIVE_PROMPT)
  })

  it('exposes the composer contract', () => {
    const beat = beats()[0]!

    expect(storyPromptComposer.composeGlobalBlock(BIBLE)).toBe(composeGlobalBlock(BIBLE))
    expect(storyPromptComposer.composeKeyframe({ bible: BIBLE, beat, hasReference: false }))
      .toEqual(composeKeyframe({ bible: BIBLE, beat, hasReference: false }))
  })
})
