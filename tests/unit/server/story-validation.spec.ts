// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { StoryError } from '../../../server/story/errors'
import {
  STORY_BEAT_MAX_BODY_BYTES,
  STORY_CREATE_MAX_BODY_BYTES,
  STORY_MAX_IMAGE_BYTES,
  STORY_REFERENCE_MAX_AGE_MS,
  STORY_UPLOAD_MAX_BODY_BYTES,
  readStoryJsonBody,
  validateBeatUpdate,
  validateCreateRequest,
  validateIdempotencyKey,
  validateNarration,
  validatePremise,
  validatePreset,
  validateStoryMode,
  validateReference,
  validateSceneCount,
  validateUploadRequest,
  validateVisualPrompt,
} from '../../../server/story/validation'
import { createTestEvent } from '../../helpers/h3'

const NOW = Date.parse('2026-10-21T18:00:00.000Z')
const PREMISE = 'Una repostera descubre que sus postres pueden predecir el futuro.'
const MEDIA = 'https://v3.fal.media/files/test/reference.webp'

function expectStoryError(run: () => unknown, code: string): void {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(StoryError)
    expect((error as StoryError).code).toBe(code)

    return
  }

  throw new Error(`expected StoryError ${code}`)
}

async function expectBodyError(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(StoryError)
    expect((error as StoryError).code).toBe(code)

    return
  }

  throw new Error(`expected StoryError ${code}`)
}

describe('validatePremise', () => {
  it('normalizes NFC and trims but preserves inner line breaks', () => {
    expect(validatePremise('  Cafe\u0301 con salto\ndentro  ')).toBe('Café con salto\ndentro')
  })

  it('enforces the 10 to 600 character range with stable codes', () => {
    expect(validatePremise('a'.repeat(10))).toBe('a'.repeat(10))
    expect(validatePremise('a'.repeat(600))).toBe('a'.repeat(600))
    expectStoryError(() => validatePremise('a'.repeat(601)), 'premise-too-long')
    expectStoryError(() => validatePremise('a'.repeat(9)), 'premise-required')
    expectStoryError(() => validatePremise('   '), 'premise-required')
    expectStoryError(() => validatePremise(42), 'premise-required')
  })

  it('rejects control characters but accepts tabs and line breaks', () => {
    expect(validatePremise('Una premisa\ttabulada')).toBe('Una premisa\ttabulada')
    expectStoryError(() => validatePremise('Una premisa\u0000rota'), 'invalid-premise')
  })
})

describe('validateSceneCount and validatePreset', () => {
  it('defaults to 5 scenes and accepts 4, 5 and 6', () => {
    expect(validateSceneCount(undefined)).toBe(5)
    expect(validateSceneCount(4)).toBe(4)
    expect(validateSceneCount(5)).toBe(5)
    expect(validateSceneCount(6)).toBe(6)
  })

  it.each([3, 7, 0, '5', null, true])('rejects scene count %s', (value) => {
    expectStoryError(() => validateSceneCount(value), 'invalid-scene-count')
  })

  it('defaults to fast and accepts quality', () => {
    expect(validatePreset(undefined)).toBe('fast')
    expect(validatePreset('fast')).toBe('fast')
    expect(validatePreset('quality')).toBe('quality')
  })

  it.each(['pro', 'FAST', 1, null])('rejects preset %s', (value) => {
    expectStoryError(() => validatePreset(value), 'invalid-preset')
  })
})

describe('validateStoryMode', () => {
  it('accepts only the two exact modes', () => {
    expect(validateStoryMode('faithful')).toBe('faithful')
    expect(validateStoryMode('creative')).toBe('creative')
  })

  it.each([undefined, null, '', 'Creative', 'faithful ', 1, true])(
    'rejects %p with invalid-mode',
    (value) => {
      expectStoryError(() => validateStoryMode(value), 'invalid-mode')
    },
  )
})

