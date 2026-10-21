// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createBriefingDirector } from '../../../server/story/briefing-director'
import type { BriefingDirectorLogEvent } from '../../../server/story/briefing-director'
import type {
  DirectorContext,
  DirectorPlan,
  StoryDirector,
} from '../../../server/story/director-types'
import { StoryError } from '../../../server/story/errors'

const SHORT_PREMISE = 'Una repostera muy famosa'
const LONG_PREMISE =
  'Una repostera descubre que sus postres predicen el futuro, aunque nadie lo sabe todavía.'

const PLAN: DirectorPlan = Object.freeze({
  title: 'El azúcar lo sabe',
  logline: 'Una repostera descubre lo que anticipan sus postres.',
  beats: Object.freeze([
    Object.freeze({
      order: 1,
      visualPrompt: 'Un obrador pequeño con luz de amanecer y harina en el aire.',
      narration: 'Cada mañana huele a azúcar recién hecha.',
    }),
    Object.freeze({
      order: 2,
      visualPrompt: 'Una vitrina llena de tartas bajo una luz cálida y suave.',
      narration: 'Los clientes llegan antes de que abra la puerta.',
    }),
    Object.freeze({
      order: 3,
      visualPrompt: 'Manos con harina sostienen un pastel que brilla en la penumbra.',
      narration: 'Ella ya sabe lo que va a pasar.',
    }),
    Object.freeze({
      order: 4,
      visualPrompt: 'La repostera mira por la ventana mientras cae la tarde gris.',
      narration: 'El último pastel espera sobre la mesa.',
    }),
  ]),
})

interface RecordedInput {
  readonly premise: string
  readonly sceneCount: number
  readonly referenceUrl: string | null
  readonly context?: DirectorContext
}

class RecordingDirector implements StoryDirector {
  readonly inputs: RecordedInput[] = []
  private readonly result: DirectorPlan
  private readonly failure: StoryError | null
  private readonly unexpected: Error | null

  constructor(options: {
    readonly plan?: DirectorPlan
    readonly failure?: StoryError
    readonly unexpected?: Error
  } = {}) {
    this.result = options.plan ?? PLAN
    this.failure = options.failure ?? null
    this.unexpected = options.unexpected ?? null
  }

  async createPlan(input: RecordedInput): Promise<DirectorPlan> {
    this.inputs.push(input)

    if (this.failure) {
      throw this.failure
    }

    if (this.unexpected) {
      throw this.unexpected
    }

    return this.result
  }
}

function contextOf(input: RecordedInput): DirectorContext {
  if (input.context === undefined) {
    throw new Error('expected a director context')
  }

  return input.context
}

describe('createBriefingDirector delegation', () => {
  it('calls the inner director exactly once and returns the plan untouched', async () => {
    const inner = new RecordingDirector()
    const decorated = createBriefingDirector(inner)

    const plan = await decorated.createPlan({
      premise: LONG_PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })

    expect(inner.inputs).toHaveLength(1)
    expect(plan).toBe(PLAN)
    expect(plan.beats).toHaveLength(4)
  })

  it('passes the premise verbatim, the scene count and the reference', async () => {
    const inner = new RecordingDirector()
    const decorated = createBriefingDirector(inner)
    const referenceUrl = 'https://v3.fal.media/files/test/reference.webp'

    await decorated.createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 6,
      referenceUrl,
    })

    const input = inner.inputs[0]!

    expect(input.premise).toBe(SHORT_PREMISE)
    expect(input.sceneCount).toBe(6)
    expect(input.referenceUrl).toBe(referenceUrl)
  })

  it('sends the structured context when the brief applies', async () => {
    const inner = new RecordingDirector()
    const decorated = createBriefingDirector(inner)

    await decorated.createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })

    const context = contextOf(inner.inputs[0]!)

    expect(Object.keys(context)).toEqual(['brief'])
    expect(context.brief.applied).toBe(true)

    if (!context.brief.applied) {
      throw new Error('expected an applied brief')
    }

    expect(context.brief.reasons).toEqual(['short-text', 'few-words', 'single-clause'])
    expect(context.brief.rendered.length).toBeGreaterThan(0)
    expect(context.brief.rendered.length).toBeLessThanOrEqual(500)
  })

  it('omits the context when the brief does not apply', async () => {
    const inner = new RecordingDirector()
    const decorated = createBriefingDirector(inner)

    await decorated.createPlan({
      premise: LONG_PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })

    const input = inner.inputs[0]!

    expect('context' in input).toBe(false)
    expect(input.context).toBeUndefined()
  })

  it('keeps a single delegation with an active brief', async () => {
    const inner = new RecordingDirector()
    const decorated = createBriefingDirector(inner)

    await decorated.createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })

    expect(inner.inputs).toHaveLength(1)
  })
})

