# Feature Specification: Brand Construction Landing Page

**Feature Branch**: `001-brand-construction-landing`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "Crear una página de inicio (index.vue) minimalista y moderna con Tailwind CSS que muestre un aviso de 'En construcción' para nuestra app de Shorts, con un diseño limpio y enfocado a marca."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A credible branded pre-launch page (Priority: P1)

A visitor opens the site root and immediately sees a polished, intentional "En construcción" page for AI Shorts. They understand what the product will do, see that it is not live yet, and are not misled into expecting an account, a video editor, or a working waitlist.

**Why this priority**: This is the entire feature. Without a credible branded page that clearly communicates pre-launch status, there is nothing to ship. The page must earn trust and preserve the product's premium positioning even before the product exists.

**Independent Test**: Start the app, visit `/`, and verify that the page renders the brand, the Spanish construction notice, the value proposition, three feature hints, one disabled CTA with forthcoming helper text, and the footer. Confirm there is no fake metric, sign-in, pricing, or dead navigation. This delivers the complete MVP on its own.

**Acceptance Scenarios**:

1. **Given** the app is running and the visitor requests `/`, **When** the page finishes rendering, **Then** the response is HTTP 200 and contains exactly one `<h1>` with the hero headline, the visible text `EN CONSTRUCCIÓN`, and the brand name `AI Shorts`.
2. **Given** the visitor is reading the hero, **When** they scan the page, **Then** they see the value proposition about creating short videos with AI and the three feature hints `Idea → guion → video`, `Edición automática`, and `Publica en minutos`.
3. **Given** the visitor reaches the CTA, **When** they try to activate `Avísame del lanzamiento`, **Then** nothing happens: the button is natively disabled with `aria-disabled="true"`, has no link, form, or click handler, and is described by helper text that starts with `Próximamente`.
4. **Given** the visitor looks for proof of a live product, **When** they inspect the page, **Then** there are no fake user counts, testimonials, ratings, prices, sign-in links, or "start creating" actions.
5. **Given** the root application shell is rendered, **When** the page is displayed, **Then** the old Nuxt welcome content and the `¡Tailwind funciona! 🎉` test text are absent and the page is rendered through `<NuxtPage />`.

---

### User Story 2 - A clean experience on any screen size (Priority: P2)

A visitor on a small phone, a tablet, a laptop, or a large desktop sees the same deliberate composition: readable type, generous whitespace, no clipped content, and no horizontal scrolling. The page feels designed for their screen rather than merely shrunk.

**Why this priority**: The majority of short-video audiences arrive on mobile. A desktop-only or horizontally overflowing page would undermine the brand and make the pre-launch message hard to read. Responsive quality is part of the MVP experience but does not block the core message.

**Independent Test**: Load `/` at 320 px, 390 px, 768 px, 1024 px, 1440 px, and 1920 px widths. Confirm that all content is visible, the hero wraps without clipping, the feature hints stack on narrow screens and form a row from the `sm` breakpoint, the CTA stays inside the viewport, and no horizontal scrollbar appears.

**Acceptance Scenarios**:

1. **Given** a viewport width of 320 px, **When** the page is rendered, **Then** there is no horizontal scroll, no text is clipped, and the hero, CTA, helper text, and footer remain fully readable.
2. **Given** a tablet or desktop viewport, **When** the page is rendered, **Then** the content is centered within a constrained max-width container, the headline scales up, and line lengths remain comfortable.
3. **Given** a browser zoom level of 200%, **When** the visitor views the page, **Then** content reflows without overlap or loss of information; at 400% zoom the page still reflows to an effective 320 px width without horizontal scrolling.
4. **Given** the visitor uses text-only scaling or a larger default font size, **When** the page reflows, **Then** the CTA and feature hints grow with the text instead of clipping.

---

### User Story 3 - An accessible, respectful experience (Priority: P3)

A visitor using a screen reader, keyboard, reduced-motion preference, high-contrast mode, or JavaScript disabled still receives the complete message. Decorative effects stay decorative, motion is optional, and the disabled CTA is announced honestly rather than pretending to be actionable.

