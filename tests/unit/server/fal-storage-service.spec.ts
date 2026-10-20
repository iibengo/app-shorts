// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createFalStorageService } from '../../../server/composer/fal-storage-service'
import type { FalHttpClient, FalHttpRequest } from '../../../server/composer/fal-http-client'
import storageInitiate from '../../fixtures/fal/storage-initiate.json'

const NOW = Date.parse('2026-10-21T18:00:00.000Z')

function createService(
  handler: (request: FalHttpRequest) => Promise<unknown>,
  now = NOW,
) {
  const request = vi.fn(async (input: FalHttpRequest) => ({
    status: 200,
    data: await handler(input) as never,
    headers: new Headers(),
  }))
  const service = createFalStorageService({
    client: { request } as unknown as FalHttpClient,
    storageBaseUrl: 'https://rest.fal.ai/',
    now: () => now,
    randomHex: () => 'abcdef0123456789abcdef01',
  })

  return { service, request }
}

describe('FalStorageService.initiate', () => {
  it('sends the generated file name, content type and lifecycle header', async () => {
    const { service, request } = createService(async () => storageInitiate)

    await service.initiate({
      fileName: 'look-primavera.webp',
      contentType: 'image/webp',
      sizeBytes: 482_133,
    })

    expect(request).toHaveBeenCalledTimes(1)
    const input = request.mock.calls[0]?.[0]
    expect(input).toMatchObject({
      url: 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3',
      method: 'POST',
      timeoutMs: 15_000,
      body: {
        content_type: 'image/webp',
        file_name: 'composer-ref-abcdef0123456789abcdef01.webp',
      },
    })
    expect(input?.headers).toEqual({
      'X-Fal-Object-Lifecycle': '{"expiration_duration_seconds":3600}',
    })
    expect(JSON.stringify(input)).not.toContain('look-primavera.webp')
  })

  it('returns a ticket with only the PUT headers and a one hour expiry', async () => {
    const { service } = createService(async () => storageInitiate)

    const ticket = await service.initiate({
      fileName: 'foto.png',
      contentType: 'image/png',
      sizeBytes: 1_024,
    })

    expect(ticket).toEqual({
      uploadUrl: storageInitiate.upload_url,
      fileUrl: storageInitiate.file_url,
      expiresAt: '2026-10-21T19:00:00.000Z',
      uploadHeaders: {
        'Content-Type': 'image/png',
      },
    })
    expect(Object.keys(ticket.uploadHeaders)).toEqual(['Content-Type'])
    expect(JSON.stringify(ticket.uploadHeaders)).not.toMatch(/authorization|cookie/i)
  })

  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
  ] as const)('maps %s to a .%s storage extension', async (contentType, extension) => {
    const { service, request } = createService(async () => storageInitiate)

    await service.initiate({ fileName: 'x.any', contentType, sizeBytes: 1 })

    expect(request.mock.calls[0]?.[0].body).toMatchObject({
      file_name: `composer-ref-abcdef0123456789abcdef01.${extension}`,
    })
  })

  it('rejects invalid provider output', async () => {
    for (const payload of [
      {},
      { upload_url: storageInitiate.upload_url },
      { file_url: storageInitiate.file_url },
      null,
      'nope',
    ]) {
      const { service } = createService(async () => payload)

      await expect(service.initiate({
        fileName: 'a.png',
        contentType: 'image/png',
        sizeBytes: 1,
      })).rejects.toMatchObject({ code: 'provider-invalid-output' })
    }
  })

  it('rejects an insecure upload URL or a non-CDN file URL', async () => {
    const insecure = createService(async () => ({
      ...storageInitiate,
      upload_url: 'http://v3.fal.media/files/test/upload',
    }))
    await expect(insecure.service.initiate({
      fileName: 'a.png',
      contentType: 'image/png',
      sizeBytes: 1,
    })).rejects.toMatchObject({ code: 'provider-invalid-output' })

    const badHost = createService(async () => ({
      ...storageInitiate,
      file_url: 'https://evil.example/files/a.webp',
    }))
    await expect(badHost.service.initiate({
      fileName: 'a.png',
      contentType: 'image/png',
      sizeBytes: 1,
    })).rejects.toMatchObject({ code: 'provider-invalid-output' })
  })
})
