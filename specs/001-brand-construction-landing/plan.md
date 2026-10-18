# Implementation Plan: Brand Construction Landing Page

**Branch**: `001-brand-construction-landing` | **Date**: 2026-10-18 | **Spec**: [`specs/001-brand-construction-landing/spec.md`](./spec.md)

**Input**: Feature specification from `/specs/001-brand-construction-landing/spec.md`

**Note**: This plan covers the pre-launch, static landing page for AI Shorts. No implementation code is written in this phase.

## Summary

Deliver a single, static, Spanish-language landing page at `/` that presents AI Shorts as a credible premium product that is not yet launched. The page uses one self-contained page component, a system-font typographic brand mark with an inline SVG play mark, a near-black background with a violet-to-fuchsia ambient glow, exact pre-launch copy, and one disabled CTA with forthcoming helper text. The root app shell is updated to render `<NuxtPage />`; without that change the page will not appear.

The implementation adds brand design tokens and one keyframe animation to `tailwind.config.ts`, adds a Vitest + `@nuxt/test-utils` + happy-dom test setup, and proves the page through component tests and a server-rendered route acceptance test. No runtime dependencies, server routes, secrets, data storage, or external network assets are introduced.

## Technical Context

**Language/Version**: TypeScript 5.x (Nuxt-managed), Vue 3.5.42, Nuxt 4.5.2

**Primary Dependencies**: Nuxt 4.5.2, Vue 3.5.42, Vue Router 5.3.1, `@nuxtjs/tailwindcss` 6.14.0 (Tailwind CSS engine 3.4.19), `@nuxt/fonts` 0.14.0, `@nuxt/icon` 2.5.1, `@vite-pwa/nuxt` 1.1.1. No new runtime dependencies.

**Storage**: N/A — no database, cookies, `localStorage`, forms, or persistence.

**Testing**: Vitest with `@nuxt/test-utils` (Nuxt environment), `@vue/test-utils`, and `happy-dom` for component tests. `@nuxt/test-utils/e2e` server mode for one route-level acceptance test. These are new **devDependencies** only. Add scripts `"test": "vitest"` and `"test:run": "vitest run"`.

**Target Platform**: Modern evergreen browsers on mobile and desktop, static/SSR web output, 320 px through large desktop. `nuxt generate` compatible.

**Project Type**: Web application — single static route in an existing Nuxt 4 app.

**Performance Goals**: Lighthouse mobile LCP ≤ 2.0 s, CLS < 0.1, INP < 200 ms, zero third-party requests, zero failed requests, no layout shift from fonts.

**Constraints**: No external network assets for first paint; no runtime dependencies; no server routes, secrets, or analytics; Spanish (`es-ES`) copy only; Tailwind module v6 with Tailwind v3 syntax (no Tailwind v4 `@theme`, `@utility`, or CSS-first `@import "tailwindcss"`); dark-only design; one H1; app shell change mandatory.

**Scale/Scope**: One route (`/`), one page component, one design-token config file, three test files, one disabled CTA. No user data.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still an unratified template, so there are no formal project-specific gates to enforce. The feature is checked against the project brief's working principles:

| Gate | Result | Evidence |
|------|--------|----------|
| Pre-launch honesty | PASS | `EN CONSTRUCCIÓN` badge, disabled CTA with `Próximamente` helper, no fake metrics, sign-in, pricing, or dead links (FR-003, FR-007, FR-008). |
| Core promise remains 1-to-3 clicks | PASS | One screen, one primary action, no navigation. The disabled CTA is the only action-shaped element (FR-007, FR-020). |
| Minimal runtime footprint | PASS | No new runtime dependencies, no data fetching, no server routes, inline SVG, system fonts (FR-016, FR-018). |
| Accessible by default | PASS | Semantic landmarks, one H1, Spanish `lang`, AA contrast targets, reduced-motion support, JS-off content (FR-011 through FR-015). |
| Spec-driven and testable | PASS | Normative copy deck, stable `data-testid` hooks, component tests, and a route acceptance test (FR-019, SC-001 through SC-010). |
| Static/SSR-first delivery | PASS | Content is in server-rendered HTML and compatible with `nuxt generate` (FR-017, FR-018). |

