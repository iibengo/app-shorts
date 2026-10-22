import type {
  StoryCameraShot,
  StoryCostMode,
  StoryBible,
  StoryDurationSeconds,
  StoryNarrativeScene,
  StoryShotFraming,
} from '~/models/story'
import type {
  CanonDraft,
  DurationPlan,
  NarrativeDraft,
  ShotListDraft,
} from '../../server/story/director-types'
import { durationPlanFor } from '../../server/story/cost-profiles'

const BIBLE: StoryBible = {
  style: 'Animación vertical con luz cálida y texturas de cocina.',
  tone: 'humor',
  theme: 'Una repostera y un postre que anticipa el futuro.',
  leadCharacterId: 'mara',
  signaturePropId: 'postre',
  characters: [
    {
      id: 'mara',
      name: 'Mara',
      description: 'Repostera curiosa, nerviosa y muy observadora.',
      wardrobe: 'Delantal azul y camisa blanca.',
      source: 'premise',
    },
    {
      id: 'iker',
      name: 'Iker',
      description: 'Amigo escéptico que siempre llega tarde.',
      wardrobe: 'Chaqueta verde y gafas redondas.',
      source: 'premise',
    },
  ],
  locations: [
    {
      id: 'cocina',
      name: 'Cocina',
      description: 'Cocina pequeña con luz cálida y paredes azules.',
      source: 'premise',
    },
    {
      id: 'portal',
      name: 'Portal',
      description: 'Portal de vecinos con escalera y buzones.',
      source: 'premise',
    },
  ],
  props: [
    {
      id: 'postre',
      name: 'Postre',
      description: 'Pastel pequeño con glaseado azul brillante.',
      source: 'premise',
    },
  ],
  forbidden: ['sangre', 'armas'],
  continuityRules: [
    'Mara mantiene el delantal azul.',
    'El postre conserva el glaseado azul.',
  ],
}

function sceneCountFor(plan: DurationPlan): number {
  const shots = plan.exactShotCount ?? plan.shotCount.max
  const required = Math.ceil(shots / plan.shotsPerSceneMax)

  return Math.max(plan.sceneCount.min, Math.min(plan.sceneCount.max, required))
}

function twistIndex(sceneCount: number): number {
  if (sceneCount === 2) return -1
  if (sceneCount === 3) return 1

  return Math.max(1, Math.ceil(sceneCount * 0.5))
}

function storyFunctions(sceneCount: number): StoryNarrativeScene['storyFunction'][] {
  const twist = twistIndex(sceneCount)
  const functions = Array.from(
    { length: sceneCount },
    (_value, index) => index === 0 ? 'hook' : index === sceneCount - 1 ? 'payoff' : 'complication',
  ) as StoryNarrativeScene['storyFunction'][]

  if (twist >= 0) functions[twist] = 'twist'

  if (sceneCount >= 5) {
    const available = functions
      .map((value, index) => ({ value, index }))
      .filter(({ index }) => index !== 0 && index !== sceneCount - 1 && index !== twist)

    if (available[1]) functions[available[1].index] = 'escalation'
    for (const item of available.slice(2)) functions[item.index] = 'complication'
  }

  return functions
}

function durationHints(sceneCount: number, target: number): readonly number[] {
  const base = Math.max(2, Math.min(18, Math.floor(target / sceneCount)))
  const hints = Array.from({ length: sceneCount }, () => base)
  let remaining = target - base * sceneCount

  for (let index = 0; index < sceneCount && remaining > 0; index += 1) {
    if (hints[index]! < 18) {
      hints[index]! += 1
      remaining -= 1
    }
  }

  return hints
}

export function makeReelNarrative(
  costMode: StoryCostMode,
  duration: StoryDurationSeconds,
  hasReference = false,
): {
  readonly plan: DurationPlan
  readonly canon: CanonDraft
  readonly narrative: NarrativeDraft
  readonly sceneCount: number
} {
  const plan = durationPlanFor(costMode, duration, 'tiktok', hasReference)
  const sceneCount = sceneCountFor(plan)
  const functions = storyFunctions(sceneCount)
  const hints = durationHints(sceneCount, plan.targetDurationSeconds)
  const twist = twistIndex(sceneCount)
  const scenes: StoryNarrativeScene[] = []

  for (let index = 0; index < sceneCount; index += 1) {
    const order = index + 1
    const isFirst = index === 0
    const isLast = index === sceneCount - 1
    const isTwist = index === twist
    const sceneRole: StoryNarrativeScene['sceneRole'] = isFirst
      ? 'establishing'
      : isLast
        ? 'resolution'
        : isTwist
          ? 'climax'
          : functions[index] === 'escalation'
            ? 'escalation'
            : 'development'
    const useSecondCharacter = index === 1 || (index > 1 && index % 2 === 1)
    const gag = sceneCount === 2
      ? (index === 0 ? 'El postre tiembla y todos miran.' : null)
      : (index === 1 ? 'El postre tiembla y todos miran.' : null)

    scenes.push({
      order,
      sceneRole,
      locationId: index % 2 === 0 ? 'cocina' : 'portal',
      timeOfDay: index % 2 === 0 ? 'morning' : 'golden-hour',
      weather: 'clear',
      characters: useSecondCharacter ? ['mara', 'iker'] : ['mara'],
      props: sceneCount === 2
        ? (index === 1 ? ['postre'] : [])
        : (index === 0 ? ['postre'] : []),
      action: `Mara descubre que el postre cambia de color y algo inesperado ocurre en la escena ${order}.`,
      narration: `El postre anuncia algo que Mara no esperaba en la escena ${order}.`,
      storyFunction: functions[index]!,
      gag,
      continuityFromPrevious: isFirst
        ? null
        : 'La continuidad mantiene el vestuario y el conflicto de la escena anterior.',
      durationHintSeconds: hints[index]!,
    })
  }

  return {
    plan,
    canon: {
      title: 'El postre que lo sabía',
      logline: 'Mara descubre que su postre anticipa una sorpresa.',
      tone: 'humor',
      storyBible: BIBLE,
    },
    narrative: {
      title: 'El postre que lo sabía',
      logline: 'Mara descubre que su postre anticipa una sorpresa.',
      tone: 'humor',
      storyBible: BIBLE,
      scenes,
    },
    sceneCount,
  }
}

