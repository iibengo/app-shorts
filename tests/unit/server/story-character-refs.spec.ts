import { describe, expect, it } from 'vitest'
import type { StoryBible, StoryCharacter, StoryPlan } from '~/models/story'
import {
  MAX_CHARACTER_REFS,
  canonCharacters,
  characterRefCharacters,
  characterRefElements,
  generatedCharacterRefTargets,
  initialCharacterRefs,
  parseCharacterRefs,
  serializeCharacterRefs,
  usableUserReferenceUrl,
} from '../../../server/story/character-refs'
import type { StoredCharacterRef } from '../../../server/story/character-refs'

const IMAGE = 'https://v3.fal.media/files/test/character.png'
const UPDATED_AT = '2026-10-24T12:00:00.000Z'

function character(
  id: string,
  name: string,
  source: StoryCharacter['source'] = 'premise',
): StoryCharacter {
  return {
    id,
    name,
    description: `${name} description for the canon.`,
    wardrobe: `${name} wardrobe.`,
    source,
  }
}

function bible(characters: readonly StoryCharacter[], leadId = characters[0]!.id): StoryBible {
  return {
    style: 'papercraft',
    tone: 'humor',
    theme: 'A test story.',
    leadCharacterId: leadId,
    signaturePropId: null,
    characters,
    locations: [
      { id: 'kitchen', name: 'Kitchen', description: 'A kitchen.', source: 'premise' },
    ],
    props: [],
    forbidden: [],
    continuityRules: [],
  }
}

function planWith(
  characters: readonly StoryCharacter[],
  sceneCharacters: readonly (readonly string[])[],
  leadId?: string,
): StoryPlan {
  return {
    title: 'Test',
    logline: 'Test',
    tone: 'humor',
    storyBible: bible(characters, leadId),
    scenes: sceneCharacters.map((ids, index) => ({
      order: index + 1,
      sceneRole: index === 0 ? 'establishing' : 'resolution',
      locationId: 'kitchen',
      timeOfDay: 'morning',
      weather: 'clear',
      characters: ids,
      props: [],
      action: 'Something happens.',
      narration: 'Narration.',
      storyFunction: index === 0 ? 'hook' : 'payoff',
      gag: null,
      continuityFromPrevious: null,
    })),
  }
}

function ready(frontalUrl: string | null = IMAGE): StoredCharacterRef {
  return {
    status: 'ready',
    source: 'generated',
    frontalUrl,
    referenceUrls: frontalUrl === null ? [] : [frontalUrl],
    attempts: 1,
    updatedAt: UPDATED_AT,
  }
}

describe('character reference parsing', () => {
  it('reads a null column as an empty map', () => {
    expect(parseCharacterRefs(null, ['mara'])).toEqual({})
    expect(parseCharacterRefs(undefined, ['mara'])).toEqual({})
    expect(parseCharacterRefs([], ['mara'])).toEqual({})
  })

  it('drops keys that are not characters of the canon', () => {
    const parsed = parseCharacterRefs(
      { mara: ready(), ghost: ready() },
      ['mara', 'iker'],
    )

    expect(Object.keys(parsed)).toEqual(['mara'])
  })

  it('drops a malformed entry but keeps its valid siblings', () => {
    const parsed = parseCharacterRefs(
      {
        mara: ready(),
        iker: { status: 'made-up', source: 'generated', frontalUrl: IMAGE },
      },
      ['mara', 'iker'],
    )

    expect(Object.keys(parsed)).toEqual(['mara'])
    expect(parsed.iker).toBeUndefined()
  })

  it('drops an entry whose image is not on the Fal CDN allowlist', () => {
    const parsed = parseCharacterRefs(
      {
        mara: {
          ...ready(),
          frontalUrl: 'https://example.com/not-fal.png',
          referenceUrls: ['https://example.com/not-fal.png'],
        },
        iker: ready(),
      },
      ['mara', 'iker'],
    )

    expect(Object.keys(parsed)).toEqual(['iker'])
  })

  it('degrades a ready entry without a frontal image to failed', () => {
    const parsed = parseCharacterRefs(
      { mara: ready(null) },
      ['mara'],
    )

    expect(parsed.mara?.status).toBe('failed')
    expect(parsed.mara?.frontalUrl).toBeNull()
  })

  it('degrades a ready entry without reference urls to failed', () => {
    const parsed = parseCharacterRefs(
      { mara: { ...ready(), referenceUrls: [] } },
      ['mara'],
    )

    expect(parsed.mara?.status).toBe('failed')
  })

  it('keeps at most three entries in canon order', () => {
    const characters = [
      character('mara', 'Mara'),
      character('iker', 'Iker'),
      character('pixel', 'Pixel', 'invented'),
      character('nube', 'Nube', 'invented'),
    ]
    const parsed = parseCharacterRefs(
      {
        nube: ready(),
        pixel: ready(),
        iker: ready(),
        mara: ready(),
      },
      ['mara', 'iker', 'pixel', 'nube'],
    )

    expect(Object.keys(parsed)).toEqual(['mara', 'iker', 'pixel'])
    expect(Object.keys(parsed)).toHaveLength(MAX_CHARACTER_REFS)
  })

  it('serializes only the stored fields', () => {
    const serialized = serializeCharacterRefs({
      mara: { ...ready(), extra: 'ignored' } as StoredCharacterRef,
    })

    expect(serialized.mara).toEqual(ready())
  })
})

