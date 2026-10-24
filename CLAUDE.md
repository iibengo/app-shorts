# CLAUDE.md — AI Shorts

Este archivo es estable: solo reglas de trabajo y punteros. El estado del
proyecto (specs, cifras de tests, gates abiertos, siguiente spec) vive en
`AGENTS.md` y se actualiza allí al cerrar cada spec, nunca aquí.

La constitución es la autoridad máxima y `AGENTS.md` el contexto canónico. Se
importan para que estén siempre en contexto:

@.specify/memory/constitution.md
@AGENTS.md

## Cómo trabajar en este repo desde Claude Code

- La sesión principal hace de orquestador, el mismo papel que `ionias` en
  OpenCode, con las mismas fases y checkpoints:
  investigación (`/io-plan`) → spec → **Checkpoint 1** → implementación →
  revisión read-only → **Checkpoint 2** → tests y gate → cierre (`/io-close`).
- Antes de tocar una feature, leer su spec en `specs/NNN-feature-name/spec.md`.
- Gate final: `npm run test:run` + `npm run build`. Tests con stubs; nunca
  proveedores reales sin autorización explícita.
- Nunca commit sin aprobación explícita del humano; nunca `git push`.
- Nunca leer, mostrar ni copiar `.env`. Las variables se documentan en
  `.env.example`.

## Convivencia con OpenCode

- OpenCode (`.opencode/`, agente `ionias`) sigue siendo un flujo válido y es
  la fuente de comandos, agentes y skills. No se duplican en `.claude/`.
- El estado compartido está en el repo: specs, `AGENTS.md`, `BACKLOG.md`,
  `CAMBIOS-SIN-CONFIRMAR.md` y git. Cada fase deja su resultado escrito antes
  de cambiar de herramienta.
- No trabajar con OpenCode y Claude Code a la vez sobre el mismo árbol; si hace
  falta en paralelo, usar otra rama o worktree.

## Project skills

Viven en `.opencode/skills/<skill-id>/SKILL.md`. Cargar el del dominio que se
toque (la tabla de cuándo está en `AGENTS.md`):
`sdd-spec-guardrails`, `fal-deepseek-pipeline`, `prisma-leases`,
`ffmpeg-media`, `story-test-harness`.

Los comandos `/io-*` están en `.opencode/commands/` y los roles de los
subagentes en `.opencode/agents/`; desde aquí se leen como instrucciones del
paso correspondiente. Los skills de `.cursor/skills` son exclusivos de Cursor.