describe('validateReference', () => {
  it('returns nulls when there is no reference', () => {
    expect(validateReference(undefined, undefined, NOW)).toEqual({
      referenceUrl: null,
      referenceExpiresAt: null,
    })
    expect(validateReference(null, null, NOW)).toEqual({
      referenceUrl: null,
      referenceExpiresAt: null,
    })
  })

  it('accepts an allowlisted https URL with a future expiry inside one hour', () => {
    const expiresAt = new Date(NOW + 1_000).toISOString()

    expect(validateReference(MEDIA, expiresAt, NOW)).toEqual({
      referenceUrl: MEDIA,
      referenceExpiresAt: expiresAt,
    })
    expect(validateReference(
      MEDIA,
      new Date(NOW + STORY_REFERENCE_MAX_AGE_MS).toISOString(),
      NOW,
    ).referenceUrl).toBe(MEDIA)
  })

  it.each([
    [MEDIA, undefined],
    [undefined, new Date(NOW + 1_000).toISOString()],
    [MEDIA, 'not-a-date'],
    [MEDIA, new Date(NOW).toISOString()],
    [MEDIA, new Date(NOW - 1).toISOString()],
    [MEDIA, new Date(NOW + STORY_REFERENCE_MAX_AGE_MS + 1).toISOString()],
    ['http://v3.fal.media/files/test/a.webp', new Date(NOW + 1_000).toISOString()],
    ['https://evil.example/files/a.webp', new Date(NOW + 1_000).toISOString()],
    ['https://user:pass@v3.fal.media/a.webp', new Date(NOW + 1_000).toISOString()],
    ['https://v3.fal.media/a.webp#x', new Date(NOW + 1_000).toISOString()],
    ['https://v3.fal.media:8443/a.webp', new Date(NOW + 1_000).toISOString()],
    [`https://v3.fal.media/${'a'.repeat(2_100)}`, new Date(NOW + 1_000).toISOString()],
    [42, new Date(NOW + 1_000).toISOString()],
  ])('rejects an invalid reference combination %#', (url, expires) => {
    expectStoryError(() => validateReference(url, expires, NOW), 'invalid-reference')
  })
})

describe('validateCreateRequest', () => {
  it('applies defaults and normalizes the premise', () => {
    expect(validateCreateRequest({ premise: `  ${PREMISE}  `, mode: 'faithful' }, NOW)).toEqual({
      premise: PREMISE,
      sceneCount: 5,
      preset: 'fast',
      mode: 'faithful',
      referenceUrl: null,
      referenceExpiresAt: null,
    })
  })

  it('accepts the full valid body', () => {
    const expiresAt = new Date(NOW + 1_000).toISOString()

    expect(validateCreateRequest({
      premise: PREMISE,
      sceneCount: 4,
      preset: 'quality',
      mode: 'creative',
      referenceUrl: MEDIA,
      referenceExpiresAt: expiresAt,
    }, NOW)).toEqual({
      premise: PREMISE,
      sceneCount: 4,
      preset: 'quality',
      mode: 'creative',
      referenceUrl: MEDIA,
      referenceExpiresAt: expiresAt,
    })
  })

  it.each([
    'model',
    'modelId',
    'endpointId',
    'durationSeconds',
    'beats',
    'statusUrl',
    'responseUrl',
    'cancelUrl',
    'webhookUrl',
    'sessionId',
  ])('rejects the forbidden field %s with invalid-request', (field) => {
    expectStoryError(
      () => validateCreateRequest({ premise: PREMISE, [field]: 'x' }, NOW),
      'invalid-request',
    )
  })

  it('rejects arrays and primitives', () => {
    expectStoryError(() => validateCreateRequest([], NOW), 'invalid-request')
    expectStoryError(() => validateCreateRequest('body', NOW), 'invalid-request')
    expectStoryError(() => validateCreateRequest(null, NOW), 'invalid-request')
  })
})

