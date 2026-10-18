# AI Shorts Wrapper Constitution

## Core Principles

### I. Simplicity First (1-to-3-Clicks UX)
Every feature, screen, or workflow must prioritize absolute simplicity. The user journey to generate or manage a short video wrapper must not exceed 1 to 3 clicks. Avoid unnecessary configuration bloat.

### II. Spec-Driven Development (NON-NEGOTIABLE)
No implementation code can be written without a formal technical specification. The workflow strictly enforces: Phase 1 (Architect writes spec) → Phase 2 (Developer implements code) → Phase 3 (Tester validates).

### III. Server-Side Security for AI & Secrets
All third-party AI integrations, API keys, and sensitive backend operations must execute exclusively within Nuxt Server Routes (`server/api/`). Client-side code must never handle or expose credentials.

### IV. Modular Component Architecture
Frontend code must leverage Vue 3 Composition API and modular, reusable Single File Components styled with Tailwind CSS v4. Reusability and type safety (TypeScript) are mandatory.

### V. Test-First & Quality Gates
Changes must be verified. The Tester agent must validate implementations with automated unit or component tests, ensuring no regressions in core routes.

## Additional Constraints & Tech Stack
- **Framework**: Nuxt 4 framework utilizing auto-imports and standard directory conventions.
- **Styling**: Tailwind CSS v4 design system.
- **Orchestration**: Managed via OpenCode v2 using primary (Orchestrator) and sub-agents (Architect, Developer, Tester).

## Development Workflow & Commands
- **/io-plan**: Exploratory research and requirement breakdown before specification.
- **/io-spec**: Formal generation of technical specifications followed by implementation and testing.
- **/io-modify**: Refactoring or updating existing specifications.

## Governance
This Constitution supersedes all ad-hoc development practices. All agent prompts and workflows must verify compliance with these core principles.

**Version**: 1.0.0 | **Ratified**: 2026-10-18 | **Last Amended**: 2026-10-18