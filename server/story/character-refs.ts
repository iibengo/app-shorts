import type {
  StoryCharacter,
  StoryCharacterRefSource,
  StoryCharacterRefStatus,
  StoryPlan,
} from '~/models/story'
import { assertFalMediaUrl } from '../fal/types'

/**
 * One identity image per character. Stored server-side in
 * `Story.characterRefsJson`; the public DTO projects it without request ids.
 */
export interface StoredCharacterRef {
  readonly status: StoryCharacterRefStatus
  readonly source: StoryCharacterRefSource
  readonly frontalUrl: string | null
  /** Further character views; at least one when `status === 'ready'`. */
  readonly referenceUrls: readonly string[]
  readonly attempts: number
  /** Why it failed, so the review screen can say more than "not available". */
  readonly errorCode?: string
  readonly updatedAt: string
}

export type StoredCharacterRefs = Readonly<Record<string, StoredCharacterRef>>

/** The canon itself allows 1–3 characters, so references never exceed three. */
export const MAX_CHARACTER_REFS = 3

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStatus(value: unknown): value is StoryCharacterRefStatus {
  return value === 'pending' || value === 'ready' || value === 'failed'
}

function isSource(value: unknown): value is StoryCharacterRefSource {
  return value === 'user' || value === 'generated'
}

function mediaUrlOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null

  try {
    return assertFalMediaUrl(value)
  } catch {
    return null
  }
}

/**
 * A stored URL is only accepted when it belongs to the Fal CDN allowlist.
 * `null` and non-string values mean "no image", never a malformed story.
 */
function readMediaUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.length === 0) return undefined

  try {
    return assertFalMediaUrl(value)
  } catch {
    return undefined
  }
}

function readReferenceUrls(value: unknown): readonly string[] | null {
  if (value === undefined || value === null) return []

  if (!Array.isArray(value)) return null

  const urls: string[] = []

  for (const entry of value) {
    const url = mediaUrlOrNull(entry)

    if (url === null) return null

    urls.push(url)
  }

  return urls
}

function readAttempts(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0

  return Math.max(0, Math.trunc(value))
}

function readUpdatedAt(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : ''
}

function parseStoredCharacterRef(value: unknown): StoredCharacterRef | null {
  if (!isRecord(value)) return null

  const status = value.status
  const source = value.source

  if (!isStatus(status) || !isSource(source)) return null

  const frontalUrl = readMediaUrl(value.frontalUrl)
  const referenceUrls = readReferenceUrls(value.referenceUrls)

  if (frontalUrl === undefined || referenceUrls === null) return null

  const parsed: StoredCharacterRef = {
    status,
    source,
    frontalUrl,
    referenceUrls,
    attempts: readAttempts(value.attempts),
    updatedAt: readUpdatedAt(value.updatedAt),
  }

  // A ready reference without an image or without a reference list cannot be
  // sent to the provider; degrading it is safer than failing the whole story.
  if (
    parsed.status === 'ready'
    && (parsed.frontalUrl === null || parsed.referenceUrls.length === 0)
  ) {
    return { ...parsed, status: 'failed' }
  }

  return parsed
}

/**
 * Canon order: the protagonist first, then the rest in canon order. The
 * generated set keeps at most three entries; the surplus is dropped by canon
 * order, never by storage order.
 */
export function canonCharacters(plan: StoryPlan): readonly StoryCharacter[] {
  const bible = plan.storyBible

  if (bible === null) return []

  const lead = bible.characters.find((character) => character.id === bible.leadCharacterId)
  const rest = bible.characters.filter(
    (character) => character.id !== bible.leadCharacterId,
  )
  const ordered = lead === undefined ? rest : [lead, ...rest]

  return ordered.slice(0, MAX_CHARACTER_REFS)
}

function appearingCharacterIds(plan: StoryPlan): ReadonlySet<string> {
  const ids = new Set<string>()

  for (const scene of plan.scenes) {
    for (const id of scene.characters) ids.add(id)
  }

  return ids
}

