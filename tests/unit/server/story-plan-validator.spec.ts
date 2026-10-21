// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DIRECTOR_MAX_LOGLINE_LENGTH,
  DIRECTOR_MAX_NARRATION_LENGTH,
  DIRECTOR_MAX_TITLE_LENGTH,
  DIRECTOR_MAX_VISUAL_PROMPT_LENGTH,
  DIRECTOR_MIN_NARRATION_LENGTH,
  DIRECTOR_MIN_VISUAL_PROMPT_LENGTH,
  containsDirectorMarkup,
  validateDirectorPlan,
} from '../../../server/story/plan-validator'
import plan4 from '../../fixtures/deepseek/deepseek-plan-4.json'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'
import plan6 from '../../fixtures/deepseek/deepseek-plan-6.json'

const BIBLE = plan5.storyBible

function beat(order: number, overrides: Record<string, unknown> = {}) {
  return {
    order,
    sceneRole: order === 1 ? 'establishing' : 'development',
    visualPrompt: `Una escena vertical número ${order} con descripción visual suficiente.`,
    narration: `Narración breve de la escena número ${order}.`,
    characters: [BIBLE.leadCharacterId],
    props: [BIBLE.signaturePropId],
    camera: 'wide',
    continuityFromPrevious: order === 1
      ? null
      : `La escena ${order} continúa desde la escena anterior.`,
    transition: 'cut',
    ...overrides,
  }
}

function planWith(beats: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    title: 'Un título',
    logline: 'Un logline de prueba.',
    storyBible: BIBLE,
    beats,
    ...overrides,
  }
}

describe('plan-validator: valid plans', () => {
  it.each([
    [4, plan4],
    [5, plan5],
    [6, plan6],
  ])('accepts the %i scene fixture with exactly %i beats', (count, plan) => {
    const result = validateDirectorPlan(plan, count)

    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) return

    expect(result.plan.beats).toHaveLength(count)
    expect(result.plan.beats.map((item) => item.order)).toEqual(
      Array.from({ length: count }, (_value, index) => index + 1),
    )
  })

  it('normalizes NFC, trims and collapses narration line breaks', () => {
    const result = validateDirectorPlan(
      planWith(
        [beat(1, {
          visualPrompt: `  Cafe\u0301 con luz cálida y una longitud suficiente.  `,
          narration: '  Primera línea\nsegunda línea  ',
        })],
        { title: '  Título  ', logline: '  Logline  ' },
      ),
      1,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.plan.title).toBe('Título')
    expect(result.plan.logline).toBe('Logline')
    expect(result.plan.beats[0]?.visualPrompt).toBe(
      'Café con luz cálida y una longitud suficiente.',
    )
    expect(result.plan.beats[0]?.narration).toBe('Primera línea segunda línea')
  })

  it('recomputes order from the array position', () => {
    const result = validateDirectorPlan(
      planWith([beat(1), beat(2)]),
      2,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.beats.map((item) => item.order)).toEqual([1, 2])
  })
})

describe('plan-validator: beat count and shape', () => {
  it('rejects a plan with fewer or more beats than requested', () => {
    for (const count of [3, 5, 7]) {
      const result = validateDirectorPlan(planWith([beat(1), beat(2)]), count)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toContain(`exactamente ${count}`)
    }
  })

  it('rejects non-consecutive, duplicated or misplaced order values', () => {
    expect(validateDirectorPlan(planWith([beat(2)]), 1)).toMatchObject({
      ok: false,
      reason: 'beats[0]: order debe ser 1',
    })
    expect(validateDirectorPlan(planWith([beat(1), beat(1)]), 2)).toMatchObject({
      ok: false,
    })
    expect(validateDirectorPlan(planWith([beat(1), beat(3)]), 2)).toMatchObject({
      ok: false,
    })
  })

  it('rejects unknown keys at plan and beat level', () => {
    expect(validateDirectorPlan(planWith([beat(1)], { extra: true }), 1)).toMatchObject({
      ok: false,
      reason: 'plan: forma inválida',
    })
    expect(
      validateDirectorPlan(planWith([beat(1, { style: 'noir' })]), 1),
    ).toMatchObject({ ok: false, reason: 'beats[0]: forma inválida' })
    expect(validateDirectorPlan([], 0)).toMatchObject({ ok: false })
    expect(validateDirectorPlan(null, 4)).toMatchObject({ ok: false })
  })
})

