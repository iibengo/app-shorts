# Tasks: Brand Construction Landing Page

**Input**: Design documents from `/specs/001-brand-construction-landing/`

**Prerequisites**: `spec.md` (required), `plan.md` (required)

**Tests**: Included because the feature specification requires component tests and measurable acceptance checks. Write each story's tests before its implementation and confirm they fail for the expected reason.

**Organization**: Tasks are grouped by user story. US1 is the MVP; US2 and US3 harden the same page and are independently verifiable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: `US1`, `US2`, or `US3`
- Every task names its exact file path.

## Path Conventions

- Nuxt 4 application source: `app/`
- Page: `app/pages/index.vue`
- Root shell: `app/app.vue`
- Tests: `tests/unit/` and `tests/acceptance/`
- Tailwind config: `tailwind.config.ts`
- Vitest config: `vitest.config.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the missing test tooling and brand tokens without adding runtime dependencies.

- [ ] **T001** Update `package.json` to add devDependencies `vitest`, `@nuxt/test-utils`, `@vue/test-utils`, and `happy-dom`; add scripts `"test": "vitest"` and `"test:run": "vitest run"`. Run `npm install` to update `package-lock.json`. Do not add runtime dependencies. Confirm the installation succeeds.
- [ ] **T002** [P] Create `tailwind.config.ts` with explicit content globs `./app/**/*.{vue,js,ts}`, `theme.extend.colors.brand` (`ink`, `surface`, `text`, `muted`, `violet`, `fuchsia`, `violet-deep`, `fuchsia-deep`), and `theme.extend.keyframes.brand-glow` plus `theme.extend.animation['brand-glow']`. Use Tailwind v3 configuration syntax only; no `@theme`, `@utility`, or CSS-first imports.
- [ ] **T003** [P] Create `vitest.config.ts` using `defineVitestConfig` from `@nuxt/test-utils/config`; set `test.environment: 'nuxt'`, `environmentOptions.nuxt.domEnvironment: 'happy-dom'`, `testTimeout: 30000`, and `hookTimeout: 120000` for the server acceptance test.
- [ ] **T004** [P] Verify `nuxt.config.ts` still lists `@nuxtjs/tailwindcss` and requires no changes. Do not add a CSS file or change modules.

**Checkpoint**: Test runner, Tailwind tokens, and config resolution are ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire the root shell so any page can render at `/`.

**⚠️ CRITICAL**: Without T005, `app/pages/index.vue` will not be displayed. The current `app/app.vue` has no `<NuxtPage />` and contains the old Nuxt welcome/test content.

- [ ] **T005** Update `app/app.vue`: remove the `¡Tailwind funciona! 🎉` block and `<NuxtWelcome />`; keep `<NuxtRouteAnnouncer />`; add `<NuxtPage />`. Keep the shell minimal (no wrapper, layout, or global stylesheet). This task is mandatory and blocks every user story.
- [ ] **T006** [P] Confirm `app/pages/` exists as the Nuxt 4 pages directory and that adding `index.vue` will map to `/` without router configuration. No file change is required; the directory is created when T009 adds `app/pages/index.vue`.

**Checkpoint**: Root shell is ready; page work can begin.

---

## Phase 3: User Story 1 - A credible branded pre-launch page (Priority: P1) 🎯 MVP

**Goal**: Render the complete branded "En construcción" page with exact Spanish copy, one disabled CTA, and no fake live-product claims.

**Independent Test**: Visit `/`; verify brand, badge, H1, value proposition, three feature hints, disabled CTA with helper, footer, and absence of fake metrics/sign-in and old Nuxt welcome content.

### Tests for User Story 1 (write first) ⚠️

- [ ] **T007** [P] [US1] Create `tests/unit/index-page.spec.ts` using `mountSuspended` from `@nuxt/test-utils/runtime` and `~/pages/index.vue`. Assert:
  - `landing-page`, `brand-mark`, `construction-badge`, `hero-heading`, `value-proposition`, `feature-list`, `primary-cta`, `cta-helper`, and `site-footer` test IDs exist.
  - `AI Shorts`, `EN CONSTRUCCIÓN`, the exact H1, exact value proposition, and the three exact feature hints render.
  - The CTA is a `<button>` with `disabled`, `aria-disabled="true"`, `aria-describedby="cta-helper"`, no `href`, and no form ancestor.
  - The helper starts with `Próximamente.`, the footer contains the exact copyright line, and no fake-claim markers or external assets exist.
- [ ] **T008** [US1] Run `npm run test:run -- tests/unit/index-page.spec.ts` against the current shell and confirm it fails because `app/pages/index.vue` does not exist yet. Record the expected failure; do not weaken the assertions to make it pass.

### Implementation for User Story 1

- [ ] **T009** [US1] Create `app/pages/index.vue` with `<script setup lang="ts">` and the exact composition from `plan.md`:
  - Root: relative, `min-h-svh`, `overflow-x-clip`, near-black brand background; decorative layer clips both axes without clipping vertical content.
  - Header: inline SVG play mark plus `AI Shorts` wordmark; no navigation or dead links.
  - Main: eyebrow badge, exactly one `<h1>`, value proposition, three-item `<ul>`, disabled CTA, and helper.
  - Footer: exact `© 2026 AI Shorts · Hecho para creadores.` line.
  - Use only inline SVG and system fonts; no images, remote fonts, forms, or runtime state.
  - Depends on T002, T005, and T007.
- [ ] **T010** [US1] Add metadata in `app/pages/index.vue` with `useHead` and `useSeoMeta`: `lang="es"`, `color-scheme: dark`, theme color `#09090b`, title `AI Shorts — Próximamente`, the exact Spanish description, and the planned Open Graph fields. No canonical URL, no `noindex`, no external image. Depends on T009.
- [ ] **T011** [US1] Run `npm run test:run -- tests/unit/index-page.spec.ts`; fix copy, selectors, or CTA semantics until it passes. Depends on T009 and T010.
- [ ] **T012** [US1] Perform the 5-second content/honesty check against `spec.md` FR-003 through FR-008 and FR-020: brand, construction notice, product value, three hints, one disabled CTA, no fake metrics/sign-in/pricing/dead links. Depends on T011.