describe('validateVisualPrompt and validateNarration', () => {
  it('accepts the exact boundaries and normalizes', () => {
    expect(validateVisualPrompt(`  ${'a'.repeat(20)}  `)).toBe('a'.repeat(20))
    expect(validateVisualPrompt('a'.repeat(600))).toBe('a'.repeat(600))
    expect(validateNarration(`  ${'a'.repeat(10)}  `)).toBe('a'.repeat(10))
    expect(validateNarration('a'.repeat(280))).toBe('a'.repeat(280))
    expect(validateNarration('Primera línea\nsegunda línea')).toBe(
      'Primera línea segunda línea',
    )
  })

  it.each([
    '',
    'a'.repeat(19),
    'a'.repeat(601),
    '<b>HTML</b> con longitud suficiente',
    'Texto con `backtick` suficiente',
    'Texto\n# markdown suficiente',
    'Texto con \u0001 control suficiente',
  ])('rejects invalid visual prompt %#', (value) => {
    expectStoryError(() => validateVisualPrompt(value), 'invalid-visual-prompt')
  })

  it.each([
    '',
    'a'.repeat(9),
    'a'.repeat(281),
    '<b>HTML</b> en la narración',
  ])('rejects invalid narration %#', (value) => {
    expectStoryError(() => validateNarration(value), 'invalid-narration')
  })

  it('rejects non-string values', () => {
    expectStoryError(() => validateVisualPrompt(12), 'invalid-visual-prompt')
    expectStoryError(() => validateNarration(12), 'invalid-narration')
  })
})

describe('validateBeatUpdate', () => {
  const visualPrompt = 'Una escena vertical con luz cálida y longitud suficiente.'

  it('accepts a minimal update and omits absent optional fields', () => {
    expect(validateBeatUpdate({ visualPrompt })).toEqual({ visualPrompt })
  })

  it('accepts narration and regenerate', () => {
    expect(validateBeatUpdate({
      visualPrompt,
      narration: 'Una narración válida de prueba.',
      regenerate: false,
    })).toEqual({
      visualPrompt,
      narration: 'Una narración válida de prueba.',
      regenerate: false,
    })
  })

  it('rejects non-boolean regenerate and unknown fields', () => {
    expectStoryError(
      () => validateBeatUpdate({ visualPrompt, regenerate: 'yes' }),
      'invalid-request',
    )
    expectStoryError(
      () => validateBeatUpdate({ visualPrompt, modelId: 'x' }),
      'invalid-request',
    )
    expectStoryError(() => validateBeatUpdate([]), 'invalid-request')
  })

  it('rejects invalid prompts and narration', () => {
    expectStoryError(() => validateBeatUpdate({ visualPrompt: 'corto' }), 'invalid-visual-prompt')
    expectStoryError(
      () => validateBeatUpdate({ visualPrompt, narration: 'corta' }),
      'invalid-narration',
    )
  })
})

describe('validateIdempotencyKey', () => {
  it('returns null for absent or empty keys', () => {
    expect(validateIdempotencyKey(undefined)).toBeNull()
    expect(validateIdempotencyKey('')).toBeNull()
  })

  it('accepts the 8..128 allowed pattern', () => {
    expect(validateIdempotencyKey('abcdefgh')).toBe('abcdefgh')
    expect(validateIdempotencyKey('A1._~-xyz')).toBe('A1._~-xyz')
    expect(validateIdempotencyKey('a'.repeat(128))).toBe('a'.repeat(128))
  })

  it('rejects short, long or invalid keys', () => {
    expectStoryError(() => validateIdempotencyKey('abcdefg'), 'invalid-request')
    expectStoryError(() => validateIdempotencyKey('a'.repeat(129)), 'invalid-request')
    expectStoryError(() => validateIdempotencyKey('bad key!'), 'invalid-request')
  })
})

