import type {
  StoryQCFrame,
  StoryQCIssue,
  StoryQCIssueCode,
  StoryQCObserved,
  StoryQCShotResult,
  StoryQCStatus,
  StoryQCSeverity,
  StoryQCErrorCode,
} from '~/models/story'
import type { QCSceneExpectation } from './qc-types'

export interface ShotQcContext {
  readonly shotId: string
  readonly sceneId: string
  readonly sceneOrder: number
  readonly shotOrder: number
  readonly indexInScene: number
}

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

export function shotIssue(
  code: StoryQCIssueCode,
  severity: StoryQCSeverity,
  context: ShotQcContext,
  frame: StoryQCFrame,
): StoryQCIssue {
  return {
    code,
    severity,
    sceneId: context.sceneId,
    order: context.sceneOrder,
    shotId: context.shotId,
    shotOrder: context.shotOrder,
    frame,
  }
}

export function compareShot(input: {
  readonly expectation: QCSceneExpectation
  readonly context: ShotQcContext
  readonly observed: StoryQCObserved
  readonly framesAvailable: boolean
}): StoryQCIssue[] {
  const { expectation, observed, context } = input
  const issues: StoryQCIssue[] = []
  const expectedCharacters = new Set(expectation.characters)
  const expectedProps = new Set(expectation.props)

  if (
    expectation.characters.includes(expectation.leadCharacterId)
    && !observed.characters.includes(expectation.leadCharacterId)
  ) {
    issues.push(shotIssue('missing-lead-character', 'blocking', context, 'middle'))
  }

  for (const id of expectation.characters) {
    if (id === expectation.leadCharacterId) continue
    if (!observed.characters.includes(id)) {
      issues.push(shotIssue('missing-character', 'blocking', context, 'middle'))
    }
  }

  if (observed.unknownCharacters) {
    issues.push(shotIssue('extra-character', 'blocking', context, 'middle'))
  }

  if (expectedCharacters.size > 0) {
    for (const id of observed.characters) {
      if (!expectedCharacters.has(id)) {
        issues.push(shotIssue('extra-character', 'blocking', context, 'middle'))
        break
      }
    }
  }

  if (observed.wardrobeMismatch.length > 0) {
    issues.push(shotIssue('wrong-wardrobe', 'blocking', context, 'middle'))
  }

  const missingProps = expectation.props.filter((id) => !observed.props.includes(id))

  if (missingProps.length > 0) {
    const signatureMissing = expectation.signaturePropId !== null
      && missingProps.includes(expectation.signaturePropId)

    issues.push(shotIssue(
      'missing-prop',
      signatureMissing ? 'blocking' : 'warning',
      context,
      'middle',
    ))
  }

  if (observed.unknownProps) {
    issues.push(shotIssue('wrong-prop', 'blocking', context, 'middle'))
  }

  if (expectedProps.size > 0) {
    for (const id of observed.props) {
      if (!expectedProps.has(id)) {
        issues.push(shotIssue('wrong-prop', 'blocking', context, 'middle'))
        break
      }
    }
  }

  if (!observed.locationMatches) {
    issues.push(shotIssue('wrong-location', 'blocking', context, 'start'))
  }
  if (!observed.weatherMatches) {
    issues.push(shotIssue('wrong-weather', 'blocking', context, 'start'))
  }
  if (!observed.timeOfDayMatches) {
    issues.push(shotIssue('wrong-time-of-day', 'blocking', context, 'start'))
  }
  if (!observed.continuityMatches) {
    issues.push(shotIssue('continuity-break', 'blocking', context, 'end'))
  }
  if (observed.textOrWatermark) {
    issues.push(shotIssue('text-or-watermark', 'blocking', context, 'middle'))
  }
  if (observed.artifacts) {
    issues.push(shotIssue('visual-artifact', 'warning', context, 'middle'))
  }
  if (!input.framesAvailable) {
    issues.push(shotIssue('frames-unavailable', 'warning', context, 'clip'))
  }

  return dedupe(issues)
}

function dedupe(issues: readonly StoryQCIssue[]): StoryQCIssue[] {
  const seen = new Set<string>()
  return issues.filter((entry) => {
    const key = `${entry.code}:${entry.shotId}:${entry.frame}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function technicalShotIssues(
  context: ShotQcContext,
  codes: readonly StoryQCIssueCode[],
): StoryQCIssue[] {
  return codes.map((code) => shotIssue(code, 'blocking', context, 'clip'))
}

export function sortShotIssues(issues: readonly StoryQCIssue[]): StoryQCIssue[] {
  return issues.slice().sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (severity !== 0) return severity
    if (a.shotOrder !== b.shotOrder) return a.shotOrder - b.shotOrder
    return FRAME_ORDER[a.frame] - FRAME_ORDER[b.frame]
  })
}

export function aggregateShotQc(input: {
  readonly shots: readonly StoryQCShotResult[]
  readonly evaluator: 'vision' | 'none'
  readonly minConfidence: number
  readonly errorCode: StoryQCErrorCode | null
}): {
  readonly status: StoryQCStatus
  readonly confidence: number | null
  readonly issues: readonly StoryQCIssue[]
} {
  const issues = sortShotIssues(input.shots.flatMap((shot) => shot.issues))
  const blocking = issues.some((entry) => entry.severity === 'blocking')
  const observed = input.shots
    .map((shot) => shot.confidence)
    .filter((value): value is number => value !== null)
  const confidence = observed.length === input.shots.length && observed.length > 0
    ? Math.min(...observed)
    : null

  if (blocking) return { status: 'FAILED', confidence, issues }

  if (
    input.errorCode !== null
    || input.evaluator === 'none'
    || input.shots.length === 0
    || input.shots.some((shot) => shot.observed === null)
  ) {
    return { status: 'UNAVAILABLE', confidence: null, issues }
  }

  if (confidence === null || confidence < input.minConfidence) {
    return { status: 'NEEDS_REVIEW', confidence, issues }
  }

  return { status: 'PASSED', confidence, issues }
}