describe('plan-validator: field limits', () => {
  it('validates title length boundaries', () => {
    expect(validateDirectorPlan(planWith([beat(1)], { title: 'a' }), 1).ok).toBe(true)
    expect(
      validateDirectorPlan(planWith([beat(1)], { title: 'a'.repeat(DIRECTOR_MAX_TITLE_LENGTH) }), 1).ok,
    ).toBe(true)
    expect(
      validateDirectorPlan(planWith([beat(1)], { title: 'a'.repeat(DIRECTOR_MAX_TITLE_LENGTH + 1) }), 1),
    ).toMatchObject({ ok: false, reason: 'title: longitud fuera de rango' })
    expect(validateDirectorPlan(planWith([beat(1)], { title: '   ' }), 1)).toMatchObject({
      ok: false,
    })
    expect(validateDirectorPlan(planWith([beat(1)], { title: 42 }), 1)).toMatchObject({
      ok: false,
      reason: 'title: tipo inválido',
    })
  })

  it('validates logline length boundaries', () => {
    expect(
      validateDirectorPlan(planWith([beat(1)], { logline: 'a'.repeat(DIRECTOR_MAX_LOGLINE_LENGTH) }), 1).ok,
    ).toBe(true)
    expect(
      validateDirectorPlan(planWith([beat(1)], { logline: 'a'.repeat(DIRECTOR_MAX_LOGLINE_LENGTH + 1) }), 1),
    ).toMatchObject({ ok: false, reason: 'logline: longitud fuera de rango' })
  })

  it('validates visualPrompt length boundaries', () => {
    expect(
      validateDirectorPlan(planWith([beat(1, { visualPrompt: 'a'.repeat(DIRECTOR_MIN_VISUAL_PROMPT_LENGTH) })]), 1).ok,
    ).toBe(true)
    expect(
      validateDirectorPlan(planWith([beat(1, { visualPrompt: 'a'.repeat(DIRECTOR_MIN_VISUAL_PROMPT_LENGTH - 1) })]), 1),
    ).toMatchObject({ ok: false, reason: 'beats[0].visualPrompt: longitud fuera de rango' })
    expect(
      validateDirectorPlan(planWith([beat(1, { visualPrompt: 'a'.repeat(DIRECTOR_MAX_VISUAL_PROMPT_LENGTH) })]), 1).ok,
    ).toBe(true)
    expect(
      validateDirectorPlan(planWith([beat(1, { visualPrompt: 'a'.repeat(DIRECTOR_MAX_VISUAL_PROMPT_LENGTH + 1) })]), 1),
    ).toMatchObject({ ok: false })
  })

  it('validates narration length boundaries', () => {
    expect(
      validateDirectorPlan(planWith([beat(1, { narration: 'a'.repeat(DIRECTOR_MIN_NARRATION_LENGTH) })]), 1).ok,
    ).toBe(true)
    expect(
      validateDirectorPlan(planWith([beat(1, { narration: 'a'.repeat(DIRECTOR_MIN_NARRATION_LENGTH - 1) })]), 1),
    ).toMatchObject({ ok: false, reason: 'beats[0].narration: longitud fuera de rango' })
    expect(
      validateDirectorPlan(planWith([beat(1, { narration: 'a'.repeat(DIRECTOR_MAX_NARRATION_LENGTH) })]), 1).ok,
    ).toBe(true)
    expect(
      validateDirectorPlan(planWith([beat(1, { narration: 'a'.repeat(DIRECTOR_MAX_NARRATION_LENGTH + 1) })]), 1),
    ).toMatchObject({ ok: false })
  })

  it('rejects HTML, markdown, backticks and control characters', () => {
    for (const value of [
      'Una escena con <b>negrita</b> y longitud suficiente.',
      'Una escena con `código` y longitud suficiente.',
      'Una escena\n# Encabezado markdown',
      'Una escena\n- elemento de lista',
      'Una escena con \u0001 control y longitud suficiente.',
    ]) {
      expect(
        validateDirectorPlan(planWith([beat(1, { visualPrompt: value })]), 1),
        value,
      ).toMatchObject({ ok: false })
    }

    expect(containsDirectorMarkup('<script>')).toBe(true)
    expect(containsDirectorMarkup('texto normal')).toBe(false)
  })
})
