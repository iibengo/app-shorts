---
description: Perform exploratory research and requirement gathering before writing specs
agent: ionias
---

Act as a technical researcher and strategist. Before any specification is written, analyze the following user idea or goal: $ARGUMENTS

First read:
- `.specify/memory/constitution.md`
- `AGENTS.md`
- the relevant specs under `specs/` (especially `004-composer-real` for provider patterns)

Your tasks for this planning phase:
1. Break down the high-level concept into core requirements, constraints and technical bottlenecks (Nuxt 4, Node/Nitro, Vue 3, "1-to-3-clicks" UX, provider cost/latency/security).
2. Propose 2 or 3 alternative approaches or architectural decisions.
3. Identify what can be reused from the existing Fal integration (queue, job token, signed uploads, keyframe-first pipeline, rate limit, error taxonomy) instead of creating a parallel abstraction.
4. Outline a clear recommendation of what the upcoming specification (`/io-spec`) should target. Do not write code or final specs yet; just provide a roadmap and research plan.
