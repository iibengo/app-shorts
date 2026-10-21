import type {
  StoryBible,
  StoryQC,
  StoryQCIssue,
  StoryQCIssueCode,
  StoryQCObserved,
  StoryQCSceneResult,
  StoryQCSeverity,
  StoryQCFrame,
  StoryQCErrorCode,
  StoryQCStatus,
  StoryQCEvaluator,
} from '~/models/story'
import { assertFalMediaUrl } from '../fal/types'
import { sortIssues } from './qc-checker'

const OBSERVATION_KEYS = [
  'characters',
  'wardrobeMismatch',
  'unknownCharacters',
  'props',
  'unknownProps',
  'locationMatches',
  'weatherMatches',
  'timeOfDayMatches',
  'continuityMatches',
  'textOrWatermark',
  'artifacts',
  'confidence',
] as const

const QC_STATUSES: readonly StoryQCStatus[] = ['PASSED', 'NEEDS_REVIEW', 'FAILED', 'UNAVAILABLE']
const QC_EVALUATORS: readonly StoryQCEvaluator[] = ['vision', 'none']
const QC_ERROR_CODES: readonly StoryQCErrorCode[] = [
  'qc-disabled',
  'qc-not-configured',
  'qc-budget-skipped',
  'qc-frames-failed',
  'qc-evaluator-unavailable',
  'qc-evaluator-timeout',
  'qc-evaluator-invalid-output',
]
const QC_SEVERITIES: readonly StoryQCSeverity[] = ['blocking', 'warning']
const QC_FRAMES: readonly StoryQCFrame[] = ['start', 'middle', 'end', 'clip']
const QC_ISSUE_CODES: readonly StoryQCIssueCode[] = [
  'missing-lead-character',
  'missing-character',
  'extra-character',
  'wrong-wardrobe',
  'missing-prop',
  'wrong-prop',
  'wrong-location',
  'wrong-weather',
  'wrong-time-of-day',
  'continuity-break',
  'text-or-watermark',
  'visual-artifact',
  'frames-unavailable',
  'technical-duration',
  'technical-streams',
  'technical-aspect',
  'technical-resolution',
]

export type QCObservationValidation =
  | {
      readonly ok: true
      readonly observed: StoryQCObserved
      readonly confidence: number
    }
  | { readonly ok: false; readonly reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)

  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function filterKnownIds(value: unknown, known: ReadonlySet<string>): readonly string[] | null {
  if (!Array.isArray(value)) return null

  const ids: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') return null
    if (!known.has(item)) continue
    if (!ids.includes(item)) ids.push(item)
  }

  return ids
}

/**
 * Strict validation of the evaluator payload. Unknown ids are discarded, but
 * A structural problem rejects the whole payload so the caller can repair it.
 */
