// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPOSER_FILE_ACCEPT,
  COMPOSER_IMAGE_MIME_TYPES,
  COMPOSER_MAX_IMAGE_BYTES,
  COMPOSER_MAX_PROMPT_LENGTH,
  COMPOSER_MAX_REFERENCES,
  COMPOSER_MAX_VIDEO_BYTES,
  COMPOSER_POSTERS,
  COMPOSER_READY_DELAY_MS,
  COMPOSER_REFERENCE_MIME_TYPES,
  COMPOSER_STAGE_TIMELINE,
  COMPOSER_TITLES,
  COMPOSER_VIDEO_MIME_TYPES,
} from '~/data/composer'

const PUBLIC_ROOT = resolve(process.cwd(), 'public')

const POSTER_CONTRACT = [
  {
    src: '/mock/composer/composer-01.svg',
    alt: 'Póster simulado abstracto violeta con ondas de luz.',
  },
  {
    src: '/mock/composer/composer-02.svg',
    alt: 'Póster simulado abstracto fucsia con formas geométricas.',
  },
  {
    src: '/mock/composer/composer-03.svg',
    alt: 'Póster simulado abstracto índigo con un marco luminoso.',
  },
  {
    src: '/mock/composer/composer-04.svg',
    alt: 'Póster simulado abstracto ámbar con un haz diagonal.',
  },
] as const

const TITLE_CONTRACT = [
  'Una idea que se mueve en vertical',
  'De la idea a la pantalla',
  'Ritmo, luz y un solo mensaje',
  'Tu historia en nueve por dieciséis',
] as const

function readPoster(src: string): string {
  return readFileSync(resolve(PUBLIC_ROOT, `.${src}`), 'utf8')
}

describe('composer fixture contract', () => {
  it('declares the four normative posters in order', () => {
    expect(COMPOSER_POSTERS).toHaveLength(4)

    COMPOSER_POSTERS.forEach((poster, index) => {
      expect(poster.src).toBe(POSTER_CONTRACT[index]?.src)
      expect(poster.alt).toBe(POSTER_CONTRACT[index]?.alt)
      expect(poster.width).toBe(1080)
      expect(poster.height).toBe(1920)
    })
  })

  it('declares the four normative titles in order', () => {
    expect(COMPOSER_TITLES).toEqual([...TITLE_CONTRACT])
  })

  it('declares the normative limits and MIME lists', () => {
    expect(COMPOSER_MAX_REFERENCES).toBe(3)
    expect(COMPOSER_MAX_PROMPT_LENGTH).toBe(280)
    expect(COMPOSER_MAX_IMAGE_BYTES).toBe(8_388_608)
    expect(COMPOSER_MAX_VIDEO_BYTES).toBe(52_428_800)
    expect(COMPOSER_IMAGE_MIME_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
    ])
    expect(COMPOSER_VIDEO_MIME_TYPES).toEqual([
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ])
    expect(COMPOSER_REFERENCE_MIME_TYPES).toEqual([
      ...COMPOSER_IMAGE_MIME_TYPES,
      ...COMPOSER_VIDEO_MIME_TYPES,
    ])
    expect(COMPOSER_FILE_ACCEPT).toBe(
      'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime',
    )
  })

  it('declares the exact generation timeline', () => {
    expect(COMPOSER_STAGE_TIMELINE).toEqual([
      { delayMs: 0, stage: 'analyzing', progress: 15 },
      { delayMs: 800, stage: 'composing', progress: 50 },
      { delayMs: 1600, stage: 'rendering', progress: 80 },
    ])
    expect(COMPOSER_READY_DELAY_MS).toBe(2400)
  })
})

describe('composer poster assets', () => {
  it('ships the four local SVG files below the recommended size', () => {
    for (const poster of POSTER_CONTRACT) {
      const svg = readPoster(poster.src)
      expect(svg.length, poster.src).toBeGreaterThan(0)
      expect(Buffer.byteLength(svg), poster.src).toBeLessThanOrEqual(50 * 1024)
    }
  })

  it('declares 1080 x 1920 dimensions in every poster', () => {
    for (const poster of POSTER_CONTRACT) {
      const svg = readPoster(poster.src)

      expect(svg, poster.src).toMatch(/\bwidth="1080"/)
      expect(svg, poster.src).toMatch(/\bheight="1920"/)
      expect(svg, poster.src).toMatch(/\bviewBox="0 0 1080 1920"/)
    }
  })

  it('contains no text, scripts, raster images, foreignObject or external references', () => {
    for (const poster of POSTER_CONTRACT) {
      const svg = readPoster(poster.src)

      expect(svg, poster.src).not.toMatch(/<text\b/i)
      expect(svg, poster.src).not.toMatch(/<script\b/i)
      expect(svg, poster.src).not.toMatch(/<image\b/i)
      expect(svg, poster.src).not.toMatch(/<foreignObject\b/i)
      expect(svg, poster.src).not.toMatch(/\s(?:href|src)="[^"]*"/i)

      const externalReferences = svg.match(/https?:\/\/[^"' ]+/gi) ?? []
      for (const reference of externalReferences) {
        expect(reference, poster.src).toBe('http://www.w3.org/2000/svg')
      }
    }
  })
})
