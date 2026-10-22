import type {
  SceneStatus,
  StoryNarrativeScene,
  StoryShot,
} from '~/models/story'
import type { SceneRecord } from './repository'

export interface LegacyShotScene {
  readonly id: string
  readonly storyId: string
  readonly order: number
  readonly visualPrompt: string | null
  readonly narration: string
  readonly status: SceneStatus
}

export function synthesizeLegacyShot(scene: LegacyShotScene): StoryShot {
  return {
    id: `legacy-${scene.id}`,
    sceneId: scene.id,
    sceneOrder: scene.order,
    order: scene.order,
    indexInScene: 1,
    durationSeconds: 6,
    camera: 'wide',
    framing: 'establishing',
    subject: 'Plano heredado',
    action: scene.visualPrompt ?? scene.narration,
    visualPrompt: scene.visualPrompt ?? scene.narration,
    transition: 'cut',
    locationId: 'legacy-location',
    status: scene.status,
    keyframeUrl: null,
    keyframeAttempts: 0,
    videoUrl: null,
    videoAttempts: 0,
    error: null,
  }
}

export function syntheticShotsForScenes(
  scenes: readonly LegacyShotScene[],
): readonly StoryShot[] {
  return scenes.map(synthesizeLegacyShot)
}

export function isSyntheticShotId(shotId: string): boolean {
  return shotId.startsWith('legacy-')
}

export function isSyntheticShot(shot: Pick<StoryShot, 'id'>): boolean {
  return isSyntheticShotId(shot.id)
}

/** Converts legacy `beats` into narrative `scenes`, dropping visual fields. */
export function normalizePlanScenes(plan: {
  readonly beats?: readonly {
    readonly order: number
    readonly sceneRole: StoryNarrativeScene['sceneRole']
    readonly locationId: string
    readonly timeOfDay: StoryNarrativeScene['timeOfDay']
    readonly weather: StoryNarrativeScene['weather']
    readonly characters: readonly string[]
    readonly props: readonly string[]
    readonly action: string
    readonly narration: string
    readonly storyFunction: StoryNarrativeScene['storyFunction']
    readonly gag: string | null
    readonly continuityFromPrevious?: string | null
  }[]
  readonly scenes?: readonly StoryNarrativeScene[]
}): readonly StoryNarrativeScene[] {
  if (plan.scenes && plan.scenes.length > 0) return plan.scenes

  return (plan.beats ?? []).map((beat, index) => ({
    order: beat.order,
    sceneRole: beat.sceneRole,
    locationId: beat.locationId,
    timeOfDay: beat.timeOfDay,
    weather: beat.weather,
    characters: beat.characters,
    props: beat.props,
    action: beat.action,
    narration: beat.narration,
    storyFunction: beat.storyFunction,
    gag: beat.gag,
    continuityFromPrevious: index === 0 ? null : (beat.continuityFromPrevious ?? null),
  }))
}

export function sceneRecordsForLegacyShots(
  scenes: readonly SceneRecord[],
): readonly LegacyShotScene[] {
  return scenes.map((scene) => ({
    id: scene.id,
    storyId: scene.storyId,
    order: scene.order,
    visualPrompt: scene.visualPrompt,
    narration: scene.narration,
    status: scene.status,
  }))
}
