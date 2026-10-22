import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  StoryCostMode,
  StoryDurationSeconds,
  StoryMode,
  StoryPreset,
} from '~/models/story'
import { durationPlanFor } from '../../server/story/cost-profiles'
import {
  createDeepSeekClient,
  DEFAULT_DEEPSEEK_BASE_URL,
} from '../../server/story/deepseek-client'
import type { DirectorLogEvent } from '../../server/story/director-types'
import { createReelStoryDirector } from '../../server/story/reel-director'
import { createReelNarrativeDirector } from '../../server/story/reel-narrative-director'
import { createReelShotDirector } from '../../server/story/reel-shot-director'

export const PREMISES_PATH = join(process.cwd(), 'tests/fixtures/eval/director-premises.json')
export const EVAL_DIR = join(process.cwd(), 'tests/fixtures/eval/director')
export const RECORDED_PATH = join(EVAL_DIR, 'recorded-latest.json')

/** Prices of `deepseek/deepseek-flash` in USD per million tokens. */
export const PRICE_INPUT_USD_PER_MTOKEN = 0.15
export const PRICE_OUTPUT_USD_PER_MTOKEN = 0.6

export const EVAL_BUDGET_USD = 1

export interface EvalPremise {
  readonly id: string
  readonly premise: string
  readonly mode: StoryMode
  readonly costMode: StoryCostMode
  readonly durationSeconds: StoryDurationSeconds
  readonly preset: StoryPreset
  readonly hasReference: boolean
}

export interface PremiseFile {
  readonly version: number
  readonly premises: readonly EvalPremise[]
}

const MODES: readonly StoryMode[] = ['faithful', 'creative']
const COST_MODES: readonly StoryCostMode[] = ['budget', 'standard']
const DURATIONS: readonly StoryDurationSeconds[] = [15, 30, 45]
const PRESETS: readonly StoryPreset[] = ['fast', 'quality']

function assertPremise(value: unknown, index: number): EvalPremise {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`premises[${index}]: no es un objeto`)
  }

  const premise = value as Record<string, unknown>
  const id = premise.id
  const text = premise.premise
  const mode = premise.mode
  const costMode = premise.costMode
  const duration = premise.durationSeconds
  const preset = premise.preset

  if (typeof id !== 'string' || !/^p[0-9]{2}$/.test(id)) {
    throw new Error(`premises[${index}]: id inválido`)
  }
  if (typeof text !== 'string' || text.length < 10 || text.length > 600) {
    throw new Error(`premises[${index}]: premisa fuera de 10-600`)
  }
  if (!MODES.includes(mode as StoryMode)) {
    throw new Error(`premises[${index}]: mode inválido`)
  }
  if (!COST_MODES.includes(costMode as StoryCostMode)) {
    throw new Error(`premises[${index}]: costMode inválido`)
  }
  if (!DURATIONS.includes(duration as StoryDurationSeconds)) {
    throw new Error(`premises[${index}]: durationSeconds inválido`)
  }
  if (!PRESETS.includes(preset as StoryPreset)) {
    throw new Error(`premises[${index}]: preset inválido`)
  }
  if (premise.hasReference !== false) {
    throw new Error(`premises[${index}]: hasReference debe ser false`)
  }

  return {
    id,
    premise: text,
    mode: mode as StoryMode,
    costMode: costMode as StoryCostMode,
    durationSeconds: duration as StoryDurationSeconds,
    preset: preset as StoryPreset,
    hasReference: false,
  }
}

export function parsePremises(raw: unknown): PremiseFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('premises: formato inválido')
  }

  const file = raw as Record<string, unknown>

  if (file.version !== 1 || !Array.isArray(file.premises)) {
    throw new Error('premises: se espera version 1 y un array premises')
  }

  const premises = file.premises.map((item, index) => assertPremise(item, index))
  const ids = new Set(premises.map((item) => item.id))

  if (ids.size !== premises.length) {
    throw new Error('premises: ids duplicados')
  }

  return { version: 1, premises }
}

export function loadPremises(): PremiseFile {
  return parsePremises(JSON.parse(readFileSync(PREMISES_PATH, 'utf8')))
}

export function planFor(premise: EvalPremise) {
  return durationPlanFor(premise.costMode, premise.durationSeconds, 'tiktok', premise.hasReference)
}

export interface DirectorBundle {
  readonly director: ReturnType<typeof createReelStoryDirector>
}

export function buildDirector(options: {
  readonly apiKey: string
  readonly fetchImpl: typeof fetch
  readonly baseUrl?: string
  readonly onEvent?: (event: DirectorLogEvent) => void
}): DirectorBundle {
  const client = createDeepSeekClient({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL,
    fetchImpl: options.fetchImpl,
  })
  const narrative = createReelNarrativeDirector({
    client,
    ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
  })
  const shots = createReelShotDirector({
    client,
    ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
  })

  return { director: createReelStoryDirector({ narrative, shots }) }
}

export function costUsdOf(promptTokens: number, completionTokens: number): number {
  return (promptTokens * PRICE_INPUT_USD_PER_MTOKEN
    + completionTokens * PRICE_OUTPUT_USD_PER_MTOKEN) / 1_000_000
}

export function readUsage(payload: unknown): {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly reasoningTokens: number
} {
  const root = typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {}
  const usage = typeof root.usage === 'object' && root.usage !== null
    ? root.usage as Record<string, unknown>
    : {}
  const details = typeof usage.completion_tokens_details === 'object'
    && usage.completion_tokens_details !== null
    ? usage.completion_tokens_details as Record<string, unknown>
    : {}
  const read = (value: unknown): number => (typeof value === 'number' ? value : 0)

  return {
    promptTokens: read(usage.prompt_tokens),
    completionTokens: read(usage.completion_tokens),
    reasoningTokens: read(details.reasoning_tokens) || read(usage.reasoning_tokens),
  }
}
