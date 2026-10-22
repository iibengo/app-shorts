import type {
  StoryQCEvaluator,
  StoryQCFrame,
  StoryQCIssue,
  StoryQCIssueCode,
  StoryQCObserved,
  StoryQCSceneResult,
  StoryQCSeverity,
  StoryQCStatus,
  StoryQCErrorCode,
} from '~/models/story'
import type { QCSceneExpectation } from './qc-types'

const FRAME_ORDER: Readonly<Record<StoryQCFrame, number>> = {
  start: 0,
  middle: 1,
  end: 2,
  clip: 3,
}

const SEVERITY_ORDER: Readonly<Record<StoryQCSeverity, number>> = {
  blocking: 0,
  warning: 1,
}

export function issue(
  code: StoryQCIssueCode,
  severity: StoryQCSeverity,
  expectation: Pick<QCSceneExpectation, 'sceneId' | 'order'>,
  frame: StoryQCFrame,
): StoryQCIssue {
  return {
    code,
    severity,
    sceneId: expectation.sceneId,
    order: expectation.order,
    frame,
  }
}

export function technicalIssues(
  scene: { readonly sceneId: string; readonly order: number },
  codes: readonly StoryQCIssueCode[],
): StoryQCIssue[] {
  return codes.map((code) => issue(code, 'blocking', scene, 'clip'))
}

/**
 * Deterministic observation → issues comparator (FR-245). It never invents
 * PASS: an absent observation yields no observation-derived issues, and the
 * aggregation downgrades the result.
 */
export function compareScene(input: {
  readonly expectation: QCSceneExpectation
  readonly observed: StoryQCObserved
  readonly framesAvailable: boolean
}): StoryQCIssue[] {
  const { expectation, observed } = input
  const issues: StoryQCIssue[] = []
  const expectedCharacters = new Set(expectation.characters)
  const expectedProps = new Set(expectation.props)

  if (
    expectation.characters.includes(expectation.leadCharacterId)
    && !observed.characters.includes(expectation.leadCharacterId)
  ) {
    issues.push(issue('missing-lead-character', 'blocking', expectation, 'middle'))
  }

  for (const id of expectation.characters) {
    if (id === expectation.leadCharacterId) continue
    if (!observed.characters.includes(id)) {
      issues.push(issue('missing-character', 'blocking', expectation, 'middle'))
    }
  }

  if (observed.unknownCharacters) {
    issues.push(issue('extra-character', 'blocking', expectation, 'middle'))
  }

  for (const id of observed.characters) {
    if (!expectedCharacters.has(id)) {
      issues.push(issue('extra-character', 'blocking', expectation, 'middle'))
      break
    }
  }

  if (observed.wardrobeMismatch.length > 0) {
    issues.push(issue('wrong-wardrobe', 'blocking', expectation, 'middle'))
  }

  const missingProps = expectation.props.filter((id) => !observed.props.includes(id))

  if (missingProps.length > 0) {
    const signatureMissing =
      expectation.signaturePropId !== null
      && missingProps.includes(expectation.signaturePropId)

    issues.push(
      issue(
        'missing-prop',
        signatureMissing ? 'blocking' : 'warning',
        expectation,
        'middle',
      ),
    )
  }

  if (observed.unknownProps) {
    issues.push(issue('wrong-prop', 'blocking', expectation, 'middle'))
  }

  for (const id of observed.props) {
    if (!expectedProps.has(id)) {
      issues.push(issue('wrong-prop', 'blocking', expectation, 'middle'))
      break
    }
  }

  if (!observed.locationMatches) {
    issues.push(issue('wrong-location', 'blocking', expectation, 'start'))
  }

  if (!observed.weatherMatches) {
    issues.push(issue('wrong-weather', 'blocking', expectation, 'start'))
  }

  if (!observed.timeOfDayMatches) {
    issues.push(issue('wrong-time-of-day', 'blocking', expectation, 'start'))
  }

  if (!observed.continuityMatches) {
    issues.push(issue('continuity-break', 'blocking', expectation, 'end'))
  }

  if (observed.textOrWatermark) {
    issues.push(issue('text-or-watermark', 'blocking', expectation, 'middle'))
  }

  if (observed.artifacts) {
    issues.push(issue('visual-artifact', 'warning', expectation, 'middle'))
  }

  if (!input.framesAvailable) {
    issues.push(issue('frames-unavailable', 'warning', expectation, 'clip'))
  }

  return dedupeIssues(issues)
}

function dedupeIssues(issues: readonly StoryQCIssue[]): StoryQCIssue[] {
  const seen = new Set<string>()
  const result: StoryQCIssue[] = []

  for (const entry of issues) {
    const key = `${entry.code}:${entry.sceneId}:${entry.frame}`

    if (seen.has(key)) continue

    seen.add(key)
    result.push(entry)
  }

  return result
}

export function sortIssues(issues: readonly StoryQCIssue[]): StoryQCIssue[] {
  return issues.slice().sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]

    if (severity !== 0) return severity
    if (a.order !== b.order) return a.order - b.order

    return FRAME_ORDER[a.frame] - FRAME_ORDER[b.frame]
  })
}

export interface QCAggregation {
  readonly status: StoryQCStatus
  readonly confidence: number | null
  readonly issues: readonly StoryQCIssue[]
}

/**
 * Normative aggregation (FR-246). `PASSED` requires a valid observation for
 * every scene, a vision evaluator and the minimum confidence above threshold.
 */
export function aggregateQc(input: {
  readonly scenes: readonly StoryQCSceneResult[]
  readonly evaluator: StoryQCEvaluator
  readonly minConfidence: number
  readonly errorCode: StoryQCErrorCode | null
}): QCAggregation {
  const issues = sortIssues(input.scenes.flatMap((scene) => scene.issues))
  const blocking = issues.some((entry) => entry.severity === 'blocking')
  const observed = input.scenes
    .map((scene) => scene.confidence)
    .filter((value): value is number => value !== null)
  const confidence = observed.length === input.scenes.length && observed.length > 0
    ? Math.min(...observed)
    : null

  if (blocking) {
    return { status: 'FAILED', confidence, issues }
  }

  if (
    input.errorCode !== null
    || input.evaluator === 'none'
    || input.scenes.length === 0
    || input.scenes.some((scene) => scene.observed === null)
  ) {
    return { status: 'UNAVAILABLE', confidence: null, issues }
  }

  if (confidence === null || confidence < input.minConfidence) {
    return { status: 'NEEDS_REVIEW', confidence, issues }
  }

  return { status: 'PASSED', confidence, issues }
}
