// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync('server/story/reel-service.ts', 'utf8')

describe('keyframe dimension reader', () => {
  it('parses PNG and JPEG sizes without extra dependencies', () => {
    expect(SRC).toContain('function readJpegSize')
    expect(SRC).toContain('getUint32(16)')
    expect(SRC).toContain('0xc0 && marker <= 0xcf')
  })

  it('rebuilds a non-vertical keyframe instead of retrying the video', () => {
    expect(SRC).toContain('keyframeIsNotVertical')
    expect(SRC).toContain('rebuild.has(shot.id)')
    expect(SRC).toContain("status: 'KEYFRAME_QUEUED',")
  })
})
