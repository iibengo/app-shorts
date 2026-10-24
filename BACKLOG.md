# Backlog — AI Shorts

Actualizado: 2026-10-24. Ordenado por prioridad real: primero lo que bloquea, después lo que mejora el producto, y al final la deuda que no bloquea nada.

## 🔴 Ahora mismo

| # | Tarea | Coste | Por qué |
|---|---|---|---|
| 0a | **`assembly-failed` con historias largas** — **causa raíz: saldo agotado** | resuelto en código | Medido el 2026-10-24 en una historia de 30 s y 12 planos: el proveedor devuelve **5,875 s** por clip aunque se pidan 2 o 3, el montaje recorta bien y después la **verificación rechaza** por una tolerancia de 0,1 s. Con 4 planos de 5 s no aparecía. Los 12 vídeos eran válidos: se montaron a mano y salieron 30,0 s exactos. Consecuencia: ninguna historia de 30 s o más termina el montaje. **Prioridad máxima: bloquea cualquier historia real.**

**Causa raíz (2026-10-24, tarde):** el ensamblador real monta 30,0 s con los clips reales. El fallo era **la subida final**: el proveedor responde 403 con `User is locked. Reason: Exhausted balance` porque la cuenta no tiene saldo. Nuestro código traducía ese 403 a **"servicio no disponible"**, así que parecía un fallo del montaje. Corregido: un 403 que menciona el saldo se reconoce como `provider-balance-exhausted`, no como caída del servicio. Pendiente: recargar saldo y comprobar una historia completa de principio a fin. descartados duraciones (6×3 + 6×2 = 30 exacto), tamaño (9 MB de 1536), timeout (falla a los 30 s con 420 configurados), redirecciones y fallo de FFmpeg (la misma secuencia a mano produce 30,0 s). La tolerancia acumulada se arregló y **no era la causa**. Siguiente paso: reproducir el ensamblador con los clips reales en un script fuera de la suite y leer el error exacto. El código ya adjunta `detail` al fallo. |
| 0 | ~~**El vídeo inventa texto sobre pantallas**~~ **HECHO (013)** | — | Resuelto con una frase en positivo en `VIDEO_STAGE_BLOCK`. Medido: sin la frase había titulares y rótulos; con la frase, cero texto y la pantalla queda idéntica. |
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
| 9d | **Series y personajes reutilizables (spec 013)** | 6-10 h | Tabla `Series` + `Character` global: el personaje (Ionias, Pixel) se genera **una vez** y todas las historias de la serie lo reutilizan. Hoy cada historia vuelve a pagar 0,04 por secundario. Es la base de "crear nuevas historias dentro de una serie". Decisión pendiente: personaje **inmutable** en 013 (crear otra serie si cambia el look), con versionado en una spec posterior. Inspirado en ArcReel, que modela personajes/escenarios/props como activos referenciados por ID. |
| 9e | **Versiones de assets** (regenerar y comparar sin sobrescribir) | 15-25 h | Lo mejor de ArcReel: cada personaje y cada keyframe guarda historial y se puede volver a una versión anterior. Potente pero no resuelve ningún problema actual; va detrás de 9d y solo con usuarios reales. **No copiar su código**: ArcReel es AGPL-3.0. |
| 9f | ~~**Retrato de secundario con fondo neutro**~~ **HECHO (013)** | — | El prompt pide ya "plain neutral studio backdrop, evenly lit". |
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
| 17 | ~~Director: evitar tres planos seguidos con el mismo encuadre~~ **HECHO (013)** | — | El prompt del director lo prohíbe y `detectRepeatedFraming` lo registra. |

## Bugs encontrados y cerrados (2026-10-24)

| Bug | Causa | Arreglo |
|---|---|---|
| Texto inventado en los keyframes | `no text` en un modelo sin canal negativo activa el concepto | Prompts en positivo (013) |
| Prompt de vídeo repetía la escena entera | I2V solo quiere movimiento | `composeVideoMotionBlock` (013) |
| Plano atascado en `KEYFRAME_QUEUED` | `attempts >= 2` hacía `return` sin cerrar el plano | Falla con `provider-invalid-output` |
| Plano rechazado por texto durante la fase de vídeos | Nadie volvía a la fase de keyframes | `rebuildPendingKeyframes` |
| Detector de texto marcaba escenas limpias | Ningún muestreo separa neón de texto | **Retirado** (enmienda 013) |
| `updateCharacterRefs` sin guarda | Un worker lento podía repetir un cobro | Guarda de estado, versión y lease |
| Check de visión sin presupuestar | Una llamada pagada por keyframe | Apagado por defecto |

## Sondas reales pagadas (evidencia)

| Sonda | Coste | Resultado |
|---|---|---|
| Nano Banana, personaje secundario "Pixel" con avatar como estilo | 0,0398 | Gato coherente con el estilo papercraft. Válido. |
| Kling v3 Pro + 2 elementos, 5 s | 0,56 | Identidad del gato estable, estilo mantenido, 1088×1904 mudo, ~7 min. No adoptado por coste. |
| Kling v3 Pro, envío inválido (solo `frontal_image_url`) | 0,00 | Rechazado en validación; no se cobra. Contrato documentado. |

## Orden recomendado

1 → 2 → 3 → ver el vídeo → 5 (voz) → 4 (voxel) → 6 (gráficos) → 7 → deuda cuando haya hueco.

La deuda no se toca hasta que haya usuarios reales: hoy no mejora nada visible.