**Post-design re-check**: PASS. The design is a single static page with no unresolved technical unknowns. No complexity violations need justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-brand-construction-landing/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
└── tasks.md             # Ordered implementation tasks
```

No `research.md`, `data-model.md`, `quickstart.md`, or `contracts/` are produced: the feature is fully specified, has no data model, no API contracts, and no unresolved research questions.

### Source Code (repository root)

```text
app/
├── app.vue                         # UPDATE (mandatory): remove test text + NuxtWelcome; add NuxtPage
└── pages/
    └── index.vue                   # NEW: the entire landing page and its metadata

tests/
├── unit/
│   ├── index-page.spec.ts          # NEW: content, structure, CTA, no-fake-claims checks
│   └── index-page-a11y.spec.ts     # NEW: landmarks, aria, reduced-motion class checks
└── acceptance/
    └── landing-route.spec.ts       # NEW: server-rendered `/` route + metadata acceptance

tailwind.config.ts                  # NEW: brand tokens, content globs, glow keyframes
vitest.config.ts                    # NEW: Nuxt test environment + happy-dom
package.json                        # UPDATE: devDependencies + test scripts
package-lock.json                   # UPDATE: generated by npm install
```

**Structure Decision**: The page lives at `app/pages/index.vue` because Nuxt 4's default `srcDir` is `app/`. It is a single page component with no child components: the composition is small, has no shared state, and extracting `BrandMark` or `GlowBackdrop` would add files without reducing duplication. The inline SVG mark stays in the page. Tests live at the repository-root `tests/` directory, separate from application source. `tailwind.config.ts` sits at the repository root, where `@nuxtjs/tailwindcss` resolves it, and declares explicit content globs for `app/**/*.{vue,js,ts}`.

**Critical wiring**: `app/app.vue` currently renders `<NuxtWelcome />` plus the Tailwind test text and has no `<NuxtPage />`. It MUST be updated before the new page can render at `/`. The target shell is minimal:

```vue
<template>
  <NuxtRouteAnnouncer />
  <NuxtPage />
</template>
```

No wrapper `div`, layout, or global CSS is required. The page itself sets `html`/`body` background classes through `useHead` to prevent white overscroll and theme flashes.

## Design Direction

### Aesthetic

- **Mood**: Dark, premium, calm, confident. Pre-launch, not unfinished.
- **Composition**: A single focal column, generous negative space, a small brand header, one hero block, one footer line. No nav, no cards grid beyond three subtle feature hints, no stock imagery.
- **Background**: Near-black `brand.ink`; two clipped, blurred ambient glows (violet at top center, fuchsia at bottom right) plus a faint radial white sheen. The page root uses `overflow-x-clip` and the decorative layer uses `overflow-hidden`, so the glows never create horizontal scroll and vertical content is not clipped.
- **Accent**: Violet → fuchsia only. The H1 emphasizes the word “shorts” with gradient-clipped text. The CTA uses deeper violet/fuchsia stops so white label text keeps AA contrast.
- **Density**: At most one idea per vertical block; max-width `max-w-6xl` for the shell, `max-w-3xl` for the hero copy.
- **No external assets**: No images, no custom fonts, no icon CDN, no remote video. Brand mark is text + inline SVG.
- **Theme**: Dark-only by design. No toggle, no `dark:` variants, no light palette. `color-scheme: dark` is declared.

### Design Tokens

These tokens are added under `theme.extend` in `tailwind.config.ts` as `colors.brand`. Hex values are fixed. Opacity modifiers are allowed (for example `bg-brand-violet/20`).

| Token | Tailwind class examples | Value | Usage |
|-------|-------------------------|-------|-------|
| `brand.ink` | `bg-brand-ink` | `#09090b` | Page and `html`/`body` background |
| `brand.surface` | `bg-brand-surface` | `#18181b` | Reserved for feature tiles if a solid surface is needed |
| `brand.text` | `text-brand-text` | `#fafafa` | H1 and primary text |
| `brand.muted` | `text-brand-muted` | `#a1a1aa` | Value proposition, helper text, footer |
| `brand.violet` | `from-brand-violet`, `text-brand-violet` | `#a78bfa` | Light gradient stop for H1 text and small accents |
| `brand.fuchsia` | `to-brand-fuchsia`, `bg-brand-fuchsia` | `#e879f9` | Light gradient stop, accent dot, selection |
| `brand.violet-deep` | `from-brand-violet-deep` | `#7c3aed` | CTA gradient start, ambient glow |
| `brand.fuchsia-deep` | `to-brand-fuchsia-deep` | `#c026d3` | CTA gradient end |

