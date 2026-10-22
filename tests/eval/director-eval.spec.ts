// @vitest-environment node
/**
 * Opt-in director eval. Never runs in the normal suite.
 *
 *   RUN_DIRECTOR_EVAL=1 NUXT_DEEPSEEK_KEY=... npm run eval:director
 *
 * Hard budget: 1 USD per run. No Fal, no FFmpeg, no database.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DirectorLogEvent } from '../../server/story/director-types'
import {
  EVAL_BUDGET_USD,
  EVAL_DIR,
  buildDirector,
  costUsdOf,
  loadPremises,
  planFor,
  readUsage,
  RECORDED_PATH,
} from './director-harness'

const enabled = process.env.RUN_DIRECTOR_EVAL === '1'
const apiKey = process.env.NUXT_DEEPSEEK_KEY ?? ''

interface RecordedCall {
  readonly premiseId: string
  readonly index: number
  readonly durationMs: number
  readonly request: Record<string, unknown>
  readonly response: unknown
}

interface PremiseResult {
  readonly id: string
  readonly ok: boolean
  readonly firstPassValid: boolean
  readonly repairs: number
  readonly truncations: number
  readonly latencyMs: number
  readonly calls: number
  readonly tokens: { readonly prompt: number; readonly completion: number; readonly reasoning: number }
  readonly costUsd: number
  readonly scenes: number | null
  readonly shots: number | null
  readonly failure?: { readonly stage: string; readonly code: string }
}

class BudgetExhausted extends Error {
  constructor() {
    super('eval-budget-exhausted')
  }
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1)

  return sorted[Math.max(0, index)]!
}

describe.skipIf(!enabled)('director eval (opt-in)', () => {
  it('runs every premise, records the exchange and writes the report', async () => {
    if (apiKey.length === 0) {
      throw new Error('eval-not-configured: NUXT_DEEPSEEK_KEY is empty')
    }

    const { premises } = loadPremises()
    const runId = new Date().toISOString()
    const results: PremiseResult[] = []
    const recorded: RecordedCall[] = []
    let spent = 0
    let budgetExhausted = false

    for (const premise of premises) {
      if (spent >= EVAL_BUDGET_USD) {
        budgetExhausted = true
        break
      }

      const events: DirectorLogEvent[] = []
      let callIndex = 0

      const recordingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (spent >= EVAL_BUDGET_USD) throw new BudgetExhausted()

        const started = Date.now()
        const response = await fetch(input, init)
        const clone = response.clone()
        const text = await clone.text()
        const durationMs = Date.now() - started
        let payload: unknown = null

        try {
          payload = JSON.parse(text)
        } catch {
          payload = null
        }

        const usage = readUsage(payload)
        spent += costUsdOf(usage.promptTokens, usage.completionTokens)

        recorded.push({
          premiseId: premise.id,
          index: callIndex,
          durationMs,
          request: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
          response: payload,
        })
        callIndex += 1

        return response
      }) as typeof fetch

      const { director } = buildDirector({
        apiKey,
        fetchImpl: recordingFetch,
        ...(process.env.NUXT_DEEPSEEK_BASE_URL === undefined
          ? {}
          : { baseUrl: process.env.NUXT_DEEPSEEK_BASE_URL }),
        onEvent: (event) => events.push(event),
      })

      const startedAt = Date.now()
      let scenes: number | null = null
      let shots: number | null = null

      try {
        const plan = await director.createPlan({
          premise: premise.premise,
          mode: premise.mode,
          preset: premise.preset,
          durationPlan: planFor(premise),
          referenceUrl: null,
        })

        scenes = plan.plan.scenes.length
        shots = plan.shotPlan.scenes.reduce((total, scene) => total + scene.shots.length, 0)
      } catch (error) {
        const failure = error as { readonly code?: unknown; readonly message?: unknown }
        const code = typeof failure.code === 'string' ? failure.code : 'unknown'
        const repairs = events.filter((event) => event.attempt === 2).length
        const truncations = events.filter((event) => event.finishReason === 'length').length

        results.push({
          id: premise.id,
          ok: false,
          firstPassValid: false,
          repairs,
          truncations,
          latencyMs: Date.now() - startedAt,
          calls: callIndex,
          tokens: { prompt: 0, completion: 0, reasoning: 0 },
          costUsd: 0,
          scenes: null,
          shots: null,
          failure: { stage: events.at(-1)?.stage ?? 'unknown', code },
        })

        if (error instanceof BudgetExhausted) {
          budgetExhausted = true
          break
        }

        continue
      }

      const repairs = events.filter((event) => event.attempt === 2).length
      const truncations = events.filter((event) => event.finishReason === 'length').length
      const tokens = recorded
        .filter((call) => call.premiseId === premise.id)
        .reduce((totals, call) => {
          const usage = readUsage(call.response)

          return {
            prompt: totals.prompt + usage.promptTokens,
            completion: totals.completion + usage.completionTokens,
            reasoning: totals.reasoning + usage.reasoningTokens,
          }
        }, { prompt: 0, completion: 0, reasoning: 0 })

      results.push({
        id: premise.id,
        ok: true,
        firstPassValid: repairs === 0,
        repairs,
        truncations,
        latencyMs: Date.now() - startedAt,
        calls: callIndex,
        tokens,
        costUsd: costUsdOf(tokens.prompt, tokens.completion),
        scenes,
        shots,
      })
    }

    const totalsCost = results.reduce((total, result) => total + result.costUsd, 0)
    const latencies = recorded.map((call) => call.durationMs)
    const report = {
      runId,
      model: 'deepseek-flash',
      thinking: 'disabled',
      budgetUsd: EVAL_BUDGET_USD,
      budgetExhausted,
      totals: {
        premises: results.length,
        calls: recorded.length,
        costUsd: Number(totalsCost.toFixed(6)),
        p50Ms: percentile(latencies, 0.5),
        p95Ms: percentile(latencies, 0.95),
      },
      premises: results,
    }

    mkdirSync(join(EVAL_DIR, 'runs'), { recursive: true })
    writeFileSync(join(EVAL_DIR, 'runs', `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(RECORDED_PATH, `${JSON.stringify({
      version: 1,
      runId,
      calls: recorded.map((call) => ({
        premiseId: call.premiseId,
        index: call.index,
        request: call.request,
        response: call.response,
      })),
    }, null, 2)}\n`)

    // Only ids and metrics: never the premise text, the prompts or the key.
    for (const result of results) {
      console.log(
        `${result.id} ok=${result.ok} firstPass=${result.firstPassValid} repairs=${result.repairs} `
        + `trunc=${result.truncations} tokens=${result.tokens.prompt}/${result.tokens.completion} `
        + `usd=${result.costUsd.toFixed(6)} ms=${result.latencyMs}`,
      )
    }

    expect(results.length).toBeGreaterThan(0)
    expect(recorded.every((call) => {
      const thinking = call.request.thinking as { readonly type?: unknown } | undefined

      return thinking?.type === 'disabled'
    })).toBe(true)
  }, 900_000)
})