/** Every character that appears in the plan, protagonist first, maximum three. */
export function characterRefCharacters(plan: StoryPlan): readonly StoryCharacter[] {
  const appearing = appearingCharacterIds(plan)

  return canonCharacters(plan).filter((character) => appearing.has(character.id))
}

/** The user image is only usable when it is a valid Fal CDN URL. */
export function usableUserReferenceUrl(referenceUrl: string | null): string | null {
  return mediaUrlOrNull(referenceUrl)
}

/**
 * Characters that need a generated image: every character in the plan that
 * appears in a scene, minus the protagonist when the user already supplied its
 * picture. Deterministic: protagonist first, then canon order, maximum three.
 */
export function generatedCharacterRefTargets(
  plan: StoryPlan,
  referenceUrl: string | null,
): readonly StoryCharacter[] {
  const leadId = plan.storyBible?.leadCharacterId ?? null
  const hasUserReference = usableUserReferenceUrl(referenceUrl) !== null

  return characterRefCharacters(plan).filter(
    (character) => !(hasUserReference && character.id === leadId),
  )
}

/** Builds the initial map: user reference ready, the rest pending. */
export function initialCharacterRefs(
  plan: StoryPlan,
  referenceUrl: string | null,
  updatedAt: string,
): StoredCharacterRefs {
  const userUrl = usableUserReferenceUrl(referenceUrl)
  const leadId = plan.storyBible?.leadCharacterId ?? null
  const refs: Record<string, StoredCharacterRef> = {}

  for (const character of characterRefCharacters(plan)) {
    if (userUrl !== null && character.id === leadId) {
      refs[character.id] = {
        status: 'ready',
        source: 'user',
        frontalUrl: userUrl,
        referenceUrls: [userUrl],
        attempts: 0,
        updatedAt,
      }
      continue
    }

    refs[character.id] = {
      status: 'pending',
      source: 'generated',
      frontalUrl: null,
      referenceUrls: [],
      attempts: 0,
      updatedAt,
    }
  }

  return refs
}

/**
 * Reads a persisted map. Unknown keys are dropped, malformed entries are
 * dropped one by one, and the result is capped to three entries in canon order.
 * A `null` column reads as an empty map.
 */
export function parseCharacterRefs(
  value: unknown,
  canonIds: readonly string[],
): StoredCharacterRefs {
  if (!isRecord(value)) return {}

  const refs: Record<string, StoredCharacterRef> = {}

  for (const id of canonIds.slice(0, MAX_CHARACTER_REFS)) {
    const entry = value[id]

    if (entry === undefined) continue

    const parsed = parseStoredCharacterRef(entry)

    if (parsed !== null) refs[id] = parsed
  }

  return refs
}

/** Writes only the known fields; keeps the persisted shape stable. */
export function serializeCharacterRefs(
  refs: StoredCharacterRefs,
): Record<string, StoredCharacterRef> {
  const serialized: Record<string, StoredCharacterRef> = {}

  for (const [id, ref] of Object.entries(refs)) {
    serialized[id] = {
      status: ref.status,
      source: ref.source,
      frontalUrl: ref.frontalUrl,
      referenceUrls: [...ref.referenceUrls],
      attempts: ref.attempts,
      updatedAt: ref.updatedAt,
    }
  }

  return serialized
}

export interface CharacterReferenceElement {
  readonly characterId: string
  readonly frontalUrl: string
  readonly referenceUrls: readonly string[]
}

/**
 * Elements are built in character order so `@Element1`, `@Element2` keep a
 * one-to-one correspondence with their images. Only ready references produce
 * an element.
 */
export function characterRefElements(
  characterIds: readonly string[],
  refs: StoredCharacterRefs,
): readonly CharacterReferenceElement[] {
  const elements: CharacterReferenceElement[] = []

  for (const id of characterIds.slice(0, MAX_CHARACTER_REFS)) {
    const ref = refs[id]

    if (ref === undefined || ref.status !== 'ready' || ref.frontalUrl === null) continue

    elements.push({
      characterId: id,
      frontalUrl: ref.frontalUrl,
      referenceUrls: ref.referenceUrls.length > 0 ? ref.referenceUrls : [ref.frontalUrl],
    })
  }

  return elements
}
