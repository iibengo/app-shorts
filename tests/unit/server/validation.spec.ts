// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  canonicalGenerationBody,
  canonicalUploadBody,
  isDurationAllowed,
  isJsonContentType,
  normalizeImageContentType,
  readJsonBody,
  validateDuration,
  validateFileName,
  validateGenerateRequest,
  validateIdempotencyKey,
  validatePreset,
  validatePrompt,
  validateReferenceUrl,
  validateSizeBytes,
  validateUploadRequest,
} from '../../../server/composer/validation'
import { createTestEvent } from '../../helpers/h3'

const MEDIA_URL = 'https://v3.fal.media/files/test/reference.webp'

function errorCode(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown'
  }

  return 'no-error'
}

describe('JSON body parsing', () => {
  it('accepts application/json with optional charset', () => {
    expect(isJsonContentType('application/json')).toBe(true)
    expect(isJsonContentType('Application/JSON; charset=utf-8')).toBe(true)
    expect(isJsonContentType('text/plain')).toBe(false)
    expect(isJsonContentType(undefined)).toBe(false)
  })

  it('rejects a non JSON Content-Type with 415', async () => {
    const event = createTestEvent({
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    })

    await expect(readJsonBody(event, 1024)).rejects.toMatchObject({
      code: 'unsupported-media-type',
    })
  })

  it('parses valid JSON objects', async () => {
    const event = createTestEvent({
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ prompt: 'Idea' }),
    })

    await expect(readJsonBody(event, 1024)).resolves.toEqual({ prompt: 'Idea' })
  })

  it('rejects invalid JSON, arrays and oversized bodies', async () => {
    const invalid = createTestEvent({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ nope',
    })
    await expect(readJsonBody(invalid, 1024)).rejects.toMatchObject({
      code: 'invalid-request',
    })

    const array = createTestEvent({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[]',
    })
    await expect(readJsonBody(array, 1024)).rejects.toMatchObject({
      code: 'invalid-request',
    })

    const large = createTestEvent({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x'.repeat(2_000) }),
    })
    await expect(readJsonBody(large, 1_024)).rejects.toMatchObject({
      code: 'payload-too-large',
    })
  })

  it('rejects a missing body', async () => {
    const event = createTestEvent({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })

    await expect(readJsonBody(event, 1024)).rejects.toMatchObject({
      code: 'invalid-request',
    })
  })
})

describe('prompt validation', () => {
  it('normalises with NFC and trims without collapsing internal newlines', () => {
    expect(validatePrompt('  Cafe\u0301\nlinea  ')).toBe('Café\nlinea')
  })

  it('requires a non-empty prompt and keeps the exact codes', () => {
    expect(errorCode(() => validatePrompt(undefined))).toBe('prompt-required')
    expect(errorCode(() => validatePrompt('   '))).toBe('prompt-required')
    expect(validatePrompt('a'.repeat(280))).toHaveLength(280)
    expect(errorCode(() => validatePrompt('a'.repeat(281)))).toBe('prompt-too-long')
  })

  it('rejects control characters but allows tabs and newlines', () => {
    expect(validatePrompt('Idea\ncon\tsalto')).toBe('Idea\ncon\tsalto')
    expect(errorCode(() => validatePrompt('Idea\u0000'))).toBe('invalid-prompt')
    expect(errorCode(() => validatePrompt('Idea\u0007'))).toBe('invalid-prompt')
  })
})

describe('preset and duration validation', () => {
  it('defaults the preset to fast and rejects unknown values', () => {
    expect(validatePreset(undefined)).toBe('fast')
    expect(validatePreset('fast')).toBe('fast')
    expect(validatePreset('quality')).toBe('quality')
    expect(errorCode(() => validatePreset('pro'))).toBe('invalid-preset')
    expect(errorCode(() => validatePreset(1))).toBe('invalid-preset')
  })

  it('defaults the duration per preset and rejects non allowed values', () => {
    expect(validateDuration(undefined, 'fast')).toBe(6)
    expect(validateDuration(undefined, 'quality')).toBe(5)
    expect(validateDuration(6, 'fast')).toBe(6)
    expect(validateDuration(10, 'fast')).toBe(10)
    expect(validateDuration(5, 'quality')).toBe(5)
    expect(validateDuration(10, 'quality')).toBe(10)

    expect(errorCode(() => validateDuration(5, 'fast'))).toBe('invalid-duration')
    expect(errorCode(() => validateDuration(6, 'quality'))).toBe('invalid-duration')
    expect(errorCode(() => validateDuration(7, 'fast'))).toBe('invalid-duration')
    expect(errorCode(() => validateDuration(6.5, 'fast'))).toBe('invalid-duration')
    expect(errorCode(() => validateDuration('6', 'fast'))).toBe('invalid-duration')
    expect(isDurationAllowed('fast', 10)).toBe(true)
    expect(isDurationAllowed('fast', 5)).toBe(false)
  })
})

