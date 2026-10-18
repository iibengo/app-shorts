# AI Shorts Wrapper Constitution

## Core Principles

### I. Simplicity First (1-to-3-Clicks UX)
Every feature, screen, or workflow must prioritize absolute simplicity. The user journey to generate or manage a short video wrapper must not exceed 1 to 3 clicks. Avoid unnecessary configuration bloat.

### II. Spec-Driven Development (NON-NEGOTIABLE)
No implementation code can be written without a formal technical specification. The workflow strictly enforces: Phase 1 (Architect writes spec & human review) → Phase 2 (Developer implements code & human review) → Phase 3 (Tester validates).

### III. Server-Side Security for AI & Secrets
All third-party AI integrations, API keys, and sensitive backend operations must execute exclusively within Nuxt Server Routes (`server/api/`). Client-side code must never handle or expose credentials.

### IV. Modular Component Architecture & Reusability
Code must be fully modular and reusable from day one:
- **UI Components:** Generic atomic components live in `components/ui/`.
- **Domain Components:** Feature-specific components live in domain folders (e.g., `components/shorts/`).
- **Shared Logic:** Business logic must be extracted into `composables/`.
- **Types:** All data models must use strict TypeScript interfaces placed in `types/`.
- **Utilities:** Pure helper functions belong in `utils/`.
- **Global Models/Interfaces:** Shared data structures, domain models, or cross-component types must reside exclusively in the global `models/` (or `types/`) directory.
- **Component-Specific Types:** Types, interfaces, or local state definitions exclusive to a single component must be kept locally within that component's file or folder.
- **Component Structure:** Generic UI in `components/ui/`, feature components in domain folders (e.g., `components/creator/`).

### V. Test-First & Quality Gates
Changes must be verified. The Tester agent must validate implementations with automated unit or component tests for every new file created (excluding plain interfaces), fixing any regressions.

## Additional Constraints & Tech Stack
- **Framework**: Nuxt 4 framework utilizing auto-imports and standard directory conventions.
- **Styling**: Tailwind CSS 3.4.x design system via `@nuxtjs/tailwindcss` 6.14. Tailwind v4 syntax must not be used until a separate migration spec is approved.
- **Orchestration**: Managed via OpenCode v2 using primary (Orchestrator) and sub-agents (Architect, Developer, Tester).

## Governance
This Constitution supersedes all ad-hoc development practices. All agent prompts and workflows must verify compliance with these core principles.


**Version**: 1.0.1 | **Ratified**: 2026-10-18 | **Last Amended**: 2026-10-18