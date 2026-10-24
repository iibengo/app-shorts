# Backlog — AI Shorts

Actualizado: 2026-10-24. Ordenado por prioridad real: primero lo que bloquea, después lo que mejora el producto, y al final la deuda que no bloquea nada.

## 🔴 Ahora mismo

| # | Tarea | Coste | Por qué |
|---|---|---|---|
| 1 | **Terminar y ver la historia con hoja de personaje** | ~1,1 USD | Primera historia con identidad real. Sin verla, el resto es teoría. |
| 3 | **Cerrar la spec 011** | 0 | Estado, `AGENTS.md`, contadores y notas de cierre. |

### Descartado: cupo de concurrencia y cancelación

Sospecha revisada el 2026-10-24 y **descartada**. `PrismaReelStoryRepository.cancel` ya marca los planos activos como `CANCELLED` dentro de la misma transacción, así que la cancelación por API libera el cupo.

Los 6 jobs huérfanos que bloquearon una prueba se debieron a cancelaciones hechas con `UPDATE` directo en SQL durante el trabajo, que no pasan por la transacción. No es un defecto del producto.

## 🟡 Producto

| # | Tarea | Coste | Por qué |
|---|---|---|---|
| 4 | **Estilo `voxel`** | 10 min | Una entrada en el registro de estilos. Es el look del vídeo 4 y el más fácil de mantener consistente. |
| 5 | **Voz, música y subtítulos** (spec 013) | 15-25 h | Sin audio ni subtítulos el vídeo no se parece a las referencias. Bloquea la publicación real. |
| 6 | **Gráficos y overlays** (spec 014) | 10-15 h | Terminal, UI y cifras reales compuestas sobre el vídeo. Sin esto no hay vídeo "de programación". |
| 7 | **Notas del director** | 2-4 h | Campo opcional para dar contexto técnico sin dictar los planos. |
| 8 | **Estilo `explainer`** | 5-8 h | Estilo del vídeo 3; depende de la 013. |
| 9 | **Rúbrica de calidad + juez** | 4-6 h | Medir si las historias son buenas, no solo válidas. |
| 9a | **Pantalla de personajes** | 4-6 h | Ver cada personaje con su imagen generada, regenerarla y asignarle una foto. Mismo patrón que la regeneración por escena, que ya existe. Aparcado al aprobar 012. |
| 9b | **Varias fotos del usuario, una por personaje** | 6-10 h | Subir varias fotos y, si la premisa tiene varios personajes, detectar con DeepSeek Vision qué foto es de quién, asignarla y mencionarla en la historia. Cambia el contrato del formulario (`STORY_MAX_REFERENCES = 1` hoy). Aparcado al aprobar 012. |
| 9c | **Kling v3 Pro con `elements` en el vídeo** | 8-12 h | La sonda B del 2026-10-24 funcionó: un elemento por personaje (`frontal_image_url` + `reference_image_urls`, ambos obligatorios), `@ElementN` en el prompt, 1088×1904 mudo. Descartado por coste: 0,112 USD/s (0,56 por plano) y ~7 min por plano, frente a 0,35 y segundos del motor actual. Reabrir cuando el coste importe menos que la calidad, o solo en un preset premium. |

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
| 17 | Director: evitar tres planos seguidos con el mismo encuadre en la misma localización | 3-4 h | Detectado el 2026-10-24: la historia `802575b0` puso tres planos "Ionias sentado en el escritorio" seguidos. El lugar no es el problema; la repetición visual sí. |

## Sondas reales pagadas (evidencia)

| Sonda | Coste | Resultado |
|---|---|---|
| Nano Banana, personaje secundario "Pixel" con avatar como estilo | 0,0398 | Gato coherente con el estilo papercraft. Válido. |
| Kling v3 Pro + 2 elementos, 5 s | 0,56 | Identidad del gato estable, estilo mantenido, 1088×1904 mudo, ~7 min. No adoptado por coste. |
| Kling v3 Pro, envío inválido (solo `frontal_image_url`) | 0,00 | Rechazado en validación; no se cobra. Contrato documentado. |

## Orden recomendado

1 → 2 → 3 → ver el vídeo → 5 (voz) → 4 (voxel) → 6 (gráficos) → 7 → deuda cuando haya hueco.

La deuda no se toca hasta que haya usuarios reales: hoy no mejora nada visible.
