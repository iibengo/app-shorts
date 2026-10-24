<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StoryShotCard from '~/components/story/StoryShotCard.vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COST_MODE_COPY, STORY_COPY } from '~/data/story'
import type { Story, StoryShotUpdateRequest } from '~/models/story'

const props = defineProps<{ story: Story }>()

/** The shot card shows names, so it needs the canon keyed by id. */
const characterNames = computed<Readonly<Record<string, string>>>(() => {
  const names: Record<string, string> = {}

  for (const character of props.story.plan?.storyBible?.characters ?? []) {
    names[character.id] = character.name
  }

  return names
})
const emit = defineEmits<{
  regenerateShot: [shotId: string, input: StoryShotUpdateRequest]
  approve: []
  cancel: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)
const scenes = computed(() => props.story.scenes.slice().sort((a, b) => a.order - b.order))
const shots = computed(() => scenes.value.flatMap((scene) => scene.shots))
const allReady = computed(() =>
  shots.value.length > 0
  && shots.value.every((shot) => shot.status === 'KEYFRAME_READY'))
const hasLegacy = computed(() => shots.value.some((shot) => shot.id.startsWith('legacy-')))
const planned = computed(() =>
  shots.value.reduce((total, shot) => total + shot.durationSeconds, 0))

onMounted(() => heading.value?.focus())

function regenerate(shotId: string, visualPrompt: string, durationSeconds: number): void {
  emit('regenerateShot', shotId, {
    visualPrompt,
    durationSeconds,
    regenerate: true,
  })
}
</script>

<template>
  <section data-testid="story-shot-review" class="mt-6">
    <h2
      ref="heading"
      data-testid="story-shot-review-heading"
      tabindex="-1"
      class="text-lg font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-xl"
    >
      {{ STORY_COST_MODE_COPY.reviewTitle }}
    </h2>

    <p class="mt-2 text-sm leading-relaxed text-brand-muted">
      Revisa los {{ shots.length }} planos de tus {{ scenes.length }} escenas antes de generar los vídeos.
    </p>

    <p data-testid="story-shot-review-total" class="mt-3 text-sm font-medium text-brand-text">
      {{ STORY_COST_MODE_COPY.plannedDuration }}: {{ planned }} s · {{ shots.length }} planos · objetivo {{ story.targetDurationSeconds }} s
    </p>

    <section
      v-for="scene in scenes"
      :key="scene.id"
      data-testid="story-shot-scene"
      :data-scene-order="scene.order"
      class="mt-5"
    >
      <h3 class="text-base font-semibold text-brand-text">
        Escena {{ scene.order }} de {{ scenes.length }} · {{ scene.status }}
      </h3>
      <p class="mt-1 text-xs text-brand-muted">{{ scene.narration }}</p>
      <ul class="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <StoryShotCard
          v-for="shot in scene.shots.slice().sort((a, b) => a.order - b.order)"
          :key="shot.id"
          :shot="shot"
          :total="shots.length"
          :scene="scene"
          :character-names="characterNames"
          :legacy="shot.id.startsWith('legacy-')"
          @regenerate="(prompt, duration) => regenerate(shot.id, prompt, duration)"
        />
      </ul>
    </section>

    <p v-if="hasLegacy" data-testid="story-shot-legacy-note" class="mt-4 rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs leading-relaxed text-brand-muted">
      {{ STORY_COST_MODE_COPY.legacyShot }}: esta historia antigua es de solo lectura.
    </p>

    <p class="mt-4 rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs leading-relaxed text-brand-muted">
      Al aprobar se generarán {{ shots.length }} vídeos y se cobrarán las generaciones correspondientes.
    </p>

    <div class="mt-3 flex flex-wrap gap-2">
      <AppButton data-testid="story-shot-approve" :disabled="!allReady || hasLegacy" class="min-h-12 w-full text-base sm:w-auto" @click="emit('approve')">
        {{ STORY_COPY.approve }}
      </AppButton>
      <AppButton variant="secondary" data-testid="story-shot-cancel" class="min-h-11 w-full sm:w-auto" @click="emit('cancel')">
        {{ STORY_COPY.cancel }}
      </AppButton>
    </div>
  </section>
</template>