**Neutral supporting utilities**: `border-white/10` for hairlines, `bg-white/[0.03]` for feature tiles, `text-zinc-300` for feature labels, `text-white` for CTA label. These are Tailwind defaults, not new tokens.

**Contrast validation** (calculated against `#09090b`):

- `brand.text` `#fafafa`: ≈ 19.1:1 — passes AA/AAA.
- `brand.muted` `#a1a1aa`: ≈ 7.8:1 — passes AA.
- `brand.violet` `#a78bfa`: ≈ 7.3:1 — passes AA for large gradient text.
- `brand.fuchsia` `#e879f9`: ≈ 8.1:1 — passes AA for large gradient text.
- White on `brand.violet-deep` `#7c3aed`: ≈ 5.6:1 — passes AA for CTA label.
- White on `brand.fuchsia-deep` `#c026d3`: ≈ 4.7:1 — passes AA for CTA label.
- `text-zinc-300` `#d4d4d8` on `brand.ink`: ≈ 13.5:1 — passes AA.

The H1 gradient uses the lighter stops (`brand-violet` → `brand-fuchsia`) on near-black. Under forced-colors mode, the gradient text must fall back to `CanvasText` so it never becomes transparent.

### Typography

- **Family**: `font-sans` system stack only. `@nuxt/fonts` remains installed but is not used to load a face; no font request is made.
- **Brand wordmark**: `text-sm font-semibold uppercase tracking-[0.18em] text-brand-text`.
- **Eyebrow badge**: `text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-300`.
- **H1**: `text-4xl font-semibold leading-[1.05] tracking-tight text-balance text-brand-text sm:text-6xl lg:text-7xl`; the word `shorts` uses `bg-gradient-to-r from-brand-violet via-brand-fuchsia to-brand-fuchsia bg-clip-text text-transparent` with a `forced-colors:bg-none forced-colors:text-[CanvasText]` fallback.
- **Value proposition**: `max-w-2xl text-pretty text-base leading-relaxed text-brand-muted sm:text-lg`.
- **Feature hints**: `text-sm leading-snug text-zinc-300`.
- **CTA**: `text-sm font-semibold text-white`.
- **Helper / footer**: `text-xs text-brand-muted` (footer may use `text-[11px]` on mobile; must remain ≥ 4.5:1).

### Spacing & Shape

- **Page shell**: `relative min-h-svh overflow-x-clip bg-brand-ink`.
- **Content column**: `mx-auto w-full max-w-6xl px-6 sm:px-8`.
- **Header**: `flex items-center py-6 sm:py-8`.
- **Main**: `flex flex-1 items-center py-16 sm:py-24 lg:py-28`.
- **Hero rhythm**: badge → H1 `mt-6`; H1 → proposition `mt-6`; proposition → features `mt-10`; features → CTA `mt-10`.
- **Feature hints**: `grid gap-3 sm:grid-cols-3`; each tile `rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3`.
- **CTA block**: `flex flex-col items-start gap-3` (button above helper on mobile).
- **Footer**: `border-t border-white/10 pt-6 pb-8`.
- **Radii**: `rounded-xl` brand tile, `rounded-2xl` feature tiles, `rounded-full` badge and CTA.
- **Shadow**: CTA `shadow-lg shadow-brand-fuchsia/20`; brand tile `shadow-lg shadow-brand-fuchsia/20`.