describe('createBriefingDirector error handling', () => {
  it('propagates the StoryError unchanged without a second call', async () => {
    const failure = new StoryError('director-timeout')
    const inner = new RecordingDirector({ failure })
    const decorated = createBriefingDirector(inner)

    await expect(decorated.createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })).rejects.toBe(failure)

    expect(inner.inputs).toHaveLength(1)
    expect(failure.code).toBe('director-timeout')
  })

  it('propagates an unexpected error without transforming it', async () => {
    const failure = new Error('unexpected failure')
    const inner = new RecordingDirector({ unexpected: failure })
    const decorated = createBriefingDirector(inner)

    await expect(decorated.createPlan({
      premise: LONG_PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })).rejects.toBe(failure)

    expect(inner.inputs).toHaveLength(1)
  })
})

describe('createBriefingDirector observability', () => {
  it('emits only briefApplied on success', async () => {
    const events: BriefingDirectorLogEvent[] = []
    const decorated = createBriefingDirector(new RecordingDirector(), {
      onEvent: (event) => events.push(event),
    })

    await decorated.createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ event: 'story.plan.ok', briefApplied: true })
    expect(Object.keys(events[0]!).sort()).toEqual(['briefApplied', 'event'])
  })

  it('reports briefApplied false when the brief is inactive', async () => {
    const events: BriefingDirectorLogEvent[] = []
    const decorated = createBriefingDirector(new RecordingDirector(), {
      onEvent: (event) => events.push(event),
    })

    await decorated.createPlan({
      premise: LONG_PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })

    expect(events).toEqual([{ event: 'story.plan.ok', briefApplied: false }])
  })

  it('adds only the stable error code on failure', async () => {
    const events: BriefingDirectorLogEvent[] = []
    const decorated = createBriefingDirector(
      new RecordingDirector({ failure: new StoryError('director-invalid-output') }),
      { onEvent: (event) => events.push(event) },
    )

    await expect(decorated.createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })).rejects.toBeInstanceOf(StoryError)

    expect(events).toEqual([
      {
        event: 'story.plan.failed',
        briefApplied: true,
        errorCode: 'director-invalid-output',
      },
    ])
    expect(Object.keys(events[0]!).sort()).toEqual(['briefApplied', 'errorCode', 'event'])
  })

  it('does not emit finishReason or attempt fields', async () => {
    const events: BriefingDirectorLogEvent[] = []
    const decorated = createBriefingDirector(new RecordingDirector(), {
      onEvent: (event) => events.push(event),
    })

    await decorated.createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })

    const serialized = JSON.stringify(events)

    expect(serialized).not.toContain('finishReason')
    expect(serialized).not.toContain('attempt')
    expect(serialized).not.toContain(SHORT_PREMISE)
    expect(serialized).not.toContain('repostera')
  })

  it('works without a sink and never requires one', async () => {
    const inner = new RecordingDirector()
    const decorated = createBriefingDirector(inner)
    const withoutOptions = createBriefingDirector(inner, {})

    expect(await decorated.createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })).toBe(PLAN)

    expect(await withoutOptions.createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })).toBe(PLAN)

    expect(inner.inputs).toHaveLength(2)
  })
})
