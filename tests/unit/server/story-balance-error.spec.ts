// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { storyErrorMessage, getStoryErrorDefinition } from '../../../server/story/errors'

describe('balance error', () => {
  it('says there is no balance instead of a generic failure', () => {
    const message = storyErrorMessage('provider-balance-exhausted')

    expect(message).toContain('saldo')
    expect(message).not.toContain('servicio')
    expect(getStoryErrorDefinition('provider-balance-exhausted').retryable).toBe(false)
    expect(getStoryErrorDefinition('provider-balance-exhausted').status).toBe(503)
  })
})
