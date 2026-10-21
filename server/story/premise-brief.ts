/**
 * Deterministic premise pre-analysis for the Story director.
 *
 * Pure module: no I/O, no environment, no clock, no randomness and no mutable
 * state between calls. The premise only contributes metrics; every directive is
 * a fixed server-side constant, so no user text is interpolated.
 */
import { normalizeText } from '../shared/prompt'

export type StoryBriefSignal = 'short-text' | 'few-words' | 'single-clause'

export type StoryBrief =
  | { readonly applied: false; readonly reasons: readonly [] }
  | {
      readonly applied: true
      readonly reasons: readonly StoryBriefSignal[]
      readonly directives: readonly string[]
      readonly rendered: string
    }

export interface PremiseBriefAnalysis {
  readonly normalizedLength: number
  readonly wordCount: number
  readonly clauseCount: number
  readonly brief: StoryBrief
}

export const BRIEF_SHORT_TEXT_THRESHOLD = 60
export const BRIEF_FEW_WORDS_THRESHOLD = 9
export const BRIEF_SINGLE_CLAUSE_THRESHOLD = 2
export const BRIEF_MAX_DIRECTIVES = 5
export const BRIEF_MAX_DIRECTIVE_LENGTH = 120
export const BRIEF_MAX_RENDERED_LENGTH = 500

const BRIEF_HEADER = 'Brief de producción (no sustituye la premisa):'

/**
 * Production directives: place, time, atmosphere, wardrobe, light and framing,
 * plus an explicit ban on changing topic, characters or outcome. They never
 * mention the premise content and never contain markup, URLs or provider names.
 */
const BRIEF_DIRECTIVES: readonly string[] = Object.freeze([
  'Concreta el lugar, la época o la hora de cada escena.',
  'Concreta la atmósfera y el vestuario de cada escena.',
  'Concreta la luz y el encuadre vertical de cada plano.',
  'No cambies el tema ni los personajes de la premisa.',
  'No cambies el desenlace de la premisa.',
])

function composeBlock(directives: readonly string[]): string {
  return [BRIEF_HEADER, ...directives].join('\n')
}

/**
 * Renders the block that is appended to the director user message.
 * Returns an empty string when the brief is inactive.
 */
export function renderBriefBlock(brief: StoryBrief): string {
  if (!brief.applied) {
    return ''
  }

  return composeBlock(brief.directives)
}

function countWords(normalized: string): number {
  return normalized
    .split(/\s+/u)
    .filter((segment) => segment.length > 0)
    .length
}

function countClauses(normalized: string): number {
  // Whitespace is collapsed first so internal line breaks or tabs are not read
  // as clause boundaries of their own.
  const collapsed = normalized.replace(/\s+/gu, ' ')
  const separated = collapsed
    .replace(/[,;:.]+/gu, '\n')
    .replace(/\b(?:y|pero|luego|cuando)\b/giu, '\n')
  const segments = separated
    .split('\n')
    .filter((segment) => segment.trim().length > 0)

  return Math.max(1, segments.length)
}

function createBrief(reasons: readonly StoryBriefSignal[]): StoryBrief {
  const directives = [...BRIEF_DIRECTIVES]

  return {
    applied: true,
    reasons,
    directives,
    rendered: composeBlock(directives),
  }
}

export function analyzePremise(premise: string): PremiseBriefAnalysis {
  const normalized = normalizeText(premise)
  const normalizedLength = normalized.length
  const wordCount = countWords(normalized)
  const clauseCount = countClauses(normalized)

  const applied =
    normalizedLength < BRIEF_SHORT_TEXT_THRESHOLD
    || wordCount < BRIEF_FEW_WORDS_THRESHOLD
    || clauseCount < BRIEF_SINGLE_CLAUSE_THRESHOLD

  const reasons: StoryBriefSignal[] = []

  if (normalizedLength < BRIEF_SHORT_TEXT_THRESHOLD) {
    reasons.push('short-text')
  }

  if (wordCount < BRIEF_FEW_WORDS_THRESHOLD) {
    reasons.push('few-words')
  }

  if (clauseCount < BRIEF_SINGLE_CLAUSE_THRESHOLD) {
    reasons.push('single-clause')
  }

  return {
    normalizedLength,
    wordCount,
    clauseCount,
    brief: applied ? createBrief(reasons) : { applied: false, reasons: [] },
  }
}