### Motion

- One custom animation, `brand-glow`, added to `theme.extend.keyframes`/`animation` in `tailwind.config.ts`:
  - `0%, 100%`: `opacity: 0.55`, `scale(1)`
  - `50%`: `opacity: 0.85`, `scale(1.08)`
  - Duration `10s`, easing `ease-in-out`, iteration `infinite`.
- Applied only as `motion-safe:animate-brand-glow` on the violet ambient glow. The fuchsia glow is static.
- No motion on text, CTA, or layout. No transition is required; if a transition is added, pair it with `motion-reduce:transition-none`.
- Under `prefers-reduced-motion: reduce`, the animation class does not apply and the page remains compositionally complete.

### Exact Class Recipes

**Root**: `relative min-h-svh overflow-x-clip bg-brand-ink text-brand-text antialiased selection:bg-brand-fuchsia/30 selection:text-white`

**Decorative layer**: wrapper `pointer-events-none absolute inset-0 overflow-hidden` with `aria-hidden="true"` and `data-testid="decorative-glow"`.
- Violet glow wrapper: `absolute left-1/2 top-0 -translate-x-1/2`; inner: `h-[34rem] w-[34rem] rounded-full bg-brand-violet-deep/20 blur-3xl motion-safe:animate-brand-glow`.
- Fuchsia glow: `absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-brand-fuchsia-deep/10 blur-3xl`.
- Sheen: `absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_45%)]`.

**Content layer**: `relative flex min-h-svh flex-col`.

**Brand mark**: `flex items-center gap-3`; tile `flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet-deep to-brand-fuchsia-deep shadow-lg shadow-brand-fuchsia/20`; wordmark `text-sm font-semibold uppercase tracking-[0.18em] text-brand-text`. Inline SVG is `size-4 text-white` with `aria-hidden="true"` and `focusable="false"`.

**Badge**: `inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-300`; dot `size-1.5 rounded-full bg-gradient-to-r from-brand-violet to-brand-fuchsia` with `aria-hidden="true"`.

**CTA**: `inline-flex items-center justify-center rounded-full bg-gradient-to-r from-brand-violet-deep to-brand-fuchsia-deep px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-fuchsia/20 disabled:cursor-not-allowed disabled:shadow-none` plus focus-ring utilities reserved for any future enabled state: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink`. Do not reduce the disabled CTA opacity: full-strength text keeps the label legible, while native `disabled`, the helper text, and the absence of hover/focus behavior communicate the pre-launch state.

**Feature tile**: `rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-snug text-zinc-300`.

### Page Composition & Semantics

```text
<div data-testid="landing-page">                  root, background, overflow clip
  <div aria-hidden data-testid="decorative-glow"> ambient glows + sheen
  <div>                                            content layer, min-h-svh flex column
    <header>                                       brand mark only, no nav
      <div data-testid="brand-mark"> inline SVG + "AI Shorts"
    <main>                                         flex-1, vertically centered
      <div>                                        max-w-3xl hero column
        <p data-testid="construction-badge"> EN CONSTRUCCIÓN
        <h1 data-testid="hero-heading">            one H1, gradient "shorts"
        <p data-testid="value-proposition">        exact Spanish value prop
        <ul data-testid="feature-list">            three <li> hints
        <div>
          <button data-testid="primary-cta" disabled aria-disabled="true" aria-describedby="cta-helper">
          <p id="cta-helper" data-testid="cta-helper"> Próximamente...
    <footer data-testid="site-footer">             © 2026 line
