// @vitest-environment node
/**
 * Deterministic replay of the recorded director eval. No network.
 *
 * Reads `tests/fixtures/eval/director/recorded-latest.json`, feeds the recorded
 * responses through a stub fetch and asserts the thresholds of spec 009.
 * The prompts are not compared: this test protects the parsers and validators
 * against regressions, not the wording of the prompts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  RECORDED_PATH,
  buildDirector,
  loadPremises,
  planFor,
} from '../../eval/director-harness'

const MAX_REPAIRS = 8
const MIN_FIRST_PASS = 7
const MIN_VALID = 11

interface RecordedCall {
  readonly premiseId: string
  readonly index: number
  readonly request: Record<string, unknown>
  readonly response: unknown
}

interface RecordedFile {
  readonly version: number
  readonly runId: string
  readonly calls: readonly RecordedCall[]
}

const hasRecording = existsSync(RECORDED_PATH)

function readRecording(): RecordedFile {
  return JSON.parse(readFileSync(RECORDED_PATH, 'utf8')) as RecordedFile
}

describe.skipIf(!hasRecording)('director eval replay', () => {
  it('rebuilds every recorded plan without network and meets the thresholds', async () => {
    const recording = readRecording()
    const { premises } = loadPremises()
    const callsByPremise = new Map<string, RecordedCall[]>()

    for (const call of recording.calls) {
      const list = callsByPremise.get(call.premiseId) ?? []
      list.push(call)
      callsByPremise.set(call.premiseId, list)
    }

    expect(premises).toHaveLength(12)

    let valid = 0
    let repairs = 0
    let truncations = 0
    let firstPass = 0

    for (const premise of premises) {
      const calls = (callsByPremise.get(premise.id) ?? [])
        .slice()
        .sort((a, b) => a.index - b.index)

      expect(calls.length, `${premise.id}: sin llamadas grabadas`).toBeGreaterThan(0)

      for (const call of calls) {
        expect(call.request.model).toBe('deepseek-flash')
        expect(call.request.response_format).toEqual({ type: 'json_object' })
        expect(call.request.thinking).toEqual({ type: 'disabled' })
        expect(call.request.stream).toBe(false)
        expect(JSON.stringify(call.request)).not.toContain('Authorization')
      }

      let cursor = 0
      const stubFetch = (async () => {
        const call = calls[cursor]
        cursor += 1

        if (call === undefined) {
          throw new Error(`${premise.id}: respuesta grabada insuficiente`)
        }

        return new Response(JSON.stringify(call.response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as typeof fetch

      const { director } = buildDirector({ apiKey: 'eval-replay', fetchImpl: stubFetch })
      // createPlan already validates the composed plan; a successful return is
      // the validity assertion. Re-validating an assembled plan would only
      // re-check the shape of a different type.
      let premiseValid = false

      try {
        await director.createPlan({
          premise: premise.premise,
          mode: premise.mode,
          preset: premise.preset,
          durationPlan: planFor(premise),
          referenceUrl: null,
        })
        premiseValid = true
        valid += 1
      } catch {
        premiseValid = false
      }

      const premiseRepairs = calls.filter((call) => {
        const messages = (call.request.messages ?? []) as readonly { readonly content?: unknown }[]
        const last = messages.at(-1)
        const text = typeof last?.content === 'string' ? last.content : ''

        return /corrige|se trunc/i.test(text)
      }).length
      repairs += premiseRepairs
      if (premiseValid && premiseRepairs === 0) firstPass += 1
      truncations += calls.filter((call) => {
        const response = call.response as {
          readonly choices?: readonly { readonly finish_reason?: unknown }[]
        }

        return response.choices?.[0]?.finish_reason === 'length'
      }).length
    }

    expect(valid).toBeGreaterThanOrEqual(MIN_VALID)
    expect(truncations).toBe(0)
    expect(repairs).toBeLessThanOrEqual(MAX_REPAIRS)
    expect(firstPass).toBeGreaterThanOrEqual(MIN_FIRST_PASS)
  }, 60_000)

  it('keeps the secret out of the recording', () => {
    const raw = readFileSync(RECORDED_PATH, 'utf8')

    expect(raw).not.toContain('Authorization')
    expect(raw).not.toMatch(/sk-[a-z0-9]{8,}/i)
  })
})
