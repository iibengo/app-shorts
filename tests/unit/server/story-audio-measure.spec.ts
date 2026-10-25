// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { StoryError } from '../../../server/story/errors'
import { audioProbeArgs, parseAudioProbe } from '../../../server/story/audio-probe'
import {
  SPEECH_ESTIMATE_TOLERANCE,
  assertPlanFits,
  planIsImpossible,
} from '../../../server/story/speech-plan'
import type { SpeechPlan } from '../../../server/story/speech-plan'

function probe(overrides: Record<string, unknown> = {}) {
  return {
    streams: [{ codec_type: 'audio', codec_name: 'mp3', channels: 1 }],
    format: { duration: '3.417000' },
    ...overrides,
  }
}

describe('014 · la medición real manda', () => {
  it('reads the duration the provider actually produced', () => {
    const measured = parseAudioProbe(probe())

    expect(measured.durationSeconds).toBeCloseTo(3.417, 3)
    expect(measured.channels).toBe(1)
  })

  it('rejects a file with no duration instead of treating it as zero', () => {
    // A zero-second segment would flash a caption and claim a voice nobody hears.
    const error = (() => {
      try {
        parseAudioProbe({ streams: [], format: {} })

        return null
      } catch (caught) {
        return caught
      }
    })()

    expect(error).toBeInstanceOf(StoryError)
    expect((error as StoryError).code).toBe('audio-invalid')
  })

  it('rejects a file with streams but no audio track', () => {
    const error = (() => {
      try {
        parseAudioProbe({ streams: [{ codec_type: 'video' }], format: { duration: '5' } })

        return null
      } catch (caught) {
        return caught
      }
    })()

    expect((error as StoryError).code).toBe('audio-invalid')
  })

  it('asks ffprobe for the JSON it can parse', () => {
    const args = audioProbeArgs('/tmp/a.mp3')

    expect(args).toContain('json')
    expect(args).toContain('format=duration:stream=codec_type,codec_name,channels')
  })
})

describe('014 · una frase imposible se rechaza antes de pagar', () => {
  it('flags the scene whose line cannot fit in its time', () => {
    const plan: SpeechPlan = {
      items: [
        { sceneOrder: 1, text: 'Corta.', availableSeconds: 10, estimatedSeconds: 1 },
        { sceneOrder: 2, text: 'Larguísima.', availableSeconds: 6, estimatedSeconds: 9 },
      ],
      totalEstimatedSeconds: 10,
      totalCharacters: 20,
    }

    expect(planIsImpossible(plan)).toEqual([2])
  })

  it('throws a stable code so the client can ask for a shorter idea', () => {
    const plan: SpeechPlan = {
      items: [{ sceneOrder: 1, text: 'Larguísima.', availableSeconds: 6, estimatedSeconds: 9 }],
      totalEstimatedSeconds: 9,
      totalCharacters: 10,
    }

    const error = (() => {
      try {
        assertPlanFits(plan)

        return null
      } catch (caught) {
        return caught
      }
    })()

    expect((error as StoryError).code).toBe('audio-too-long')
  })

  it('tolerates an estimate slightly over budget, because the estimate is declared', () => {
    const plan: SpeechPlan = {
      items: [{
        sceneOrder: 1,
        text: 'Algo larga.',
        availableSeconds: 6,
        estimatedSeconds: 6 * (SPEECH_ESTIMATE_TOLERANCE - 0.05),
      }],
      totalEstimatedSeconds: 6,
      totalCharacters: 11,
    }

    expect(planIsImpossible(plan)).toEqual([])
  })
})