export function validateQCObservation(value: unknown, bible: StoryBible): QCObservationValidation {
  if (!isRecord(value) || !hasExactKeys(value, OBSERVATION_KEYS)) {
    return { ok: false, reason: 'qc: forma inválida' }
  }

  const characterIds = new Set(bible.characters.map((character) => character.id))
  const propIds = new Set(bible.props.map((prop) => prop.id))
  const characters = filterKnownIds(value.characters, characterIds)
  const wardrobeMismatch = filterKnownIds(value.wardrobeMismatch, characterIds)
  const props = filterKnownIds(value.props, propIds)

  if (characters === null || wardrobeMismatch === null || props === null) {
    return { ok: false, reason: 'qc: listas inválidas' }
  }

  const booleans = [
    value.unknownCharacters,
    value.unknownProps,
    value.locationMatches,
    value.weatherMatches,
    value.timeOfDayMatches,
    value.continuityMatches,
    value.textOrWatermark,
    value.artifacts,
  ]

  if (!booleans.every(isBoolean)) {
    return { ok: false, reason: 'qc: booleanos inválidos' }
  }

  const confidence = value.confidence

  if (
    typeof confidence !== 'number'
    || !Number.isFinite(confidence)
    || confidence < 0
    || confidence > 1
  ) {
    return { ok: false, reason: 'qc: confianza fuera de rango' }
  }

  return {
    ok: true,
    observed: {
      characters,
      wardrobeMismatch,
      unknownCharacters: value.unknownCharacters as boolean,
      props,
      unknownProps: value.unknownProps as boolean,
      locationMatches: value.locationMatches as boolean,
      weatherMatches: value.weatherMatches as boolean,
      timeOfDayMatches: value.timeOfDayMatches as boolean,
      continuityMatches: value.continuityMatches as boolean,
      textOrWatermark: value.textOrWatermark as boolean,
      artifacts: value.artifacts as boolean,
    },
    confidence,
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function parseIssue(value: unknown): StoryQCIssue | null {
  if (!isRecord(value)) return null
  if (!hasExactKeys(value, ['code', 'severity', 'sceneId', 'order', 'frame'])) return null

  if (typeof value.code !== 'string' || !QC_ISSUE_CODES.includes(value.code as StoryQCIssueCode)) {
    return null
  }

  if (
    typeof value.severity !== 'string'
    || !QC_SEVERITIES.includes(value.severity as StoryQCSeverity)
  ) {
    return null
  }

  if (typeof value.sceneId !== 'string') return null
  if (typeof value.order !== 'number' || !Number.isInteger(value.order)) return null

  if (typeof value.frame !== 'string' || !QC_FRAMES.includes(value.frame as StoryQCFrame)) {
    return null
  }

  return {
    code: value.code as StoryQCIssueCode,
    severity: value.severity as StoryQCSeverity,
    sceneId: value.sceneId,
    order: value.order,
    frame: value.frame as StoryQCFrame,
  }
}

function parseObserved(value: unknown): StoryQCObserved | null {
  if (!isRecord(value) || !hasExactKeys(value, OBSERVATION_KEYS.slice(0, 11))) return null

  const arrays = [value.characters, value.wardrobeMismatch, value.props]

  if (
    !arrays.every((item) => Array.isArray(item) && item.every((id) => typeof id === 'string'))
  ) {
    return null
  }

  const booleans = [
    value.unknownCharacters,
    value.unknownProps,
    value.locationMatches,
    value.weatherMatches,
    value.timeOfDayMatches,
    value.continuityMatches,
    value.textOrWatermark,
    value.artifacts,
  ]

  if (!booleans.every(isBoolean)) return null

  return {
    characters: value.characters as readonly string[],
    wardrobeMismatch: value.wardrobeMismatch as readonly string[],
    unknownCharacters: value.unknownCharacters as boolean,
    props: value.props as readonly string[],
    unknownProps: value.unknownProps as boolean,
    locationMatches: value.locationMatches as boolean,
    weatherMatches: value.weatherMatches as boolean,
    timeOfDayMatches: value.timeOfDayMatches as boolean,
    continuityMatches: value.continuityMatches as boolean,
    textOrWatermark: value.textOrWatermark as boolean,
    artifacts: value.artifacts as boolean,
  }
}

function safeFramesUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null

  try {
    return assertFalMediaUrl(value)
  } catch {
    return null
  }
}

function parseScene(value: unknown): StoryQCSceneResult | null {
  if (!isRecord(value)) return null
  if (
    !hasExactKeys(value, [
      'sceneId',
      'order',
      'framesUrl',
      'technical',
      'observed',
      'confidence',
      'issues',
    ])
  ) {
    return null
  }

  if (typeof value.sceneId !== 'string') return null
  if (typeof value.order !== 'number' || !Number.isInteger(value.order)) return null
  if (value.framesUrl !== null && typeof value.framesUrl !== 'string') return null
  if (value.technical !== 'pass' && value.technical !== 'fail') return null

  const observed = value.observed === null ? null : parseObserved(value.observed)

  if (value.observed !== null && observed === null) return null

  if (
    value.confidence !== null
    && (
      typeof value.confidence !== 'number'
      || !Number.isFinite(value.confidence)
      || value.confidence < 0
      || value.confidence > 1
    )
  ) {
    return null
  }

  if (!Array.isArray(value.issues)) return null

  const issues: StoryQCIssue[] = []

  for (const issue of value.issues) {
    const parsed = parseIssue(issue)

    if (!parsed) return null
    issues.push(parsed)
  }

  return {
    sceneId: value.sceneId,
    order: value.order,
    framesUrl: safeFramesUrl(value.framesUrl),
    technical: value.technical,
    observed,
    confidence: value.confidence === null ? null : value.confidence as number,
    issues,
  }
}

/**
 * Defensive reader for `Story.qcJson`. A malformed report is downgraded to
 * `null` by the repository instead of breaking the API response.
 */
export function parsePersistedStoryQC(value: unknown): StoryQC | null {
  if (!isRecord(value)) return null
  if (
    !hasExactKeys(value, [
      'status',
      'errorCode',
      'evaluator',
      'confidence',
      'scenes',
      'issues',
      'override',
    ])
  ) {
    return null
  }

  if (typeof value.status !== 'string' || !QC_STATUSES.includes(value.status as StoryQCStatus)) {
    return null
  }

  if (
    value.errorCode !== null
    && (
      typeof value.errorCode !== 'string'
      || !QC_ERROR_CODES.includes(value.errorCode as StoryQCErrorCode)
    )
  ) {
    return null
  }

  if (
    typeof value.evaluator !== 'string'
    || !QC_EVALUATORS.includes(value.evaluator as StoryQCEvaluator)
  ) {
    return null
  }

  if (value.status === 'PASSED' && value.evaluator === 'none') return null

  if (
    value.confidence !== null
    && (
      typeof value.confidence !== 'number'
      || !Number.isFinite(value.confidence)
      || value.confidence < 0
      || value.confidence > 1
    )
  ) {
    return null
  }

  if (!Array.isArray(value.scenes) || value.scenes.length === 0) return null

  const scenes: StoryQCSceneResult[] = []

  for (const scene of value.scenes) {
    const parsed = parseScene(scene)

    if (!parsed) return null
    scenes.push(parsed)
  }

  if (!Array.isArray(value.issues)) return null

  for (const issue of value.issues) {
    if (!parseIssue(issue)) return null
  }

  if (value.override !== null) {
    if (!isRecord(value.override) || !hasExactKeys(value.override, ['at', 'approved'])) {
      return null
    }

    if (!isIsoDate(value.override.at) || value.override.approved !== true) return null
  }

  const scenesWithFrames: StoryQCSceneResult[] = scenes.map((scene) => {
    if (
      scene.framesUrl !== null
      || scene.technical === 'fail'
      || scene.issues.some((entry) => entry.code === 'frames-unavailable')
    ) {
      return scene
    }

    return {
      ...scene,
      issues: [
        ...scene.issues,
        {
          code: 'frames-unavailable',
          severity: 'warning',
          sceneId: scene.sceneId,
          order: scene.order,
          frame: 'clip',
        },
      ],
    }
  })
  const issues = sortIssues(scenesWithFrames.flatMap((scene) => scene.issues))
  const missingFrames = scenesWithFrames.some((scene) => scene.framesUrl === null)
  const status = value.status === 'PASSED' && missingFrames
    ? 'UNAVAILABLE'
    : value.status as StoryQCStatus

  return {
    status,
    errorCode: value.errorCode as StoryQCErrorCode | null,
    evaluator: value.evaluator as StoryQCEvaluator,
    checkedAt: '',
    confidence: value.confidence === null ? null : value.confidence as number,
    scenes: scenesWithFrames,
    issues,
    override: value.override === null
      ? null
      : { at: (value.override as Record<string, unknown>).at as string, approved: true },
  }
}