describe('reference URL validation', () => {
  it('accepts null, undefined and the exact Fal CDN hosts', () => {
    expect(validateReferenceUrl(undefined)).toBeNull()
    expect(validateReferenceUrl(null)).toBeNull()
    expect(validateReferenceUrl(MEDIA_URL)).toContain('v3.fal.media')
    expect(validateReferenceUrl('https://fal.media/files/test/a.jpeg')).toContain('fal.media')
    expect(validateReferenceUrl('https://v3b.fal.media/files/test/a.jpeg')).toContain('v3b.fal.media')
  })

  it('rejects other hosts, protocols, credentials, fragments and ports', () => {
    for (const value of [
      'http://v3.fal.media/files/test/a.webp',
      'https://evil.example/files/a.webp',
      'https://user:pass@v3.fal.media/files/a.webp',
      'https://v3.fal.media:8443/files/a.webp',
      'https://v3.fal.media/files/a.webp#fragment',
      'not-a-url',
      42,
    ]) {
      expect(errorCode(() => validateReferenceUrl(value)), String(value)).toBe(
        'invalid-reference',
      )
    }
  })
})

describe('generate request validation', () => {
  it('normalises defaults and rejects unknown fields', () => {
    expect(
      validateGenerateRequest({
        prompt: '  Un short  ',
        referenceUrl: null,
      }),
    ).toEqual({
      prompt: 'Un short',
      preset: 'fast',
      durationSeconds: 6,
      referenceUrl: null,
    })

    expect(
      validateGenerateRequest({
        prompt: 'Idea',
        preset: 'quality',
        durationSeconds: 10,
        referenceUrl: MEDIA_URL,
      }),
    ).toEqual({
      prompt: 'Idea',
      preset: 'quality',
      durationSeconds: 10,
      referenceUrl: MEDIA_URL,
    })

    for (const field of [
      'endpointId',
      'model',
      'modelId',
      'image_url',
      'status_url',
      'response_url',
      'cancel_url',
      'webhookUrl',
      'mode',
      'imageOnly',
    ]) {
      expect(
        errorCode(() => validateGenerateRequest({ prompt: 'Idea', [field]: 'x' })),
        field,
      ).toBe('invalid-request')
    }
  })

  it('rejects non-object payloads', () => {
    expect(errorCode(() => validateGenerateRequest(null))).toBe('invalid-request')
    expect(errorCode(() => validateGenerateRequest([]))).toBe('invalid-request')
  })
})

describe('upload request validation', () => {
  it('validates and normalises the ticket request', () => {
    expect(
      validateUploadRequest({
        fileName: '  look-primavera.webp  ',
        contentType: 'image/webp; charset=binary',
        sizeBytes: 482_133,
      }),
    ).toEqual({
      fileName: 'look-primavera.webp',
      contentType: 'image/webp',
      sizeBytes: 482_133,
    })
  })

  it('rejects unsafe file names', () => {
    for (const fileName of [
      '',
      '   ',
      '../x.png',
      'a/b.png',
      'a\\b.png',
      'x'.repeat(201),
      'foto\u0000.png',
      'foto\u0007.png',
      12,
    ]) {
      expect(errorCode(() => validateFileName(fileName)), String(fileName)).toBe(
        'invalid-file-name',
      )
    }
  })

  it('accepts only the three image MIME types', () => {
    expect(normalizeImageContentType('IMAGE/PNG; charset=binary')).toBe('image/png')
    expect(normalizeImageContentType('image/jpeg')).toBe('image/jpeg')
    for (const contentType of ['image/gif', 'image/svg+xml', 'video/mp4', '', undefined]) {
      expect(errorCode(() => normalizeImageContentType(contentType))).toBe(
        'unsupported-reference-type',
      )
    }
  })

  it('enforces the 1 byte to 8 MiB range', () => {
    expect(validateSizeBytes(1)).toBe(1)
    expect(validateSizeBytes(8_388_608)).toBe(8_388_608)
    expect(errorCode(() => validateSizeBytes(0))).toBe('reference-empty')
    expect(errorCode(() => validateSizeBytes(-1))).toBe('reference-empty')
    expect(errorCode(() => validateSizeBytes(8_388_609))).toBe('reference-too-large')
    expect(errorCode(() => validateSizeBytes(1.5))).toBe('invalid-request')
    expect(errorCode(() => validateSizeBytes('10'))).toBe('invalid-request')
  })

  it('rejects unknown fields', () => {
    expect(
      errorCode(() => validateUploadRequest({
        fileName: 'a.png',
        contentType: 'image/png',
        sizeBytes: 10,
        endpointId: 'x',
      })),
    ).toBe('invalid-request')
  })
})

describe('idempotency keys and canonical bodies', () => {
  it('accepts 8-128 characters from the allowed alphabet', () => {
    expect(validateIdempotencyKey(undefined)).toBeNull()
    expect(validateIdempotencyKey('')).toBeNull()
    expect(validateIdempotencyKey('abcd1234')).toBe('abcd1234')
    expect(validateIdempotencyKey('A.b_c~d-12345678')).toBe('A.b_c~d-12345678')
    expect(validateIdempotencyKey('x'.repeat(128))).toHaveLength(128)

    for (const key of ['short', 'x'.repeat(129), 'invalid key', 'emoji-😀']) {
      expect(errorCode(() => validateIdempotencyKey(key)), key).toBe('invalid-request')
    }
  })

  it('builds stable canonical bodies independent of key order', () => {
    const first = canonicalGenerationBody({
      prompt: 'Idea',
      preset: 'fast',
      durationSeconds: 6,
      referenceUrl: null,
    })
    const second = canonicalGenerationBody({
      referenceUrl: null,
      durationSeconds: 6,
      preset: 'fast',
      prompt: 'Idea',
    })

    expect(first).toBe(second)
    expect(canonicalUploadBody({
      fileName: 'a.png',
      contentType: 'image/png',
      sizeBytes: 10,
    })).toBe('["a.png","image/png",10]')
  })
})