**Checkpoint**: US1 is fully functional and independently shippable as the MVP.

---

## Phase 4: User Story 2 - A clean experience on any screen size (Priority: P2)

**Goal**: Make the same page deliberate and readable from 320 px through large desktop, including zoom and text scaling.

**Independent Test**: Load `/` at 320, 360, 390, 768, 1024, 1440, and 1920 px, plus 200% and 400% zoom; confirm no horizontal scroll, no clipping, one-column feature hints on mobile, three columns from `sm`, and a CTA fully inside the viewport.

### Implementation & Verification for User Story 2

- [ ] **T013** [US2] Audit and refine responsive classes in `app/pages/index.vue`: fluid H1 sizing (`text-4xl sm:text-6xl lg:text-7xl`), `px-6 sm:px-8`, `grid gap-3 sm:grid-cols-3`, `max-w-3xl` hero copy, no fixed-width text containers, no fixed-width CTA, `overflow-x-clip` on the page root, and `overflow-hidden` only on the decorative layer. Depends on T009.
- [ ] **T014** [US2] Verify the responsive matrix in `spec.md` SC-002: 320, 360, 390, 768, 1024, 1440, and 1920 px; 200% and 400% zoom; large default font size. Record the viewport list and result (pass/fail) in the task notes or PR description. Depends on T013.
- [ ] **T015** [US2] Verify the mobile composition specifically at 320 px: badge, H1, value proposition, feature hints, CTA, helper, and footer are all visible with no horizontal scrollbar; the decorative glow is clipped and never adds page width. Fix `app/pages/index.vue` if any clipping is found. Depends on T014.