**Why this priority**: Accessibility is a baseline quality attribute and part of the brand promise. It is prioritized after the page and its responsiveness because the static page is already usable without these refinements, but it must ship before launch.

**Independent Test**: Audit `/` with a screen reader, keyboard, browser zoom, `prefers-reduced-motion: reduce`, forced-colors mode, and JavaScript disabled. Confirm semantic landmarks, Spanish language metadata, hidden decorative elements, a single H1, sufficient contrast, no animation under reduced motion, and full content visibility without JavaScript.

**Acceptance Scenarios**:

1. **Given** a screen reader user opens `/`, **When** the page is announced, **Then** the document language is Spanish, the page has `header`, `main`, and `footer` landmarks, there is exactly one H1, the decorative glow and icon are ignored, and the CTA is announced as disabled with its helper description.
2. **Given** a keyboard-only visitor, **When** they press Tab through the page, **Then** focus never lands on a dead link or fake action, no focus trap exists, and any focusable element (if introduced later) has a visible focus indicator.
3. **Given** the operating system requests reduced motion, **When** the page loads, **Then** the ambient glow animation and all non-essential transitions are disabled while the visual composition remains complete and balanced.
4. **Given** normal text and large text on the dark background, **When** contrast is measured, **Then** normal text meets at least 4.5:1, large text meets at least 3:1, and the disabled CTA label remains legible.
5. **Given** JavaScript is disabled, **When** the page is requested, **Then** all copy, the construction notice, the disabled CTA, and the footer are still present in the server-rendered HTML.

---

### Edge Cases

