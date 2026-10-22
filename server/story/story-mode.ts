import type {
  StoryMode,
  StoryNarrativeTone,
  StoryTone,
} from '~/models/story'

export const STORY_MODES: readonly StoryMode[] = ['faithful', 'creative']

export const STORY_NARRATIVE_TONES: readonly StoryNarrativeTone[] = [
  'humor',
  'aventura',
  'absurdo',
  'heartwarming',
  'dramatic',
]

export const STORY_TONES: readonly StoryTone[] = [
  ...STORY_NARRATIVE_TONES,
  'neutral',
]

export function isStoryMode(value: unknown): value is StoryMode {
  return typeof value === 'string' && (STORY_MODES as readonly string[]).includes(value)
}

export function parseStoryMode(value: unknown): StoryMode {
  return isStoryMode(value) ? value : 'faithful'
}

export function isNarrativeTone(value: unknown): value is StoryNarrativeTone {
  return (
    typeof value === 'string'
    && (STORY_NARRATIVE_TONES as readonly string[]).includes(value)
  )
}

export function isStoryTone(value: unknown): value is StoryTone {
  return typeof value === 'string' && (STORY_TONES as readonly string[]).includes(value)
}

export function maxInventedCharacters(mode: StoryMode): number {
  return mode === 'faithful' ? 0 : 2
}

export function maxLocations(): number {
  return 3
}

export function maxTotalProps(): number {
  return 5
}

export const STORY_TIME_OF_DAYS = [
  'dawn',
  'morning',
  'noon',
  'afternoon',
  'golden-hour',
  'dusk',
  'night',
] as const

export const STORY_WEATHERS = [
  'clear',
  'cloudy',
  'overcast',
  'light-rain',
  'rain',
  'storm',
  'snow',
  'fog',
  'windy',
] as const

export const STORY_CAMERAS = [
  'wide',
  'medium',
  'close-up',
  'low-angle',
  'high-angle',
  'tracking',
  'over-the-shoulder',
  'detail',
] as const

export const STORY_SCENE_ROLES = [
  'establishing',
  'development',
  'escalation',
  'climax',
  'resolution',
] as const

export const STORY_STORY_FUNCTIONS = [
  'hook',
  'complication',
  'escalation',
  'twist',
  'payoff',
] as const
