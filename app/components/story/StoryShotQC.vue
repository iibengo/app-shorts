<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY, STORY_QC_SEVERITY_LABELS } from '~/data/story'
import type { Story, StoryShot } from '~/models/story'
import { storyQcIssueCopy } from '~/utils/story'

const props = defineProps<{ story: Story }>()
const emit = defineEmits<{
  retryQc: []
  retryShot: [shotId: string]
  recoverShot: [shotId: string]
  approve: []
  cancel: []
  startOver: []
}>()
const heading = ref<HTMLHeadingElement | null>(null)
const confirmed = ref(false)

const qc = computed(() => props.story.qc)
const shotsById = computed(() => {
  const map = new Map<string, StoryShot>()
  for (const scene of props.story.scenes) {
    for (const shot of scene.shots) map.set(shot.id, shot)
  }
  return map
})
const rows = computed(() => (qc.value?.shots ?? [])
  .slice()
  .sort((a, b) => a.shotOrder - b.shotOrder))
const allVideoReady = computed(() =>
  props.story.scenes.every((scene) =>
    scene.shots.every((shot) => shot.status === 'VIDEO_READY')))
const canApprove = computed(() =>
  confirmed.value
  && allVideoReady.value
  && qc.value !== null
  && qc.value.status !== 'PASSED')
const canRetryQc = computed(() =>
  props.story.scenes.every((scene) =>
    scene.shots.every((shot) =>
      shot.videoUrl !== null
      && (shot.status === 'VIDEO_READY'
        || (shot.status === 'VIDEO_FAILED'
          && shot.videoError === 'provider-invalid-output')))))
const blocking = computed(() =>
  qc.value?.issues.filter((issue) => issue.severity === 'blocking').length ?? 0)
const warnings = computed(() =>
  qc.value?.issues.filter((issue) => issue.severity === 'warning').length ?? 0)
const verdict = computed(() => {
  if (!qc.value) return STORY_COPY.qcUnavailable
  if (qc.value.status === 'PASSED') return STORY_COPY.qcVerdictNone
  if (qc.value.status === 'UNAVAILABLE') return STORY_COPY.qcUnavailable
  if (blocking.value > 0) return `Hemos encontrado ${blocking.value} problema(s) de continuidad.`
  if (warnings.value > 0) return `Hay ${warnings.value} aviso(s) que no bloquean el montaje.`
  return STORY_COPY.qcVerdictNeedsReview
})

function canRecover(shot: StoryShot): boolean {
  const recoverable = shot.status === 'VIDEO_READY'
    || (shot.status === 'VIDEO_FAILED' && shot.videoError === 'provider-invalid-output')
  if (!recoverable) return false
  if (props.story.costMode === 'budget') return shot.keyframeAttempts < 2
  return true
}

function canRetryVideo(shot: StoryShot): boolean {
  return shot.status === 'VIDEO_FAILED' && shot.videoAttempts < 2
}

onMounted(() => heading.value?.focus())
</script>

<template>
  <section data-testid="story-shot-qc" class="mt-6">
    <h2 ref="heading" data-testid="story-shot-qc-heading" tabindex="-1" class="text-lg font-semibold tracking-tight text-brand-text sm:text-xl">
      Revisión de planos
    </h2>
    <p data-testid="story-shot-qc-verdict" role="status" aria-live="polite" aria-atomic="true" class="mt-3 rounded-2xl border border-white/10 bg-brand-surface p-3 text-sm font-medium text-brand-text">
      {{ verdict }}
    </p>

    <p v-if="qc?.errorCode" data-testid="story-shot-qc-unavailable" class="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-brand-text">
      {{ STORY_COPY.qcUnavailable }}
    </p>

    <ul class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <li
        v-for="result in rows"
        :key="`${result.shotId}-${result.shotOrder}`"
        data-testid="story-shot-qc-row"
        :data-shot-id="result.shotId"
        class="rounded-2xl border border-white/10 bg-brand-surface p-3"
      >
        <h3 class="text-base font-semibold text-brand-text">Plano {{ result.shotOrder }} · escena {{ result.sceneOrder }}</h3>
        <img v-if="result.framesUrl" data-testid="story-shot-qc-frames" :src="result.framesUrl" alt="Fotogramas del plano" loading="lazy" class="mt-3 aspect-[2/1] w-full rounded-xl object-cover">
        <p v-else data-testid="story-shot-qc-frames-missing" class="mt-3 rounded-xl border border-white/10 bg-black p-3 text-xs text-brand-muted">Fotogramas no disponibles.</p>

        <p v-if="shotsById.get(result.shotId)?.error" data-testid="story-shot-qc-error" role="alert" class="mt-2 rounded-xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-2 text-xs text-brand-text">
          {{ shotsById.get(result.shotId)?.error?.message }}
        </p>

        <ul v-if="result.issues.length > 0" class="mt-3 space-y-2">
          <li v-for="(issue, index) in result.issues" :key="`${issue.code}-${issue.frame}-${index}`" data-testid="story-shot-qc-issue" :data-code="issue.code" :data-severity="issue.severity" class="rounded-xl border p-2 text-xs" :class="issue.severity === 'blocking' ? 'border-brand-fuchsia/40 bg-brand-fuchsia/10 text-brand-text' : 'border-amber-400/40 bg-amber-400/10 text-brand-text'">
            <span class="font-semibold">{{ STORY_QC_SEVERITY_LABELS[issue.severity] }}:</span>
            {{ storyQcIssueCopy(issue.code) }}
          </li>
        </ul>

        <div v-if="shotsById.get(result.shotId)" class="mt-3 flex flex-col gap-2">
          <AppButton v-if="canRetryVideo(shotsById.get(result.shotId)!)" type="button" variant="secondary" data-testid="story-shot-qc-retry-video" class="min-h-11" @click="emit('retryShot', result.shotId)">
            Reintentar vídeo
          </AppButton>
          <AppButton v-if="canRecover(shotsById.get(result.shotId)!)" type="button" variant="secondary" data-testid="story-shot-qc-recover" class="min-h-11" @click="emit('recoverShot', result.shotId)">
            Regenerar imagen y vídeo
          </AppButton>
        </div>
      </li>
    </ul>

    <label class="mt-4 flex min-h-11 items-center gap-2 text-sm text-brand-text">
      <input v-model="confirmed" data-testid="story-shot-qc-confirm" type="checkbox" class="size-5">
      Confirmo que revisé los planos y quiero continuar igualmente.
    </label>

    <div class="mt-3 flex flex-wrap gap-2">
      <AppButton v-if="canApprove" type="button" data-testid="story-shot-qc-approve" class="min-h-11" @click="emit('approve')">
        Aprobar de todos modos
      </AppButton>
      <AppButton v-if="canRetryQc" type="button" variant="secondary" data-testid="story-shot-qc-retry" class="min-h-11" @click="emit('retryQc')">
        Volver a revisar
      </AppButton>
      <AppButton type="button" variant="secondary" data-testid="story-shot-qc-cancel" class="min-h-11" @click="emit('cancel')">
        {{ STORY_COPY.cancel }}
      </AppButton>
    </div>

    <AppButton type="button" variant="secondary" data-testid="story-shot-qc-start-over" class="mt-3 min-h-11" @click="emit('startOver')">
      {{ STORY_COPY.startOver }}
    </AppButton>
  </section>
</template>