describe('character reference eligibility', () => {
  it('orders the protagonist first and then the canon', () => {
    const characters = [
      character('mara', 'Mara'),
      character('iker', 'Iker', 'invented'),
      character('pixel', 'Pixel', 'invented'),
    ]
    const plan = planWith(characters, [['iker', 'mara', 'pixel']], 'mara')

    expect(canonCharacters(plan).map((item) => item.id)).toEqual(['mara', 'iker', 'pixel'])
  })

  it('includes only characters that appear in at least one scene', () => {
    const plan = planWith(
      [character('mara', 'Mara'), character('iker', 'Iker')],
      [['mara']],
    )

    expect(characterRefCharacters(plan).map((item) => item.id)).toEqual(['mara'])
  })

  it('excludes the protagonist from generation when the user supplied its image', () => {
    const plan = planWith(
      [character('mara', 'Mara'), character('iker', 'Iker')],
      [['mara', 'iker']],
    )

    expect(
      generatedCharacterRefTargets(plan, IMAGE).map((item) => item.id),
    ).toEqual(['iker'])
  })

  it('generates the protagonist when there is no user image', () => {
    const plan = planWith(
      [character('mara', 'Mara'), character('iker', 'Iker')],
      [['mara', 'iker']],
    )

    expect(
      generatedCharacterRefTargets(plan, null).map((item) => item.id),
    ).toEqual(['mara', 'iker'])
  })

  it('ignores a user image that is not a Fal CDN URL', () => {
    const plan = planWith([character('mara', 'Mara')], [['mara']])

    expect(usableUserReferenceUrl('https://example.com/photo.png')).toBeNull()
    expect(
      generatedCharacterRefTargets(plan, 'https://example.com/photo.png')
        .map((item) => item.id),
    ).toEqual(['mara'])
  })

  it('builds a ready user reference and pending generated references', () => {
    const plan = planWith(
      [character('mara', 'Mara'), character('iker', 'Iker', 'invented')],
      [['mara', 'iker']],
    )
    const refs = initialCharacterRefs(plan, IMAGE, UPDATED_AT)

    expect(refs.mara).toEqual({
      status: 'ready',
      source: 'user',
      frontalUrl: IMAGE,
      referenceUrls: [IMAGE],
      attempts: 0,
      updatedAt: UPDATED_AT,
    })
    expect(refs.iker).toMatchObject({
      status: 'pending',
      source: 'generated',
      frontalUrl: null,
      referenceUrls: [],
    })
  })
})

describe('character reference elements', () => {
  it('keeps the order and the one-to-one correspondence with the images', () => {
    const elements = characterRefElements(['mara', 'iker'], {
      mara: ready('https://v3.fal.media/files/test/mara.png'),
      iker: ready('https://v3.fal.media/files/test/iker.png'),
    })

    expect(elements.map((element) => element.characterId)).toEqual(['mara', 'iker'])
    expect(elements.map((element) => element.frontalUrl)).toEqual([
      'https://v3.fal.media/files/test/mara.png',
      'https://v3.fal.media/files/test/iker.png',
    ])
  })

  it('skips pending and failed references', () => {
    const elements = characterRefElements(['mara', 'iker', 'pixel'], {
      mara: ready(),
      iker: {
        status: 'failed',
        source: 'generated',
        frontalUrl: null,
        referenceUrls: [],
        attempts: 2,
        updatedAt: UPDATED_AT,
      },
    })

    expect(elements.map((element) => element.characterId)).toEqual(['mara'])
  })
})

describe('retry cap', () => {
  it('the service and the reconciler agree on the cap', async () => {
    // They live in two modules to avoid an import cycle, which is exactly the
    // kind of duplication that drifts. This keeps them equal.
    const { CHARACTER_REF_RETRY_CAP } = await import('../../../server/story/reel-service')
    const { CHARACTER_REF_MAX_ATTEMPTS } = await import('../../../server/story/reel-reconciler')

    expect(CHARACTER_REF_RETRY_CAP).toBe(CHARACTER_REF_MAX_ATTEMPTS)
  })
})