```

- No `<a>`, `<NuxtLink>`, form, or navigation. There are no focusable elements in the initial page; this is intentional for a pre-launch page with no destinations.
- The disabled CTA uses both native `disabled` and `aria-disabled="true"`. `disabled` prevents activation; `aria-disabled` makes the state explicit in markup and tests.
- `aria-describedby="cta-helper"` points to the helper paragraph, which is visible and not hidden.
- Decorative SVGs use `aria-hidden="true" focusable="false"`. No `aria-label` duplicates visible text.
- Footer and header are outside `main`; the hero is inside `main`.
- The header has no link back to `/`; a dead logo link would violate FR-008.

### Metadata

Implemented in `app/pages/index.vue` with `useHead` / `useSeoMeta`:

- `htmlAttrs`: `lang: 'es'`, `class: 'bg-brand-ink'`.
- `bodyAttrs`: `class: 'bg-brand-ink'`.
- `meta`: `color-scheme: dark`, `theme-color: #09090b`.
- `title`: `AI Shorts — Próximamente`.
- `description`: `Estamos construyendo AI Shorts, la forma más rápida de convertir tus ideas en videos cortos con IA. Muy pronto.`
- Open Graph: `ogTitle`, `ogDescription`, `ogType: 'website'`, `ogLocale: 'es_ES'`.
- Twitter: `twitterCard: 'summary'` (no image asset is supplied).
- Do not add `noindex`; the pre-launch page may be publicly discoverable.
- No canonical URL is specified because the production domain is not defined in this repository.

## Implementation Steps

1. **Create the feature branch** `001-brand-construction-landing` from the current base. Do not change application source during the specification phase.
2. **Add test tooling** to `package.json`: `vitest`, `@nuxt/test-utils`, `@vue/test-utils`, and `happy-dom` as devDependencies; add `"test": "vitest"` and `"test:run": "vitest run"`. Run `npm install` to update `package-lock.json`. Do not add runtime dependencies.
3. **Create `tailwind.config.ts`** with:
   - Explicit `content` globs: `./app/**/*.{vue,js,ts}`.
   - `theme.extend.colors.brand` from the token table.
   - `theme.extend.keyframes.brand-glow` and `theme.extend.animation['brand-glow']`.
   - No Tailwind v4 syntax and no custom font family.
4. **Create `vitest.config.ts`** using `defineVitestConfig` from `@nuxt/test-utils/config`, with `test.environment: 'nuxt'`, `environmentOptions.nuxt.domEnvironment: 'happy-dom'`, a 30 s test timeout, and a 120 s hook timeout for the server acceptance test.
5. **Update `app/app.vue` (mandatory)**: remove the `¡Tailwind funciona! 🎉` block and `<NuxtWelcome />`; keep `<NuxtRouteAnnouncer />`; add `<NuxtPage />`. Do not add a wrapper or global stylesheet.
6. **Write tests first**:
   - `tests/unit/index-page.spec.ts` using `mountSuspended` from `@nuxt/test-utils/runtime`.
   - `tests/unit/index-page-a11y.spec.ts` using the same mount helper.
   - `tests/acceptance/landing-route.spec.ts` with `// @vitest-environment node` and `setup({ server: true })` from `@nuxt/test-utils/e2e`.
   - Run `npm run test:run` and confirm the page-dependent tests fail because `app/pages/index.vue` does not exist yet.
7. **Create `app/pages/index.vue`** with `<script setup lang="ts">`, `useHead`/`useSeoMeta`, and the exact composition, copy, test IDs, and class recipes above. Keep it self-contained; no child components, props, state, data fetching, or event handlers.
8. **Run `npm run test:run`** and fix content, semantics, and selector mismatches until the unit and acceptance tests pass.
9. **Run `npm run build` and `npm run generate`** to verify SSR/static output, metadata, and absence of server-only dependencies.
10. **Manual verification**:
    - Viewports 320, 360, 390, 768, 1024, 1440, 1920 px; check no horizontal scroll or clipping.
    - 200% and 400% browser zoom.
    - `prefers-reduced-motion: reduce` via devtools/OS; confirm the glow animation is not running.
    - Forced-colors mode; confirm H1 remains visible.
    - JavaScript disabled; confirm all copy and the disabled CTA are present.
    - Lighthouse mobile and desktop; record LCP, CLS, INP, accessibility score, and third-party request count.
    - 5-second comprehension check with Spanish speakers if available.
