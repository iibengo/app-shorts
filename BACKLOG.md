# Backlog — AI Shorts

Actualizado: 2026-10-24. Ordenado por prioridad real: primero lo que bloquea, después lo que mejora el producto, y al final la deuda que no bloquea nada.

## 🔴 Ahora mismo

| # | Tarea | Coste | Por qué |
|---|---|---|---|
| 1 | **Terminar y ver la historia con hoja de personaje** | ~1,1 USD | Primera historia con identidad real. Sin verla, el resto es teoría. |
| 2 | **Cancelar una historia debe liberar el cupo de concurrencia** | 0 | Bug real: los planos de historias canceladas siguen contando como jobs activos y bloquean historias nuevas (`keyframeConcurrency`). |
| 3 | **Cerrar la spec 011** | 0 | Estado, `AGENTS.md`, contadores y notas de cierre. |

### Detalle del bug #2

Reproducido el 2026-10-24: tras cancelar varias historias, `countActiveProviderJobs` devolvía 6 (el máximo), así que el reconciliador no encolaba ningún keyframe nuevo. Los `Shot` de historias `CANCELLED` seguían en `KEYFRAME_RUNNING`.

Arreglo propuesto: al cancelar, marcar los planos activos como `CANCELLED` en la misma transacción; y que `countActiveProviderJobs` excluya historias no activas.

## 🟡 Producto

| # | Tarea | Coste | Por qué |
|---|---|---|---|
| 4 | **Estilo `voxel`** | 10 min | Una entrada en el registro de estilos. Es el look del vídeo 4 y el más fácil de mantener consistente. |
| 5 | **Voz, música y subtítulos** (spec 012) | 15-25 h | Sin audio ni subtítulos el vídeo no se parece a las referencias. Bloquea la publicación real. |
| 6 | **Gráficos y overlays** (spec 013) | 10-15 h | Terminal, UI y cifras reales compuestas sobre el vídeo. Sin esto no hay vídeo "de programación". |
| 7 | **Notas del director** | 2-4 h | Campo opcional para dar contexto técnico sin dictar los planos. |
| 8 | **Estilo `explainer`** | 5-8 h | Estilo del vídeo 3; depende de la 013. |
| 9 | **Rúbrica de calidad + juez** | 4-6 h | Medir si las historias son buenas, no solo válidas. |

## 🟢 Deuda técnica (no bloquea)

| # | Tarea | Coste |
|---|---|---|
| 10 | `typecheck`: 268 errores | 8-15 h |
| 11 | QA de navegador y accesibilidad | 3-5 h |
| 12 | Retirar el motor `legacy` 005-007 | 4-6 h |
| 13 | CI (no existe) | 3-5 h |
| 14 | Trocear la suite (rápidos / lentos) | 2 h |
| 15 | Transaccionalidad de escrituras batch historia→shots | 2-3 h |
| 16 | Reforzar el fallback de `qc-frames` con `filePath === null` | 2 h |

## Orden recomendado

1 → 2 → 3 → ver el vídeo → 5 (voz) → 4 (voxel) → 6 (gráficos) → 7 → deuda cuando haya hueco.

La deuda no se toca hasta que haya usuarios reales: hoy no mejora nada visible.