- **JavaScript disabled or blocked**: The page is fully server-rendered/static; all copy and the disabled CTA remain visible. No content is gated behind client-side JavaScript.
- **Very small viewport (320 px)**: The hero uses fluid wrapping, the three feature hints become one column, horizontal padding is reduced but never removed, and no element has a fixed width wider than the viewport.
- **Very large viewport (1920 px and above)**: Content remains constrained by the max-width container; the glow does not cause horizontal overflow because its container is clipped.
- **200% and 400% zoom**: Text reflows instead of scaling into clipped containers; the CTA and helper text remain visible; no two-column layout is forced at narrow effective widths.
- **`prefers-reduced-motion: reduce`**: The animated glow stops completely; no pulsing, floating, parallax, or auto-playing motion remains.
- **Slow font loading or no custom web font**: The page uses the system sans-serif stack. Text is readable immediately and no layout shift occurs from a late font swap.
- **Dark/light preference**: The page is intentionally dark-only. `color-scheme: dark` is declared so form controls, scrollbars, and browser UI match; the design remains legible in both light and dark operating-system themes.
- **Forced-colors / Windows High Contrast**: Gradient-clipped text falls back to a system text color so the H1 is never invisible; decorative gradients and glows are non-essential.
- **Very slow network**: No third-party font, image, icon, or script request is required to render the page. The local Tailwind stylesheet and inline SVG are the only presentational assets.
- **Landscape phone with limited height**: The page may scroll vertically, but the header, hero, CTA, and footer remain intact and none overlap.
- **User has autoplay or animation disabled at the browser level**: Treated the same as reduced motion; the page remains visually complete.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST render this landing page at the site root route `/` from `app/pages/index.vue`.
- **FR-002**: The root application shell MUST render the route through `<NuxtPage />`, keep `<NuxtRouteAnnouncer />`, and remove both the `¡Tailwind funciona! 🎉` test text and `<NuxtWelcome />`. This change is mandatory for the landing page to appear.
- **FR-003**: The page MUST display the visible Spanish notice `EN CONSTRUCCIÓN` in an eyebrow badge above the hero headline.
- **FR-004**: The page MUST establish brand identity through the visible name `AI Shorts` and a small inline SVG play/clapper mark. No external logo asset may be required.
- **FR-005**: The page MUST state a one-line Spanish value proposition about turning ideas into short videos with AI. The normative copy is: `Estamos construyendo la forma más rápida de convertir tus ideas en videos cortos con IA: del concepto al guion, y del guion al video, en minutos.`
- **FR-006**: The page MUST show exactly three short feature hints: `Idea → guion → video`, `Edición automática`, and `Publica en minutos`.
- **FR-007**: The page MUST present exactly one primary CTA labeled `Avísame del lanzamiento`, rendered as a disabled button (`disabled` and `aria-disabled="true"`). It MUST NOT navigate, submit a form, collect an email, or call any API. It MUST be associated with helper text that starts with `Próximamente`.
- **FR-008**: The page MUST NOT contain fake metrics, user counts, testimonials, ratings, pricing, sign-in/registration actions, or links that pretend to be functional.
- **FR-009**: The page MUST use a minimal, modern, premium dark visual design: near-black background, a restrained violet-to-fuchsia brand gradient, generous whitespace, a single focal column, subtle borders, and no stock imagery.
- **FR-010**: The page MUST be responsive from 320 px through large desktop widths. At 320 px there MUST be no horizontal scrolling or clipped content; feature hints MUST use one column on small screens and three columns from the `sm` breakpoint; typography MUST scale fluidly at the `sm` and `lg` breakpoints.
- **FR-011**: The page MUST use semantic HTML: one `<h1>`, logical heading order, `header`, `main`, and `footer` landmarks, a `<ul>` for feature hints, and a `<button>` for the CTA.
- **FR-012**: The document MUST declare Spanish language metadata (`lang="es"`) and Spanish page metadata: title `AI Shorts — Próximamente` and description `Estamos construyendo AI Shorts, la forma más rápida de convertir tus ideas en videos cortos con IA. Muy pronto.`
- **FR-013**: All text MUST meet WCAG 2.1 AA contrast: at least 4.5:1 for normal text and 3:1 for large text and meaningful UI boundaries. The disabled CTA label must remain legible even though disabled controls are exempt from the strict contrast rule.
- **FR-014**: The page MUST include a subtle ambient glow/pulse animation and MUST disable it under `prefers-reduced-motion: reduce` (for example, with `motion-safe:` variants). No essential information may depend on motion.
- **FR-015**: Decorative elements (glow layers, background gradients, icon SVG) MUST be hidden from assistive technology with `aria-hidden="true"` and MUST NOT be focusable.
- **FR-016**: The first paint MUST NOT require any external network asset: no remote fonts, images, icon CDNs, analytics scripts, or third-party requests. The brand mark and icon MUST be inline SVG; typography MUST use the system sans-serif stack.
- **FR-017**: The page MUST be fully understandable and navigable with JavaScript disabled. All message content MUST be present in the server-rendered/static HTML.
- **FR-018**: The feature MUST NOT add runtime dependencies, server routes, API endpoints, secrets, environment variables, cookies, `localStorage`, or analytics calls. It MUST be compatible with `nuxt generate`.
- **FR-019**: The page MUST expose stable `data-testid` hooks for automated tests: `landing-page`, `brand-mark`, `construction-badge`, `hero-heading`, `value-proposition`, `feature-list`, `primary-cta`, `cta-helper`, `site-footer`, and `decorative-glow`.
- **FR-020**: The page MUST keep the core product promise intact: this pre-launch page has no multi-step flow and no navigation maze. It communicates the product and the forthcoming launch in a single screen, with one disabled CTA.

### Normative Copy Deck

The following strings are part of the specification and MUST appear exactly as written (case included) in the rendered page unless noted as metadata.