11. **Finalize** `tasks.md` checkboxes and commit only the source/spec/test changes for this feature.

## Test Strategy

### Tooling

| Item | Decision |
|------|----------|
| Runner | Vitest |
| Nuxt integration | `@nuxt/test-utils` |
| Component mounting | `@vue/test-utils` via `mountSuspended` |
| DOM | `happy-dom` for component tests; Node environment for route acceptance |
| Config | `vitest.config.ts` with `defineVitestConfig` |
| Scripts | `npm test` (watch), `npm run test:run` (CI/single run) |
| Dependencies | Dev-only; no runtime additions |

### `tests/unit/index-page.spec.ts` (US1, content contract)

Mount `~/pages/index.vue` with `mountSuspended` and assert:

1. `[data-testid="landing-page"]` exists.
2. `[data-testid="brand-mark"]` contains `AI Shorts`.
3. `[data-testid="construction-badge"]` contains exactly `EN CONSTRUCCIÓN`.
4. Exactly one `<h1>` exists; it contains `Tus ideas, convertidas en shorts.`
5. `[data-testid="value-proposition"]` contains the exact value proposition and the phrase `videos cortos con IA`.
6. `[data-testid="feature-list"]` has exactly 3 `<li>` elements with the exact three feature hints.
7. `[data-testid="primary-cta"]` is a `<button>` with text `Avísame del lanzamiento`, has the `disabled` attribute, `aria-disabled="true"`, and `aria-describedby="cta-helper"`; it has no `href` and no form ancestor.
8. `[data-testid="cta-helper"]` contains `Próximamente.` and has `id="cta-helper"`.
9. `[data-testid="site-footer"]` contains `© 2026 AI Shorts · Hecho para creadores.`
10. No fake-claim markers: no `Iniciar sesión`, `Registrarse`, `Precio`, `€`, `testimonio`, `valoración`, or numeric social-proof pattern such as `+?\\d+\\s*(usuarios|creadores|descargas)`.
11. No `<img>`, no `<a>`, and no external `src`/`href` attributes in the rendered page.
12. The decorative layer has `aria-hidden="true"`.

### `tests/unit/index-page-a11y.spec.ts` (US3, semantics)

1. `header`, `main`, and `footer` landmarks each exist exactly once.
2. Exactly one H1 and logical heading usage (no skipped heading levels introduced by the page).
3. Every SVG in the page has `aria-hidden="true"` and `focusable="false"`.
4. The ambient glow and its wrapper are `aria-hidden="true"` and `pointer-events-none`.
5. The CTA’s `aria-describedby` resolves to an existing element containing `Próximamente`.
6. The CTA has both `disabled` and `aria-disabled="true"`.
7. Every class containing `animate-` on the page is prefixed with `motion-safe:` (validate via class scanning of the mounted root).
8. No element has a positive `tabindex`.
9. No element contains `autoplay`, `<audio>`, or `<video>`.
10. The page root does not render old shell text (`¡Tailwind funciona!`) or a Nuxt welcome block.

### `tests/acceptance/landing-route.spec.ts` (route + metadata)

Use `// @vitest-environment node`, `setup({ server: true })`, and `$fetch('/')`:

1. `/` responds with HTTP 200.
2. HTML contains `<html lang="es"`.
3. HTML contains `<title>AI Shorts — Próximamente</title>`.
4. HTML contains the meta description.
5. HTML contains `EN CONSTRUCCIÓN`, the H1 text, the value proposition, all three feature hints, the CTA label, the helper, and the footer.
6. HTML contains exactly one `<h1`.
7. HTML does **not** contain `¡Tailwind funciona!` or `NuxtWelcome`.
8. HTML does not reference an external font/image/icon host in `link`, `img`, or `script` tags.

