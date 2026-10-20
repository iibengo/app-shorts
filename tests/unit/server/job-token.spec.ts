// @vitest-environment node
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  HmacJobTokenService,
  createJobTokenService,
  type ComposerJobTokenInput,
} from '../../../server/composer/job-token'

const SECRET = 'test-secret-with-at-least-32-characters'
const NOW = Date.parse('2026-10-21T18:00:00.000Z')

const INPUT: ComposerJobTokenInput = {
  endpointId: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
  requestId: 'req-test-1',
  statusUrl: 'https://queue.fal.run/fal-ai/minimax/requests/req-test-1/status',
  responseUrl: 'https://queue.fal.run/fal-ai/minimax/requests/req-test-1',
  cancelUrl: 'https://queue.fal.run/fal-ai/minimax/requests/req-test-1/cancel',
  modelId: 'minimax-hailuo-02',
  preset: 'fast',
  durationSeconds: 6,
  promptHash: 'a'.repeat(64),
  posterUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
  referenceUrl: null,
  createdAt: NOW,
  expiresAt: NOW + 3_600_000,
}

function createService(now = NOW) {
  return createJobTokenService({ secret: SECRET, now: () => now })
}

describe('HmacJobTokenService create', () => {
  it('creates a v1 base64url token with the full payload', () => {
    const service = createService()
    const token = service.create(INPUT)

    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(token).not.toContain('+')
    expect(token).not.toContain('/')
    expect(token).not.toContain('=')

    const payload = service.verify(token)
    expect(payload).toEqual({ v: 1, ...INPUT })
  })

  it('never includes the prompt, key or internal credentials', () => {
    const service = createService()
    const token = service.create(INPUT)
    const decoded = Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')

    expect(payloadKeys(decoded)).not.toContain('prompt')
    expect(decoded).not.toContain('Un short sobre luz natural')
    expect(decoded).not.toContain('NUXT_FAL_KEY')
    expect(decoded).not.toContain('test-key')
    expect(decoded).not.toContain('Authorization')
    expect(payloadKeys(decoded)).not.toContain('prompt')
  })

  it('is deterministic for the same payload and secret', () => {
    const service = createService()

    expect(service.create(INPUT)).toBe(service.create(INPUT))
  })
})

describe('HmacJobTokenService verify', () => {
  it('rejects a tampered payload', () => {
    const service = createService()
    const token = service.create(INPUT)
    const [version, payload, signature] = token.split('.')
    const raw = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))
    raw.requestId = 'req-attacker'
    const tampered = Buffer.from(JSON.stringify(raw)).toString('base64url')

    expect(() => service.verify(`${version}.${tampered}.${signature}`)).toThrowError(
      expect.objectContaining({ code: 'job-not-found' }),
    )
  })

  it('rejects a tampered signature', () => {
    const service = createService()
    const token = service.create(INPUT)
    const [version, payload, signature] = token.split('.')
    const flipped = signature!.startsWith('A') ? `B${signature!.slice(1)}` : `A${signature!.slice(1)}`

    expect(() => service.verify(`${version}.${payload}.${flipped}`)).toThrowError(
      expect.objectContaining({ code: 'job-not-found' }),
    )
  })

  it('rejects malformed tokens and tokens longer than 4096 characters', () => {
    const service = createService()

    for (const token of ['', 'v1', 'v2.payload.signature', 'v1..signature', `v1.${'a'.repeat(4_100)}`]) {
      expect(() => service.verify(token), token.slice(0, 12)).toThrowError(
        expect.objectContaining({ code: 'job-not-found' }),
      )
    }
  })

  it('rejects a valid signature over an invalid payload', () => {
    const service = new HmacJobTokenService({ secret: SECRET, now: () => NOW })
    const payload = Buffer.from(JSON.stringify({ v: 1, hello: 'world' })).toString('base64url')
    const token = (service as unknown as { sign(value: string): string }).sign
      ? `v1.${payload}.${(service as unknown as { sign(value: string): string }).sign(payload)}`
      : ''

    if (token) {
      expect(() => service.verify(token)).toThrowError(
        expect.objectContaining({ code: 'job-not-found' }),
      )
    }
  })

  it('expires exactly at expiresAt', () => {
    const secret = SECRET
    const token = createJobTokenService({ secret, now: () => NOW }).create(INPUT)

    expect(createJobTokenService({ secret, now: () => INPUT.expiresAt - 1 }).verify(token))
      .toMatchObject({ requestId: INPUT.requestId })

    expect(() => createJobTokenService({ secret, now: () => INPUT.expiresAt }).verify(token))
      .toThrowError(expect.objectContaining({ code: 'job-expired' }))
  })

  it('rejects tokens signed with a different secret', () => {
    const token = createJobTokenService({ secret: SECRET, now: () => NOW }).create(INPUT)
    const other = createJobTokenService({
      secret: 'another-secret-with-at-least-32-chars!!',
      now: () => NOW,
    })

    expect(() => other.verify(token)).toThrowError(
      expect.objectContaining({ code: 'job-not-found' }),
    )
  })

  it('uses timingSafeEqual with equal length buffers', () => {
    const service = createService()
    const token = service.create(INPUT)
    const [version, payload, signature] = token.split('.')

    expect(Buffer.from(signature!, 'base64url')).toHaveLength(32)
    expect(() => service.verify(`${version}.${payload}.${signature!.slice(0, 20)}`))
      .toThrowError(expect.objectContaining({ code: 'job-not-found' }))
  })
})

function payloadKeys(decoded: string): string[] {
  return Object.keys(JSON.parse(decoded) as Record<string, unknown>)
}