describe('validateUploadRequest', () => {
  it('accepts a valid image and normalizes the content type', () => {
    expect(validateUploadRequest({
      fileName: ' actor.webp ',
      contentType: 'IMAGE/WEBP; charset=binary',
      sizeBytes: 1_024,
    })).toEqual({
      fileName: 'actor.webp',
      contentType: 'image/webp',
      sizeBytes: 1_024,
    })
  })

  it.each([
    'a/b.png',
    'a\\b.png',
    '..',
    'a\u0000b.png',
    '',
    'a'.repeat(201),
  ])('rejects invalid file name %#', (fileName) => {
    expectStoryError(
      () => validateUploadRequest({ fileName, contentType: 'image/png', sizeBytes: 10 }),
      'invalid-file-name',
    )
  })

  it.each(['image/gif', 'text/plain', 'image/svg+xml', 42])(
    'rejects unsupported type %s',
    (contentType) => {
      expectStoryError(
        () => validateUploadRequest({ fileName: 'a.png', contentType, sizeBytes: 10 }),
        'unsupported-reference-type',
      )
    },
  )

  it('rejects empty, oversized and non-integer sizes', () => {
    expectStoryError(
      () => validateUploadRequest({ fileName: 'a.png', contentType: 'image/png', sizeBytes: 0 }),
      'reference-empty',
    )
    expectStoryError(
      () => validateUploadRequest({
        fileName: 'a.png',
        contentType: 'image/png',
        sizeBytes: STORY_MAX_IMAGE_BYTES + 1,
      }),
      'reference-too-large',
    )
    expectStoryError(
      () => validateUploadRequest({ fileName: 'a.png', contentType: 'image/png', sizeBytes: 1.5 }),
      'invalid-request',
    )
  })

  it('rejects unknown fields', () => {
    expectStoryError(
      () => validateUploadRequest({
        fileName: 'a.png',
        contentType: 'image/png',
        sizeBytes: 10,
        fileUrl: MEDIA,
      }),
      'invalid-request',
    )
  })
})

describe('readStoryJsonBody', () => {
  function eventWith(body: string | undefined, contentType: string | undefined) {
    return createTestEvent({
      method: 'POST',
      path: '/api/story',
      headers: contentType === undefined ? {} : { 'content-type': contentType },
      body,
    })
  }

  it('parses a JSON object with an optional charset', async () => {
    await expect(readStoryJsonBody(
      eventWith(JSON.stringify({ premise: PREMISE }), 'application/json; charset=utf-8'),
      STORY_CREATE_MAX_BODY_BYTES,
    )).resolves.toEqual({ premise: PREMISE })
  })

  it.each([
    undefined,
    'text/plain',
    'application/x-www-form-urlencoded',
  ])('rejects content type %s with unsupported-media-type', async (contentType) => {
    await expectBodyError(
      () => readStoryJsonBody(eventWith('{}', contentType), STORY_CREATE_MAX_BODY_BYTES),
      'unsupported-media-type',
    )
  })

  it.each([
    undefined,
    '',
    '{',
    '[]',
    '"text"',
    'null',
  ])('rejects body %# with invalid-request', async (body) => {
    await expectBodyError(
      () => readStoryJsonBody(eventWith(body, 'application/json'), STORY_CREATE_MAX_BODY_BYTES),
      'invalid-request',
    )
  })

  it('rejects bodies over the limit with payload-too-large', async () => {
    const oversized = JSON.stringify({ premise: 'a'.repeat(STORY_UPLOAD_MAX_BODY_BYTES) })

    await expectBodyError(
      () => readStoryJsonBody(eventWith(oversized, 'application/json'), STORY_UPLOAD_MAX_BODY_BYTES),
      'payload-too-large',
    )
  })

  it('enforces the beat body limit independently', async () => {
    const oversized = JSON.stringify({ visualPrompt: 'a'.repeat(STORY_BEAT_MAX_BODY_BYTES) })

    await expectBodyError(
      () => readStoryJsonBody(eventWith(oversized, 'application/json'), STORY_BEAT_MAX_BODY_BYTES),
      'payload-too-large',
    )
  })
})
