import type {
  StoryBible,
  StoryCameraShot,
  StoryNarrativeScene,
  StoryPlan,
  StoryShotDurationSeconds,
  StoryShotFraming,
} from '~/models/story'
import type {
  AssembledShot,
  DirectorContext,
  DurationPlan,
  ReelPlan,
  ReelPlanDirector,
  StoryDirector,
} from './director-types'
import { isValidPlannedDuration } from './duration-plan'
import type { StoryTimePlan } from './time-plan'
import { normalizePlanScenes } from './legacy-shots'

const SHOTS_PER_SCENE_MAX = 4
const LEGACY_MIN_SCENES = 3

interface AdapterInput {
  readonly premise: string
  readonly mode: Parameters<ReelPlanDirector['createPlan']>[0]['mode']
  readonly durationPlan: DurationPlan
  readonly referenceUrl: string | null
  readonly context?: DirectorContext
  /** 014: when present, the engine decides the durations. */
  readonly timePlan?: StoryTimePlan | null
}

function chooseShotCount(plan: DurationPlan): number {
  return plan.exactShotCount ?? plan.shotCount.max
}

/**
 * The legacy 007 director cannot produce N=2 with a twist scene, so the
 * vertical adapter always asks for at least three narrative scenes.
 */
function chooseSceneCount(plan: DurationPlan, shotCount: number): number {
  const required = Math.ceil(shotCount / SHOTS_PER_SCENE_MAX)

  return Math.max(
    LEGACY_MIN_SCENES,
    plan.sceneCount.min,
    Math.min(plan.sceneCount.max, required),
  )
}

function allocateShotCounts(sceneCount: number, shotCount: number): readonly number[] {
  const counts = Array.from({ length: sceneCount }, () => 0)

  for (let index = 0; index < shotCount; index += 1) {
    const sceneIndex = index % sceneCount

    if (counts[sceneIndex]! >= SHOTS_PER_SCENE_MAX) {
      throw new Error('adapter-shot-overflow')
    }

    counts[sceneIndex]! += 1
  }

  return counts
}

function allocateDurations(
  shots: number,
  target: number,
  quality: boolean,
): readonly StoryShotDurationSeconds[] {
  if (shots <= 0) throw new Error('adapter-no-shots')

  const max: StoryShotDurationSeconds = quality ? 5 : 6
  const base = Math.floor(target / shots)

  if (base < 2 || base > max) throw new Error('adapter-duration-out-of-range')

  const durations = Array.from({ length: shots }, () => base)
  let remainder = target - base * shots

  for (let index = 0; index < shots && remainder > 0; index += 1) {
    if (durations[index]! < max) {
      durations[index]! += 1
      remainder -= 1
    }
  }

  // Keep the hook at 2–3 s and the first cut before 6 s. The slow 90 s
  // profile is exempt from R7/R8 and uses 6 s shots.
  if (base < 6) {
    for (let index = 0; index < Math.min(2, shots); index += 1) {
      while (durations[index]! > 3) {
        let targetIndex = -1

        for (let candidate = durations.length - 1; candidate > index; candidate -= 1) {
          if (durations[candidate]! < max) {
            targetIndex = candidate
            break
          }
        }

        if (targetIndex < 0) break

        durations[index]! -= 1
        durations[targetIndex]! += 1
      }
    }

    if (durations[0]! < 2 || durations[0]! > 3) {
      throw new Error('adapter-hook-out-of-range')
    }
  }

  return durations as readonly StoryShotDurationSeconds[]
}

function framingSequence(count: number, firstScene: boolean): readonly StoryShotFraming[] {
  if (count === 1) return [firstScene ? 'medium' : 'wide']

  if (count === 2) {
    return firstScene ? ['medium', 'close-up'] : ['wide', 'close-up']
  }

  if (count === 3) {
    return firstScene
      ? ['medium', 'close-up', 'detail']
      : ['wide', 'medium', 'close-up']
  }

  return firstScene
    ? ['medium', 'close-up', 'detail', 'reaction']
    : ['wide', 'medium', 'close-up', 'detail']
}

function cameraFor(framing: StoryShotFraming): StoryCameraShot {
  switch (framing) {
    case 'establishing':
    case 'wide':
      return 'wide'
    case 'medium':
    case 'two-shot':
      return 'medium'
    case 'close-up':
    case 'extreme-close-up':
    case 'reaction':
      return 'close-up'
    case 'over-the-shoulder':
      return 'over-the-shoulder'
    case 'detail':
    case 'insert':
      return 'detail'
  }
}

function characterName(
  bible: StoryBible | null,
  scene: StoryNarrativeScene,
): string {
  const lead = scene.characters[0]
  const match = lead && bible
    ? bible.characters.find((character) => character.id === lead)
    : undefined

  return match?.name ?? lead ?? 'Protagonista'
}

function subjectFor(
  bible: StoryBible | null,
  scene: StoryNarrativeScene,
  framing: StoryShotFraming,
): string {
  if (framing === 'detail' || framing === 'insert') {
    const signature = bible?.signaturePropId
    const prop = signature && scene.props.includes(signature)
      ? bible?.props.find((item) => item.id === signature)
      : scene.props[0] && bible?.props.find((item) => item.id === scene.props[0])

    return prop?.name ?? 'Detalle'
  }

  if (framing === 'reaction') {
    return `${characterName(bible, scene)} reacciona`
  }

  if (framing === 'two-shot' && scene.characters.length >= 2) {
    return scene.characters
      .slice(0, 2)
      .map((id) => bible?.characters.find((character) => character.id === id)?.name ?? id)
      .join(' y ')
  }

  return characterName(bible, scene)
}