| Slot | Exact string |
|------|--------------|
| Brand | `AI Shorts` |
| Eyebrow badge | `EN CONSTRUCCIÓN` |
| H1 | `Tus ideas, convertidas en shorts.` |
| Value proposition | `Estamos construyendo la forma más rápida de convertir tus ideas en videos cortos con IA: del concepto al guion, y del guion al video, en minutos.` |
| Feature hint 1 | `Idea → guion → video` |
| Feature hint 2 | `Edición automática` |
| Feature hint 3 | `Publica en minutos` |
| Primary CTA | `Avísame del lanzamiento` |
| CTA helper | `Próximamente. Abriremos la lista de espera el día del lanzamiento.` |
| Footer | `© 2026 AI Shorts · Hecho para creadores.` |
| Meta title | `AI Shorts — Próximamente` |
| Meta description | `Estamos construyendo AI Shorts, la forma más rápida de convertir tus ideas en videos cortos con IA. Muy pronto.` |

The word `shorts` in the H1 MAY be visually emphasized with the brand gradient, but the text content MUST remain exactly `Tus ideas, convertidas en shorts.`

### Design Contract (normative)

There are no open design questions. The following decisions are fixed for this iteration.

| Concern | Decision |
|---------|----------|
| Theme | Dark-only. No light theme and no theme toggle. |
| Page background | `#09090b` (`bg-brand-ink`), applied to the page, `html`, and `body`. |
| Primary text | `#fafafa` (`text-brand-text`). |
| Muted text | `#a1a1aa` (`text-brand-muted`) for the value proposition, helper, and footer. |
| Accent gradient | `#a78bfa` → `#e879f9` (`from-brand-violet via-brand-fuchsia to-brand-fuchsia`) for the emphasized word `shorts`. |
| CTA gradient | `#7c3aed` → `#c026d3` (`from-brand-violet-deep to-brand-fuchsia-deep`) so white CTA text keeps AA contrast. |
| Ambient glow | Violet `#7c3aed` at 20% opacity plus fuchsia `#c026d3` at 10% opacity, heavily blurred and clipped by the page wrapper. |
| Feature tile surface | `border-white/10` with `bg-white/[0.03]`. |
| Typography | System sans-serif stack only (`font-sans`). No custom or external font. |
| Brand wordmark | Uppercase `AI Shorts`, `text-sm font-semibold tracking-[0.18em]`. |
| Eyebrow badge | `text-[11px] font-medium uppercase tracking-[0.2em]`, pill-shaped, with a violet-to-fuchsia dot. |
| H1 | `text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] text-balance`, light gradient emphasis on `shorts`, forced-colors fallback. |
| Value proposition | `max-w-2xl text-base sm:text-lg leading-relaxed text-brand-muted`. |
| Layout | Constrained `max-w-6xl` shell, `px-6 sm:px-8`, hero copy `max-w-3xl`, one centered focal column. |
| Header | Brand mark only. No navigation, menu, or logo link. |
| Feature hints | One column on mobile, three columns from `sm`, `rounded-2xl` tiles. |
| Footer | Hairline top border, exact copyright line, no links. |
| Motion | One ambient glow animation (`10s`, ease-in-out, infinite) applied only with `motion-safe:animate-brand-glow`; no essential content depends on motion. |
| Iconography | One inline SVG play mark, `aria-hidden="true"`, `focusable="false"`. No icon library or remote icon. |
| Responsive floor | Fully usable at 320 px with no horizontal scroll; verified through 1920 px. |
| Overflow | The page root clips horizontal overflow only (`overflow-x-clip`); the decorative layer clips both axes. Vertical content is never clipped. |
| Testing hooks | The `data-testid` values in FR-019 are stable and may remain in production markup. |

Token values are normative. If an implementation utility name differs, the rendered color, spacing, and motion behavior must still match the table above.

### Out of Scope

- Authentication, accounts, sessions, or sign-in.
- Video upload, recording, generation, editing, rendering, or publishing.
- Payments, pricing, subscriptions, or checkout.
- A real waitlist, email collection, CRM integration, or notification backend.
- API routes, server middleware, databases, or persistence.
- Internationalization or a language switcher. The page is Spanish (`es-ES`) only.
- Analytics, tracking, cookies, A/B testing, or marketing pixels.
- Additional pages (privacy, terms, blog, pricing, contact), navigation menus, or footer links.
- Social sharing images, custom Open Graph images, or a full SEO content strategy.
- PWA manifest, service-worker, or offline behavior changes.
- A light theme or theme toggle. The page is intentionally dark-only.
- A custom brand logo file, custom display font, stock photography, or video background.
- CMS integration or editable marketing copy. Copy is fixed in source for this iteration.