The acceptance test runs against a built/server-rendered app, so it validates the mandatory `app.vue` wiring and metadata that component mounting cannot fully prove. It has a longer timeout than the unit tests.

### Manual checks (not automatable in happy-dom)

- Layout and overflow at all target widths; happy-dom has no layout engine.
- Contrast measurements and Lighthouse/axe audit.
- `prefers-reduced-motion` computed animation state.
- Forced-colors rendering of gradient text.
- JS-disabled content visibility.
- 5-second comprehension test.
- Production network panel: zero third-party requests and zero console errors.

No snapshot tests: they would be brittle against harmless class or copy refinements. Assertions target the normative copy deck and semantic behavior instead.

## Accessibility Considerations

- **Language**: `lang="es"` on the document, plus Spanish metadata. The page is not a translation; it is Spanish-only.
- **Landmarks**: `header`, `main`, and `footer` exactly once. The header has no navigation because there are no destinations.
- **Headings**: One H1 containing the hero message. Feature hints are a list, not headings; no decorative heading levels.
- **CTA honesty**: Native `disabled` plus `aria-disabled="true"`, visible helper text, and `aria-describedby`. Screen readers announce a disabled button with its description. No fake success message, no email field, no click handler.
- **Decorative content**: Glows, sheen, brand tile, and inline SVG are hidden from AT. The wordmark remains real text.
- **Contrast**: Token pairings listed above pass AA. Avoid opacity on body text; use `brand.muted` directly. The CTA label uses white on deep violet/fuchsia stops. Do not apply opacity to the disabled CTA; keep the full-strength gradient and label so the text remains above 4.5:1, and communicate the disabled state through native `disabled`, `aria-disabled`, the helper text, and the absence of hover/focus affordances.
- **Focus**: The initial page has no focusable elements by design. If a future link is added, reuse the specified `focus-visible:ring-*` utilities with a visible offset on the dark background. Never use `outline-none` without a replacement.
- **Motion**: `motion-safe:` gates the only animation. No parallax, auto-playing media, marquee, or scroll-jacking. Reduced-motion users receive a static composition.
- **Reflow/zoom**: No fixed heights on text containers, no `overflow: hidden` on text (only on the decorative root wrapper), and no fixed-width CTA. The layout must survive 320 px effective width and 400% zoom.
- **Forced colors**: Gradient-clipped text switches to a system text color so it remains visible in Windows High Contrast. Borders use `currentColor`-friendly utilities or are decorative.
- **No-JS**: Content is server-rendered; the CTA is disabled in HTML, not via hydration. The page does not require hydration to be understood.

## Performance Considerations

- **No external requests**: System font stack, inline SVG, no images, no icon CDN, no analytics. The only presentational asset is the local Tailwind CSS bundled by Nuxt.
- **No font shift**: Because no web font is loaded, there is no FOIT/FOUT or font-driven CLS. `@nuxt/fonts` remains idle.
- **LCP**: The H1 is text and should paint with the local stylesheet; target LCP ≤ 2.0 s on mobile. Avoid hero images and large box shadows on the critical path. The blurred glows are CSS-only and should use `blur-3xl` sparingly; verify mobile paint cost if jank appears.
- **CLS**: Fixed logo tile size, no late-loading assets, no layout-affecting animation. Ambient glow scales are decorative and absolutely positioned, so they do not shift content.
- **INP**: The page has no event handlers, no data fetching, and no client-side state. Hydration cost is the Nuxt baseline only; no new runtime dependency is added.
- **CSS size**: Tailwind purges to the classes used by `app/**/*.{vue,js,ts}`. Keep class lists explicit; avoid dynamic class construction that purge cannot see.
- **Static delivery**: `nuxt generate` produces a static route suitable for a CDN. No server route, secret, or runtime env var is required.
- **Budget guard**: If adding the glow or shadows pushes mobile Lighthouse performance below the target, reduce blur radius/opacity before adding assets or fonts.

## Complexity Tracking

> No Constitution Check violations. No complexity justification is required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | — | — |
