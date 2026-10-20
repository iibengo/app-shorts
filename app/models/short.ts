export type ShortId = `short-${string}`

export type PosterSrc = `/mock/shorts/${string}.svg`

export interface ShortCreator {
  readonly name: string
  readonly handle: `@${string}`
}

export interface ShortStats {
  readonly likes: number
  readonly saves: number
}

export interface ShortPoster {
  readonly src: PosterSrc
  readonly alt: string
  readonly width: 1080
  readonly height: 1920
}

export interface ShortMedia {
  readonly type: 'poster'
  readonly poster: ShortPoster
}

export interface ShortInitialState {
  readonly isLiked: boolean
  readonly isSaved: boolean
}

export interface ShortInteractionState {
  isLiked: boolean
  isSaved: boolean
}

export interface Short {
  readonly id: ShortId
  readonly title: string
  readonly creator: ShortCreator
  readonly media: ShortMedia
  readonly durationSeconds: number
  readonly tags: readonly string[]
  readonly stats: ShortStats
  readonly publishedAt: string
  readonly initialState: ShortInitialState
}

export type ShareOutcome = 'shared' | 'copied' | 'unavailable' | 'cancelled'

export interface SharePayload {
  title: string
  text: string
  url: string
}