function shotVisualPrompt(
  scene: StoryNarrativeScene,
  indexInScene: number,
  totalInScene: number,
  framing: StoryShotFraming,
  subject: string,
): string {
  const prompt = `Plano ${indexInScene} de ${totalInScene}, ${framing} de ${subject}. ${scene.action}`

  return prompt.normalize('NFC').slice(0, 400).trim()
}

function buildShotPlan(
  scenes: readonly StoryNarrativeScene[],
  shotCount: number,
  durationPlan: DurationPlan,
  bible: StoryBible | null,
  presetQuality: boolean,
  /** 014: when present, the engine decides the durations instead of a division. */
  timePlan?: StoryTimePlan | null,
): ReelPlan['shotPlan'] {
  const counts = allocateShotCounts(scenes.length, shotCount)
  // 014: with a time plan, the durations are the ones the engine accepts and
  // the caller has already paid for. Without it, the old division still runs so
  // a deployment with audio off behaves exactly as before.
  const durations = timePlan === null || timePlan === undefined
    ? allocateDurations(shotCount, durationPlan.targetDurationSeconds, presetQuality)
    : timePlan.scenes.flatMap((scene) => scene.clipSeconds)
  const fromTimePlan = timePlan !== null && timePlan !== undefined
  const shotScenes: ReelPlan['shotPlan']['scenes'][number][] = []
  let globalOrder = 1
  let durationIndex = 0

  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
    const scene = scenes[sceneIndex]!
    // A time plan may hand a scene several clips; every clip is its own shot.
    const count = fromTimePlan
      ? (timePlan.scenes[sceneIndex]?.clipSeconds.length ?? 0)
      : counts[sceneIndex]!
    const framings = framingSequence(count, sceneIndex === 0)
    const shots: AssembledShot[] = []

    for (let index = 0; index < count; index += 1) {
      const framing = framings[index]!
      const subject = subjectFor(bible, scene, framing)

      shots.push({
        sceneId: `scene-${scene.order}`,
        sceneOrder: scene.order,
        order: globalOrder,
        indexInScene: index + 1,
        durationSeconds: durations[durationIndex]!,
        camera: cameraFor(framing),
        framing,
        subject: subject.slice(0, 80),
        action: scene.action.normalize('NFC').slice(0, 200).trim(),
        visualPrompt: shotVisualPrompt(scene, index + 1, count, framing, subject),
        transition: 'cut',
        locationId: scene.locationId,
      })

      globalOrder += 1
      durationIndex += 1
    }

    shotScenes.push({ order: scene.order, shots })
  }

  const plannedDurationSeconds = durationIndex

  return {
    scenes: shotScenes,
    plannedDurationSeconds: shotScenes
      .flatMap((scene) => scene.shots)
      .reduce((total, shot) => total + shot.durationSeconds, 0),
  }
}

/**
 * Vertical 008 adapter built on top of the validated 007 narrative director.
 *
 * It keeps the 008 contract (narrative scenes + shot list + duration profile)
 * but synthesises the shot grammar deterministically. The real multi-shot
 * Shot Director lands in the next pass; this adapter must not be reported as
 * the complete 008 engine.
 */
export class LegacyReelPlanAdapter implements ReelPlanDirector {
  private readonly director: StoryDirector
  private readonly presetQuality: boolean

  constructor(director: StoryDirector, options: { readonly presetQuality?: boolean } = {}) {
    this.director = director
    this.presetQuality = options.presetQuality ?? false
  }

  async createPlan(input: AdapterInput): Promise<ReelPlan> {
    const shotCount = chooseShotCount(input.durationPlan)
    const sceneCount = chooseSceneCount(input.durationPlan, shotCount)
    const legacy = await this.director.createPlan({
      premise: input.premise,
      sceneCount,
      mode: input.mode,
      referenceUrl: input.referenceUrl,
      ...(input.context === undefined ? {} : { context: input.context }),
    })
    const scenes = normalizePlanScenes(legacy)

    if (scenes.length !== sceneCount) {
      throw new Error('adapter-scene-count-mismatch')
    }

    const plan: StoryPlan = {
      title: legacy.title,
      logline: legacy.logline,
      tone: legacy.tone,
      storyBible: legacy.storyBible,
      scenes,
    }
    const shotPlan = buildShotPlan(
      scenes,
      shotCount,
      input.durationPlan,
      legacy.storyBible,
      this.presetQuality,
      input.timePlan ?? null,
    )

    // 014: with a time plan the shot count comes from what the engine accepts,
    // so the profile's own shot budget no longer applies. The plan's own ratio
    // check (paid vs planned) is what guards the cost instead.
    const usesTimePlan = input.timePlan !== null && input.timePlan !== undefined

    if (
      !usesTimePlan
      && !isValidPlannedDuration(
        input.durationPlan,
        shotPlan.plannedDurationSeconds,
        shotPlan.scenes.flatMap((scene) => scene.shots).length,
      )
    ) {
      throw new Error('adapter-invalid-plan-budget')
    }

    return { plan, shotPlan }
  }
}

export function createLegacyReelPlanAdapter(
  director: StoryDirector,
  options: { readonly presetQuality?: boolean } = {},
): ReelPlanDirector {
  return new LegacyReelPlanAdapter(director, options)
}
