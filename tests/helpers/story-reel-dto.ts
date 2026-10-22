import type {
  Story,
  StoryQC,
  StoryScene,
  StoryShot,
} from '~/models/story'
import { TEST_NOW_ISO } from './story'

export function makeShotDto(
  overrides: Partial<StoryShot> & { readonly order: number },
): StoryShot {
  return {
    id: overrides.id ?? `shot-dto-${overrides.order}`,
    sceneId: overrides.sceneId ?? 'scene-dto-1',
    sceneOrder: overrides.sceneOrder ?? 1,
    order: overrides.order,
    indexInScene: overrides.indexInScene ?? 1,
    durationSeconds: overrides.durationSeconds ?? 3,
    camera: overrides.camera ?? 'medium',
    framing: overrides.framing ?? 'medium',
    subject: overrides.subject ?? 'Mara',
    action: overrides.action ?? 'Mara mira el postre sobre la mesa.',
    visualPrompt: overrides.visualPrompt ?? 'Plano medio de Mara mirando el postre azul.',
    transition: 'cut',
    locationId: overrides.locationId ?? 'cocina',
    status: overrides.status ?? 'KEYFRAME_READY',
    keyframeUrl: overrides.keyframeUrl
      ?? 'https://v3.fal.media/files/test/shot-keyframe.jpg',
    keyframeAttempts: overrides.keyframeAttempts ?? 1,
    videoUrl: overrides.videoUrl ?? null,
    videoAttempts: overrides.videoAttempts ?? 0,
    error: overrides.error ?? null,
  }
}

export function makeReelScene(
  order: number,
  shots: readonly StoryShot[],
): StoryScene {
  return {
    id: `scene-dto-${order}`,
    order,
    narration: `Narración de la escena ${order}.`,
    sceneRole: order === 1 ? 'establishing' : order === 2 ? 'climax' : 'resolution',
    locationId: 'cocina',
    timeOfDay: 'morning',
    weather: 'clear',
    characters: ['mara'],
    props: ['postre'],
    storyFunction: order === 1 ? 'hook' : order === 2 ? 'twist' : 'payoff',
    gag: null,
    status: shots.every((shot) => shot.status === 'KEYFRAME_READY')
      ? 'KEYFRAME_READY'
      : 'PENDING',
    plannedDurationSeconds: shots.reduce(
      (total, shot) => total + shot.durationSeconds,
      0,
    ),
    shots,
  }
}

export function makeReelStoryDto(
  overrides: Partial<Story> & { readonly scenes?: readonly StoryScene[] } = {},
): Story {
  const scenes = overrides.scenes ?? [
    makeReelScene(1, [makeShotDto({ order: 1 })]),
  ]

  return {
    id: overrides.id ?? 'story-reel-dto',
    status: overrides.status ?? 'WAITING_APPROVAL',
    premise: overrides.premise ?? 'Una repostera descubre que sus postres predicen el futuro.',
    title: overrides.title ?? 'El postre que lo sabía',
    logline: overrides.logline ?? 'Mara descubre que su postre anticipa una sorpresa.',
    referenceUrl: null,
    referenceExpiresAt: null,
    preset: overrides.preset ?? 'fast',
    mode: overrides.mode ?? 'faithful',
    platform: overrides.platform ?? 'tiktok',
    costMode: overrides.costMode ?? 'standard',
    modelId: overrides.modelId ?? 'minimax-hailuo-02',
    targetDurationSeconds: overrides.targetDurationSeconds ?? 30,
    maxDurationSeconds: overrides.maxDurationSeconds ?? 30,
    plannedDurationSeconds: overrides.plannedDurationSeconds
      ?? scenes.flatMap((scene) => scene.shots)
        .reduce((total, shot) => total + shot.durationSeconds, 0),
    shotCount: overrides.shotCount ?? scenes.reduce(
      (total, scene) => total + scene.shots.length,
      0,
    ),
    finalDurationSeconds: overrides.finalDurationSeconds ?? null,
    sceneCount: overrides.sceneCount ?? scenes.length,
    aspectRatio: '9:16',
    plan: overrides.plan ?? null,
    scenes,
    finalVideoUrl: overrides.finalVideoUrl ?? null,
    finalVideoExpiresAt: null,
    approvedAt: overrides.approvedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    createdAt: TEST_NOW_ISO,
    updatedAt: TEST_NOW_ISO,
    expiresAt: '2026-10-22T18:00:00.000Z',
    version: overrides.version ?? 1,
    error: overrides.error ?? null,
    qc: overrides.qc ?? null,
    pollAfterMs: overrides.pollAfterMs ?? 2_500,
  }
}

export function makeShotQc(overrides: Partial<StoryQC> = {}): StoryQC {
  return {
    status: overrides.status ?? 'FAILED',
    errorCode: overrides.errorCode ?? null,
    evaluator: overrides.evaluator ?? 'vision',
    checkedAt: overrides.checkedAt ?? TEST_NOW_ISO,
    confidence: overrides.confidence ?? 0.8,
    shots: overrides.shots ?? [],
    issues: overrides.issues ?? [],
    variety: overrides.variety ?? null,
    override: overrides.override ?? null,
  }
}