### Key Entities

**None.** This feature is a static presentation page. It involves no persisted data, no user records, no forms, and no data relationships. The copy deck is source content, not a runtime entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Performance)**: On a mid-tier mobile emulation (Lighthouse mobile, Moto G Power class), the page achieves LCP ≤ 2.0 s, CLS < 0.1, and INP < 200 ms, with no render-blocking third-party requests.
- **SC-002 (Responsive)**: At widths of 320, 360, 390, 768, 1024, 1440, and 1920 px, there is zero horizontal scroll and zero clipped content. The same holds at 200% zoom on a 1280 px viewport and at 400% zoom on a 1280 px viewport (effective 320 px reflow).
- **SC-003 (Accessibility)**: Lighthouse Accessibility scores 100, no critical or serious axe-core violations are present, normal text contrast is ≥ 4.5:1, large text and meaningful UI contrast is ≥ 3:1, and the document has `lang="es"` plus exactly one H1.
- **SC-004 (Comprehension)**: In a quick 5-second test with at least 5 Spanish-speaking participants, at least 4 of 5 can state both what the product does (AI-assisted short videos) and that it is not yet launched.
- **SC-005 (Correctness)**: The page produces zero console errors and zero failed requests in a production build; loading `/` produces zero requests to third-party origins.
- **SC-006 (Semantics)**: Automated tests confirm one H1, `header`/`main`/`footer` landmarks, decorative elements hidden with `aria-hidden`, a disabled CTA with `aria-disabled="true"` and `aria-describedby` pointing to the existing helper text.
- **SC-007 (Reduced motion)**: With `prefers-reduced-motion: reduce`, no element has a running CSS animation and no non-essential transition is active; the page remains visually complete.
- **SC-008 (No-JS)**: With JavaScript disabled, the construction notice, brand, H1, value proposition, all three feature hints, disabled CTA, helper text, and footer are all present and readable in the delivered HTML.
- **SC-009 (Build and tests)**: `npm run build`, `npm run generate`, and `npm run test:run` all complete successfully with the new page, test setup, and scripts.
- **SC-010 (Honesty)**: A manual content audit finds zero fabricated metrics, testimonials, ratings, prices, sign-in actions, or functional-looking links that do nothing.

## Assumptions

- The product name is **AI Shorts** and the primary language is Spanish (`es-ES`). No final logo or brand guideline has been supplied.
- Because no logo asset exists, the brand is represented by a typographic wordmark plus a small inline SVG play/clapper mark. Adding a designed logo later should not require structural page changes.
- The visual direction is dark-first and premium: near-black background, violet-to-fuchsia accent, restrained type, and generous whitespace. There is no light theme for this iteration.
- The page is pre-launch and intentionally contains a disabled CTA. No waitlist backend exists, so no email is collected and no success state is implied.
- The landing page is the only route in scope and deploys at the domain root (`/`). No `baseURL` subpath is configured.
- The app uses the installed Nuxt 4.5.x, Vue 3.5.x, and `@nuxtjs/tailwindcss` 6.14.x stack. Tailwind is version 3.4.x, so Tailwind v3 configuration and syntax apply.
- Modern evergreen browsers (last two versions of Chrome, Edge, Firefox, and Safari) are the target. Graceful degradation is expected for older browsers, but pixel-identical rendering is not required.
- The page is static/SSR output and does not depend on JavaScript for content. `nuxt generate` is a supported delivery path.
- No consent banner is needed because the page sets no cookies and performs no tracking.
- Tests may use `data-testid` attributes; these attributes are permitted in production markup for this iteration.
- The existing `.specify/memory/constitution.md` is still a template and has not been ratified. This feature follows the project brief principles: pre-launch honesty, a 1-to-3-click core promise, minimal dependencies, and accessible defaults.