function allocateDurations(
  count: number,
  target: number,
  slow: boolean,
): readonly number[] {
  if (slow) return Array.from({ length: count }, () => 6)

  const base = Math.floor(target / count)
  const durations = Array.from({ length: count }, () => base)
  let remaining = target - base * count

  for (let index = 0; index < count && remaining > 0; index += 1) {
    durations[index]! += 1
    remaining -= 1
  }

  if (base < 6) {
    for (let index = 0; index < Math.min(2, count); index += 1) {
      while (durations[index]! > 3) {
        let targetIndex = -1

        for (let candidate = count - 1; candidate > index; candidate -= 1) {
          if (durations[candidate]! < 6) {
            targetIndex = candidate
            break
          }
        }

        if (targetIndex < 0) break
        durations[index]! -= 1
        durations[targetIndex]! += 1
      }
    }
  }

  return durations
}

function framingSequence(
  count: number,
  firstScene: boolean,
  newLocation: boolean,
  signature: boolean,
  gag: boolean,
): readonly StoryShotFraming[] {
  const first = firstScene
    ? 'medium'
    : newLocation
      ? 'wide'
      : 'medium'

  if (count === 2) {
    return [first, signature ? 'detail' : gag ? 'reaction' : 'close-up']
  }

  if (count === 3) {
    if (signature && gag) return [first, 'detail', 'reaction']
    if (signature) return [first, 'close-up', 'detail']
    if (gag) return [first, 'close-up', 'reaction']

    return [first, newLocation ? 'medium' : 'close-up', 'detail']
  }

  if (signature && gag) return [first, 'close-up', 'detail', 'reaction']
  if (signature) return [first, 'close-up', 'detail', 'medium']
  if (gag) return [first, 'close-up', 'reaction', 'medium']

  return [first, 'close-up', 'medium', newLocation ? 'detail' : 'over-the-shoulder']
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

function subjectFor(
  scene: StoryNarrativeScene,
  framing: StoryShotFraming,
): string {
  if (framing === 'detail' || framing === 'insert') return 'Postre'
  if (framing === 'reaction') return 'Mara reacciona'
  if (framing === 'two-shot') return 'Mara e Iker'
  if (framing === 'close-up' && scene.characters.includes('iker')) return 'Iker'

  return 'Mara'
}

export function makeReelShotList(
  narrative: NarrativeDraft,
  plan: DurationPlan,
): ShotListDraft {
  const shotCount = plan.exactShotCount ?? plan.shotCount.max
  const counts = Array.from({ length: narrative.scenes.length }, () => 0)

  for (let index = 0; index < shotCount; index += 1) {
    const scene = index % narrative.scenes.length
    counts[scene]! += 1
  }

  const durations = allocateDurations(
    shotCount,
    plan.targetDurationSeconds,
    plan.rhythm === 'slow',
  )
  const seenLocations = new Set<string>()
  let durationIndex = 0
  const scenes: ShotListDraft['scenes'][number][] = []

  for (let index = 0; index < narrative.scenes.length; index += 1) {
    const scene = narrative.scenes[index]!
    const count = counts[index]!
    const newLocation = !seenLocations.has(scene.locationId)
    const signature = scene.props.includes('postre')
    const framings = framingSequence(
      count,
      index === 0,
      newLocation,
      signature,
      scene.gag !== null,
    )
    const shots = framings.map((framing, shotIndex) => {
      const subject = subjectFor(scene, framing)

      return {
        indexInScene: shotIndex + 1,
        durationSeconds: durations[durationIndex + shotIndex]! as 2 | 3 | 4 | 5 | 6,
        camera: cameraFor(framing),
        framing,
        subject,
        action: scene.action.slice(0, 200),
        visualPrompt: `Plano ${shotIndex + 1} de la escena ${scene.order}: ${framing} de ${subject} en ${scene.locationId.toUpperCase()}.`,
        transition: 'cut' as const,
        locationId: scene.locationId,
      }
    })

    durationIndex += count
    seenLocations.add(scene.locationId)
    scenes.push({ order: scene.order, shots })
  }

  return { scenes }
}
