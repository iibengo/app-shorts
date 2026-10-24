<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import {
  STORY_CHARACTER_REF_COPY,
  STORY_COST_MODE_COPY,
  STORY_SHOT_FRAMING_LABELS,
} from '~/data/story'
import type { StoryScene, StoryShot } from '~/models/story'
import { sceneStatusLabel, storyCameraLabel } from '~/utils/story'

const props = defineProps<{
  shot: StoryShot
  total: number
  scene?: StoryScene | null
  /** Canon names keyed by id: the scene stores ids, the screen shows names. */
  characterNames?: Readonly<Record<string, string>>
  legacy?: boolean
}>()
const emit = defineEmits<{
  regenerate: [visualPrompt: string, durationSeconds: number]
}>()
const prompt = ref(props.shot.visualPrompt)

watch(() => props.shot.visualPrompt, (value) => { prompt.value = value })

const disabled = computed(() => props.legacy === true
  || props.shot.status === 'CANCELLED'
  || props.shot.status === 'VIDEO_READY'
  || prompt.value.trim().length < 20)
const characters = computed(() => props.scene?.characters.join(', ') ?? '—')
const propsList = computed(() => props.scene?.props.join(', ') ?? '—')
const continuity = computed(() => '—')

// 012: the framing actually sent may differ from the plan when the action
// belongs to a secondary character. Showing the sent one avoids a review that
// argues with the picture it is looking at.
const focusName = computed<string | null>(() => {
  const subject = (props.shot.subject ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  // Scene characters are ids; the label must show the canon name, so "pixel"
  // becomes "Pixel" instead of leaking the internal id to the reviewer.
  const present = props.scene?.characters ?? []
  const match = present.find((id) => {
    const name = props.characterNames?.[id] ?? id

    return subject.includes(name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
      || subject.includes(id.toLowerCase())
  })

  return match === undefined ? null : props.characterNames?.[match] ?? match
})
</script>

<template>
  <li
    data-testid="story-shot-card"
    :data-shot-order="shot.order"
    :data-shot-status="shot.status"
    :data-shot-duration="shot.durationSeconds"
    class="rounded-xl border border-white/10 bg-brand-ink p-3"
  >
    <img
      v-if="shot.keyframeUrl"
      data-testid="story-shot-keyframe"
      :src="shot.keyframeUrl"
      :alt="`Imagen del plano ${shot.order}`"
      loading="lazy"
      class="aspect-[9/16] w-full rounded-xl object-cover"
    >
    <p class="mt-2 text-sm font-semibold text-brand-text">
      Plano {{ shot.order }} de {{ total }} · {{ shot.durationSeconds }} s ·
      {{ sceneStatusLabel(shot.status) }}
    </p>
    <dl class="mt-2 grid grid-cols-2 gap-2 text-xs">
      <div data-testid="story-shot-duration"><dt class="text-brand-muted">Duración</dt><dd>{{ shot.durationSeconds }} s</dd></div>
      <div data-testid="story-shot-framing"><dt class="text-brand-muted">Encuadre</dt><dd>{{ STORY_SHOT_FRAMING_LABELS[shot.framing] }}</dd></div>
      <div v-if="focusName !== null" data-testid="story-shot-focus"><dt class="text-brand-muted">Foco</dt><dd>{{ STORY_CHARACTER_REF_COPY.focus.replace('{name}', focusName) }}</dd></div>
      <div data-testid="story-shot-camera"><dt class="text-brand-muted">Cámara</dt><dd>{{ storyCameraLabel(shot.camera) }}</dd></div>
      <div data-testid="story-shot-location"><dt class="text-brand-muted">Localización</dt><dd>{{ shot.locationId }}</dd></div>
      <div data-testid="story-shot-subject"><dt class="text-brand-muted">Sujeto</dt><dd>{{ shot.subject }}</dd></div>
      <div data-testid="story-shot-characters"><dt class="text-brand-muted">Personajes</dt><dd>{{ characters }}</dd></div>
      <div data-testid="story-shot-props"><dt class="text-brand-muted">Props</dt><dd>{{ propsList }}</dd></div>
      <div data-testid="story-shot-continuity"><dt class="text-brand-muted">Continuidad</dt><dd>{{ continuity }}</dd></div>
      <div data-testid="story-shot-action" class="col-span-2"><dt class="text-brand-muted">Acción</dt><dd>{{ shot.action }}</dd></div>
    </dl>

    <p v-if="shot.error" data-testid="story-shot-error" role="alert" class="mt-2 rounded-xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-2 text-xs text-brand-text">
      {{ shot.error.message }}
    </p>

    <span v-if="legacy" data-testid="story-shot-legacy" class="mt-2 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{{ STORY_COST_MODE_COPY.legacyShot }}</span>

    <label class="mt-2 block text-xs text-brand-muted" :for="`shot-prompt-${shot.id}`">
      Prompt visual
    </label>
    <textarea
      :id="`shot-prompt-${shot.id}`"
      data-testid="story-shot-prompt"
      v-model="prompt"
      maxlength="400"
      :disabled="legacy === true"
      class="mt-1 min-h-20 w-full rounded-xl border border-white/15 bg-brand-surface p-3 text-sm text-brand-text"
    />

    <p data-testid="story-shot-attempt" class="mt-2 text-xs text-brand-muted">
      Intentos de imagen: {{ shot.keyframeAttempts }} · Intentos de vídeo: {{ shot.videoAttempts }}
    </p>
    <AppButton
      type="button"
      data-testid="story-shot-regenerate"
      variant="secondary"
      :disabled="disabled"
      class="mt-2 min-h-11"
      @click="emit('regenerate', prompt, shot.durationSeconds)"
    >
      Guardar y regenerar
    </AppButton>
  </li>
</template>
