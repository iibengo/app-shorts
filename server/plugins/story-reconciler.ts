import { createStoryRuntime } from '../story/runtime'

interface ReconcilerGlobal {
  storyReconcilerTimer?: ReturnType<typeof setInterval>
}

interface Reconciler {
  runOnce(): Promise<void>
}

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  if (!process.env.DATABASE_URL) {
    return
  }

  const runtime = createStoryRuntime(
    useRuntimeConfig() as unknown as Parameters<typeof createStoryRuntime>[0],
  )
  const reconcilers: Reconciler[] = []

  if (runtime.reconciler) reconcilers.push(runtime.reconciler)
  if (runtime.reelReconciler) reconcilers.push(runtime.reelReconciler)

  if (reconcilers.length === 0 || !runtime.reconcilerEnabled) {
    return
  }

  const globalState = globalThis as unknown as ReconcilerGlobal

  if (globalState.storyReconcilerTimer) {
    return
  }

  let running = false

  const timer = setInterval(() => {
    if (running) return

    running = true

    void Promise.allSettled(reconcilers.map((reconciler) => reconciler.runOnce()))
      .catch(() => undefined)
      .finally(() => {
        running = false
      })
  }, runtime.reconcilerIntervalMs)

  timer.unref?.()
  globalState.storyReconcilerTimer = timer

  nitroApp.hooks.hook('close', () => {
    clearInterval(timer)
    delete globalState.storyReconcilerTimer
  })
})
