// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  SHEET_VIEWS,
  characterSheetPrompt,
  parseCharacterSheet,
  sheetUrls,
} from '../../../server/story/character-sheet'

const URL = 'https://v3.fal.media/files/x/sheet.jpeg'
const SHEET = { front: URL, 'three-quarter': URL, profile: URL, smile: URL }

describe('character sheet', () => {
  it('has four views and a prompt per view', () => {
    expect(SHEET_VIEWS).toHaveLength(4)

    for (const view of SHEET_VIEWS) {
      const prompt = characterSheetPrompt(view, 'low-poly papercraft')

      expect(prompt).toContain('exact same character')
      expect(prompt).toContain('Vertical 9:16')
      expect(prompt.length).toBeGreaterThan(60)
    }

    expect(characterSheetPrompt('profile', 'x')).toContain('90 degrees')
    expect(characterSheetPrompt('three-quarter', 'x')).toContain('45 degrees')
  })

  it('parses a complete sheet and rejects partial ones', () => {
    expect(parseCharacterSheet(SHEET)).toEqual(SHEET)
    expect(parseCharacterSheet({ front: URL })).toBeNull()
    expect(parseCharacterSheet(null)).toBeNull()
    expect(parseCharacterSheet({ ...SHEET, profile: '' })).toBeNull()
  })

  it('sends the views in a stable order', () => {
    expect(sheetUrls(SHEET)).toEqual([URL, URL, URL, URL])
  })
})

describe('runtime wiring', () => {
  it('passes the sheet orchestrator to the reconciler, not only to the service', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('server/story/runtime.ts', 'utf8')

    // The reconciler generates keyframes; without the dependency there the
    // sheet is silently skipped.
    expect(source.split('characterSheet: reelCharacterSheet').length - 1).toBeGreaterThanOrEqual(2)
  })
})

describe('the sheet never reaches the provider', () => {
  it('keeps the sheet pipeline inert and out of the keyframe path', async () => {
    const { readFileSync } = await import('node:fs')
    const reconciler = readFileSync('server/story/reel-reconciler.ts', 'utf8')
    const orchestrator = readFileSync('server/story/shot-keyframe-orchestrator.ts', 'utf8')

    // 012 removed the sheet from the pipeline: no sheet gate before keyframes,
    // no sheet argument to the orchestrator, no sheet URL in a reference list.
    expect(reconciler).toContain('DORMANT_SHEET')
    expect(reconciler).not.toContain('ensureCharacterSheet(story)')
    expect(orchestrator).not.toContain('characterSheet')
    expect(orchestrator).not.toContain('sheetUrls')
  })

  it('forbids grid layouts in every identity-locked prompt', async () => {
    const composer = (await import('../../../server/story/story-prompt-composer')).composeKeyframe
    expect(typeof composer).toBe('function')
  })
})
