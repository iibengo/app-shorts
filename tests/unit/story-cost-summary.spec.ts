import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryCostSummary from '~/components/story/StoryCostSummary.vue'

describe('StoryCostSummary 008', () => {
  it('shows the estimated cost instead of the profile cap', async () => {
    const wrapper = await mountSuspended(StoryCostSummary, {
      props: { costMode: 'standard', targetDurationSeconds: 30 },
    })
    const cost = wrapper.get('[data-testid="story-cost-summary-cost"]')

    expect(cost.attributes('data-cost-usd')).toBe('4.83')
    expect(cost.text()).toContain('coste estimado ≈ 4.83 USD')
    expect(cost.text()).not.toContain('7.00')
  })
})
