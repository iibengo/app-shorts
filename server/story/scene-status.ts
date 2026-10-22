import type { SceneStatus } from '~/models/story'

export interface ShotStatusLike {
  readonly status: SceneStatus
  readonly durationSeconds: number
}

export function deriveSceneStatus(shots: readonly ShotStatusLike[]): SceneStatus {
  if (shots.length === 0) return 'PENDING'

  const statuses = shots.map((shot) => shot.status)
  const all = (status: SceneStatus): boolean => statuses.every((value) => value === status)
  const some = (status: SceneStatus): boolean => statuses.some((value) => value === status)

  if (all('CANCELLED')) return 'CANCELLED'
  if (all('VIDEO_READY')) return 'VIDEO_READY'
  if (some('VIDEO_RUNNING')) return 'VIDEO_RUNNING'
  if (some('VIDEO_QUEUED')) return 'VIDEO_QUEUED'
  if (some('VIDEO_FAILED') && !statuses.some((value) =>
    value === 'VIDEO_QUEUED' || value === 'VIDEO_RUNNING')) {
    return 'VIDEO_FAILED'
  }
  if (all('KEYFRAME_READY')) return 'KEYFRAME_READY'
  if (some('KEYFRAME_RUNNING')) return 'KEYFRAME_RUNNING'
  if (some('KEYFRAME_QUEUED')) return 'KEYFRAME_QUEUED'
  if (some('KEYFRAME_FAILED') && !statuses.some((value) =>
    value === 'KEYFRAME_QUEUED' || value === 'KEYFRAME_RUNNING')) {
    return 'KEYFRAME_FAILED'
  }
  if (all('PENDING')) return 'PENDING'

  return 'PENDING'
}

export function plannedDurationSeconds(shots: readonly ShotStatusLike[]): number {
  return shots.reduce((total, shot) => total + shot.durationSeconds, 0)
}

export function deriveStoryProgress(scenes: readonly {
  readonly status: SceneStatus
  readonly shots: readonly ShotStatusLike[]
}[]): { readonly keyframesReady: number; readonly videosReady: number; readonly total: number } {
  return {
    keyframesReady: scenes.filter((scene) => scene.status === 'KEYFRAME_READY').length,
    videosReady: scenes.filter((scene) => scene.status === 'VIDEO_READY').length,
    total: scenes.length,
  }
}
