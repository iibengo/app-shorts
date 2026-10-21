import type {
  StoryBible,
  StoryCameraShot,
  StorySceneRole,
  StoryTransition,
} from '~/models/story'
import type { StoryBrief } from './premise-brief'

export interface DirectorBeat {
  readonly order: number
  readonly sceneRole: StorySceneRole
  readonly visualPrompt: string
  readonly narration: string
  readonly characters: readonly string[]
  readonly props: readonly string[]
  readonly camera: StoryCameraShot
  readonly continuityFromPrevious: string | null
  readonly transition: StoryTransition
}

export interface DirectorPlan {
  readonly title: string
  readonly logline: string
  readonly storyBible: StoryBible | null
  readonly beats: readonly DirectorBeat[]
}

export type DeepSeekContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } }

export interface DeepSeekMessage {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string | readonly DeepSeekContentPart[]
}

export interface DeepSeekChatRequest {
  readonly model: 'deepseek-flash'
  readonly messages: readonly DeepSeekMessage[]
  readonly response_format: { readonly type: 'json_object' }
  readonly temperature: number
  readonly max_tokens: number
  readonly stream: false
}

export type DirectorFinishReason = 'stop' | 'length' | 'content_filter' | 'unknown'

/**
 * Server-only context the briefing decorator hands to the native director.
 * It is never accepted from the client and never persisted.
 */
export interface DirectorContext {
  readonly brief: StoryBrief
}

export interface StoryDirector {
  createPlan(input: {
    readonly premise: string
    readonly sceneCount: number
    readonly referenceUrl: string | null
    readonly context?: DirectorContext
  }): Promise<DirectorPlan>
}
