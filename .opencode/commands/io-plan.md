---
description: Perform exploratory research and requirement gathering before writing specs
agent: ionias
---

Act as a technical researcher and strategist. Before any specification is written, analyze the following user idea or goal: $ARGUMENTS

First read:
- `.specify/memory/constitution.md`
- `AGENTS.md`
- the relevant specs under `specs/` (for current provider patterns read `004-composer-real` and `008-tiktok-reel-engine`)
- the current implementation, tests and `.env.example`/`nuxt.config.ts` defaults when costs or providers are involved

Your tasks for this planning phase:
1. Break down the high-level concept into core requirements, constraints and technical bottlenecks (Nuxt 4, Node/Nitro, Vue 3, "1-to-3-clicks" UX, provider cost/latency/security).
2. Propose 2 or 3 alternative approaches or architectural decisions.
3. Identify what can be reused from the existing Fal/DeepSeek integration and Story engine (queue, job token, signed uploads, keyframe-first pipeline, per-shot worker, rate limit, cost guard, error taxonomy) instead of creating a parallel abstraction.
4. Identify config/docs impacts, compatibility/legacy implications, rights/licensing risks and the minimum real-provider budget.
5. Do not run real providers or spend Fal/DeepSeek balance during this phase.
6. Outline a clear recommendation of what the upcoming specification (`/io-spec`) should target. Do not write code or final specs yet; just provide a roadmap and research plan.