**Checkpoint**: US1 and US2 both pass independently; the page is usable on mobile and desktop.

---

## Phase 5: User Story 3 - An accessible, respectful experience (Priority: P3)

**Goal**: Ship semantic HTML, Spanish metadata, honest disabled-state semantics, AA contrast, reduced-motion support, forced-colors fallback, and no-JS content.

**Independent Test**: Audit `/` with a screen reader, keyboard, reduced motion, forced colors, zoom, and JavaScript disabled; confirm landmarks, one H1, `lang="es"`, hidden decorations, described disabled CTA, no animation under reduced motion, and full content without JavaScript.

### Tests for User Story 3 (write first) ⚠️

- [ ] **T016** [P] [US3] Create `tests/unit/index-page-a11y.spec.ts` using `mountSuspended`. Assert:
  - Exactly one `header`, `main`, and `footer`, and exactly one `h1`.
  - Every SVG has `aria-hidden="true"` and `focusable="false"`.
  - The decorative glow wrapper has `aria-hidden="true"`; no positive `tabindex`; no `video`, `audio`, or `autoplay`.
  - The CTA has both `disabled` and `aria-disabled="true"`, and `aria-describedby` resolves to the helper containing `Próximamente`.
  - Every class containing `animate-` is prefixed with `motion-safe:`.
  - Old shell content (`¡Tailwind funciona!`, `NuxtWelcome`) is absent.
  - Run the test and confirm it fails for any not-yet-implemented a11y requirement.
- [ ] **T017** [P] [US3] Create `tests/acceptance/landing-route.spec.ts` with `// @vitest-environment node`, `setup({ server: true })` from `@nuxt/test-utils/e2e`, and `$fetch('/')`. Assert HTTP 200, `<html lang="es"`, exact title and description, exact visible copy, exactly one H1, no old Nuxt/test content, and no external font/image/icon hosts. Confirm the test fails until the page and metadata are in place.

### Implementation for User Story 3

- [ ] **T018** [US3] Harden accessibility in `app/pages/index.vue`:
  - Ensure `useHead` sets `htmlAttrs.lang = 'es'` and the page has `header`/`main`/`footer` landmarks.
  - Keep exactly one H1; ensure the brand mark and all decorative SVGs/glows are `aria-hidden` and non-focusable.
  - Keep the CTA natively `disabled` with `aria-disabled="true"` and `aria-describedby="cta-helper"`; ensure the helper has `id="cta-helper"`.
  - Apply `motion-safe:animate-brand-glow` only; add `motion-reduce` fallbacks for any transition.
  - Add the forced-colors fallback on gradient-clipped H1 text.
  - Verify all text uses token pairings that meet 4.5:1 normal / 3:1 large contrast; avoid opacity on body text.
  - Depends on T009 and T016.
- [ ] **T019** [US3] Run `npm run test:run -- tests/unit/index-page-a11y.spec.ts tests/acceptance/landing-route.spec.ts`; fix semantics, metadata, or route wiring until both pass. Depends on T017 and T018.
- [ ] **T020** [US3] Perform the manual accessibility matrix: screen-reader announcement, keyboard Tab pass (no dead focusables/traps), `prefers-reduced-motion: reduce` (computed animation is none), forced-colors mode (H1 visible), 200%/400% zoom, and JavaScript disabled (all content and disabled CTA visible). Record results in the task notes or PR. Depends on T018.

**Checkpoint**: All three user stories pass independently; the page is accessible and honest.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete feature against build, performance, network, and specification outcomes.

