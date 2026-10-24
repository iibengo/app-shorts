// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  BEATS_JSON_SCHEMA,
  CANON_JSON_SCHEMA,
  storyBeatsSystemPrompt,
  storyCanonSystemPrompt,
} from '../../../server/story/narrative-prompt'

describe('narrative prompt concision', () => {
  it('uses the tightened canon schema maxima', () => {
    expect(CANON_JSON_SCHEMA).toContain('"style": "string (10-120)"')
    expect(CANON_JSON_SCHEMA).toContain('"theme": "string (10-120)"')
    expect(CANON_JSON_SCHEMA).toContain('"description": "string (20-90)"')
    expect(CANON_JSON_SCHEMA).toContain('"wardrobe": "string (10-80)"')
    expect(CANON_JSON_SCHEMA).toContain('"description": "string (10-90)"')
    expect(CANON_JSON_SCHEMA).toContain('"description": "string (10-70)"')
    expect(CANON_JSON_SCHEMA).toContain('"forbidden": ["string (2-40), máximo 6"]')
    expect(CANON_JSON_SCHEMA).toContain('"continuityRules": ["string (4-100), máximo 3"]')
  })

  it('uses the tightened beats schema maxima', () => {
    // E3 (2026-10-25): the action is the video prompt. Twenty words gave the
    // model room to invent people and on-screen text.
    expect(BEATS_JSON_SCHEMA).toContain('"action": "string (120-400, una sola acción continua)"')
    expect(BEATS_JSON_SCHEMA).toContain('"narration": "string (10-140)"')
    expect(BEATS_JSON_SCHEMA).toContain('"gag": "string (4-80) o null"')
    expect(BEATS_JSON_SCHEMA).toContain('"stake": "string (12-120)"')
    expect(BEATS_JSON_SCHEMA).not.toContain('"storyBible"')
  })

  it('repeats the same limits in both stage prompts', () => {
    const canon = storyCanonSystemPrompt('creative')
    const beats = storyBeatsSystemPrompt(4, 'creative')

    expect(canon).toContain('style y theme 10–120')
    expect(canon).toContain('máximo 6 prohibiciones')
    expect(canon).toContain('máximo 3 reglas')
    expect(beats).toContain('action (20–240)')
    expect(beats).toContain('narration (10–140)')
    expect(beats).toContain('gag (4–80)')
  })
})