- [ ] **T021** Run the full `npm run test:run` suite (unit + acceptance) and fix any remaining failures. Confirm no test relies on snapshots or CSS-class-only assertions for content. Depends on T011, T019.
- [ ] **T022** Run `npm run build` and `npm run generate`; verify the `/` route contains the landing HTML and Spanish metadata, and that no server route, secret, or runtime environment variable was introduced. Depends on T021.
- [ ] **T023** Run Lighthouse mobile and desktop against the production preview; verify LCP ≤ 2.0 s, CLS < 0.1, INP < 200 ms, Accessibility 100, zero third-party requests, zero console errors, and zero failed requests. If the glow causes mobile paint cost, reduce blur/opacity in `app/pages/index.vue` rather than adding assets. Depends on T022.
- [ ] **T024** Walk the full acceptance checklist from `spec.md` FR-001 through FR-020 and SC-001 through SC-010. Confirm the normative copy deck is exact, `app/app.vue` has no old content, and `README`/`nuxt.config.ts` were not accidentally changed. Depends on T015, T020, T023.
- [ ] **T025** Update the checkboxes in `specs/001-brand-construction-landing/tasks.md`, summarize manual verification results, and prepare a single commit for the feature files, config, page, and tests. Do not include unrelated workspace changes. Depends on T024.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T002 and T003 can parallelize after T001 begins. T001 must finish before tests run.
- **Foundational (Phase 2)**: T005 depends on nothing technically but MUST complete before T009 can render. It can run in parallel with T002/T003, but not after the page is expected to work.
- **US1 (Phase 3)**: T007 depends on T001 and T003. T009 depends on T002, T005, and T007. T010 and T011 depend on T009. T012 depends on T011.
- **US2 (Phase 4)**: T013 depends on T009. T014/T015 depend on T013.
- **US3 (Phase 5)**: T016 and T017 depend on T001, T003, T005, and T009. T018 depends on T009 and T016. T019 depends on T017/T018. T020 depends on T018.
- **Polish (Phase 6)**: T021 depends on T011 and T019; T022 → T023 → T024 → T025 are sequential.

### Critical Path

`T001 → T003 → T007 → T009 → T010 → T011 → T013 → T016/T017 → T018 → T019 → T021 → T022 → T023 → T024 → T025`

`T005` is an independent hard gate for rendering and must be done before T009 is validated.

### Same-File Constraints

`app/pages/index.vue` is edited by T009, T010, T013, T015, and T018. These tasks MUST run sequentially, in that order; none may be marked `[P]`. `app/app.vue` is edited only by T005. Test files are separate and may be written in parallel with config work once T001/T003 exist.

### Parallel Opportunities

- T002, T003, T004 can run in parallel after T001 starts.
- T005 can run in parallel with T002/T003, but before page validation.
- T007, T016, and T017 are separate test files and can be drafted in parallel once the test runner exists; T016/T017 are grouped under US3 because they validate its outcomes.
- T014 and T020 are manual verification tasks and may be performed in either order after their prerequisites.
- T022/T023 must not run until all tests pass.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001–T006 (tooling, tokens, root shell).
2. Write T007 and confirm it fails.
3. Implement T009–T010.
4. Run T011 and fix until the content contract passes.
5. Complete T012 and stop to validate the complete P1 page independently.

### Incremental Delivery

1. **US1**: Content-complete branded page at `/` — the shippable MVP.
2. **US2**: Responsive/zoom hardening, verified across the viewport matrix.
3. **US3**: Accessibility hardening, route acceptance test, and manual AT/contrast/reduced-motion checks.
4. **Polish**: Full suite, build/generate, Lighthouse/network audit, and spec acceptance sign-off.

### Notes

- Do not modify `nuxt.config.ts` unless T004 reveals a real blocker; the Tailwind module is already registered and the page needs no new module.
- Do not add Tailwind v4 syntax. The installed engine is 3.4.19 behind `@nuxtjs/tailwindcss` 6.14.0.
- Do not add runtime dependencies, server routes, data fetching, forms, or analytics.
- Do not add a light theme, theme toggle, custom logo file, custom font, or external asset.
- Keep all UI copy in Spanish (`es-ES`); keep code identifiers and test descriptions in English.
- The disabled CTA must remain disabled in all states. There is no email collection and no success state.
- Commit after each logical checkpoint; do not mix unrelated workspace changes.
