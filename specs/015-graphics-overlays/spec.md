# Feature Specification: Gráficos y overlays sobre el vídeo

**Feature Branch**: `015-graphics-overlays`

**Created**: 2026-10-24

**Status**: Approved (2026-10-24). Aprobada por el humano. Decisiones cerradas: **un título al principio y otro al final, nunca uno por escena**; **la terminal es opcional y solo aparece si el guion pide una pantalla con contenido**.

**Input**: User description: "El texto legible debe vivir en una capa de gráficos, no en el modelo. El modelo inventa titulares porque le pedimos que dibuje pantallas."

## Por qué esta spec existe

La capa de gráficos no es un adorno. **Es la solución al bug que 013 solo pudo mitigar.**

| Intento | Resultado |
|---|---|
| Prohibir texto en el prompt | Empeoró: Nano Banana no tiene canal negativo y nombrar el concepto lo activa |
| Pantallas ilegibles | Mejor, pero el modelo **sigue escribiendo** cuando el encuadre enfoca el monitor |

La causa es de fondo: **un modelo de vídeo no sabe dibujar una pantalla con contenido**. No distingue "abstracto" de "un titular".

| Decisión | Contrato |
|---|---|
| El texto legible **nunca** lo dibuja el modelo | Lo compone FFmpeg en local, de forma determinista |
| Lo que pide el usuario es lo que sale | Sin modelo entre la intención y el píxel |
| Coste | **0 de proveedor**: `drawtext`, `overlay` y `ass` son locales y ya están instalados |

## Alcance del MVP

Cuatro piezas, todas locales y deterministas:

1. **Rótulo de titular** por escena, con tipografía, tamaño, posición y zona segura vertical.
2. **Terminal falsa** con contenido real del guion: líneas de código o texto de la narración, sin inventar nada.
3. **Banda inferior** con nombre de canal o etiqueta de marca.
4. **Orden de composición** sobre el MP4 ya montado, sin volver a codificar el vídeo de cada plano.

**Fuera del MVP:** animación de entrada/salida, transiciones gráficas, iconos, gráficos de datos, editor visual.

## Requisitos funcionales

| ID | Requisito |
|---|---|
| FR-001 | MUST existir `server/story/graphics-plan.ts`: función pura que convierte un `StoryPlan` en un `GraphicsPlan` determinista. Mismas entradas, mismo plan, sin reloj ni azar |
| FR-002 | MUST existir `server/story/graphics-renderer.ts`: construye los argumentos de FFmpeg. No ejecuta nada por sí mismo: recibe un `FfmpegRunner` |
| FR-003 | El render MUST aplicarse **después del montaje**, sobre el MP4 final: un solo pase de codificación, no uno por plano |
| FR-004 | El texto de cada rótulo MUST venir del guion (`title`, `sceneRole` o `narration`). El compositor MUST NOT inventar texto |
| FR-005 | La terminal falsa MUST usar como contenido el `visualPrompt` o la `narration` de la escena, nunca texto aleatorio |
| FR-006 | Todas las posiciones MUST respetar la zona segura vertical: 12 % superior e inferior libres, 8 % en los laterales |
| FR-007 | La tipografía MUST venir del sistema (`fontconfig`), con una lista de respaldo declarada. Nunca una ruta de usuario |
| FR-008 | Un fallo de FFmpeg en los gráficos MUST NOT perder el vídeo: se entrega el MP4 sin gráficos, se registra `story.graphics.failed` y la historia sigue |
| FR-009 | Si no hay `ffmpeg` con `drawtext`, los gráficos se desactivan: `story.graphics.unavailable`, y el vídeo se entrega igual |
| FR-010 | El coste de gráficos MUST ser 0 en el guardián: es renderizado local |

## Contrato de datos

### `app/models/story.ts`

```ts
export type StoryGraphicKind = 'title' | 'terminal' | 'badge'

export interface StoryGraphic {
  readonly kind: StoryGraphicKind
  /** Texto exacto que se dibuja. Viene del guion, nunca se inventa. */
  readonly text: readonly string[]
  /** Segundos, relativo al inicio del vídeo final. */
  readonly startSeconds: number
  readonly endSeconds: number
}

export interface StoryGraphicsPlan {
  readonly width: number
  readonly height: number
  readonly graphics: readonly StoryGraphic[]
}
```

`Story.graphics` se publica en el DTO como `readonly StoryGraphic[]` — solo lo que se dibujó, nunca estilos internos.

### Persistencia

```prisma
model Story {
  graphicsJson Json?
}
```

Migración `20261024190000_story_graphics`. `null` se lee como sin gráficos.

## Reglas de composición

| Pieza | Posición | Tipografía | Duración |
|---|---|---|---|
| `title` | Tercio superior, centrado | 64 px, negrita | 2,5 s desde el inicio, y otro 2,5 s al final |
| `terminal` | Centro-izquierda, sobre el 70 % del ancho | 34 px, monoespaciada | Toda la escena |
| `badge` | Inferior centrado, sobre la zona segura | 30 px | 3 s |

| Regla | Contrato |
|---|---|
| Legibilidad | Todo texto MUST llevar caja o sombra de contraste; nunca texto sobre fondo dudoso sin protección |
| Zona segura | Ningún texto a menos del 12 % del borde superior o inferior |
| Máximo | **Dos `title` por historia** (inicio y cierre), un `terminal` opcional por escena con pantalla, un `badge` por historia |
| Idioma | El texto va en el idioma del guion (español). No se traduce |
| Sin emojis | `drawtext` no los dibuja de forma fiable |

## Máquina de estados

| Regla | Contrato |
|---|---|
| Momento | El render de gráficos MUST ocurrir tras `VIDEOS_READY` y antes de `READY` |
| Fallo | Cualquier error deja el MP4 sin gráficos y la historia en `READY`. Nunca bloquea |
| Idempotencia | Re-renderizar la misma historia MUST producir el mismo archivo |
| Lifecycle | El MP4 con gráficos sustituye al montado; ambos comparten expiración |

## Seguridad

| Regla | Contrato |
|---|---|
| Sin inyección | Todo texto MUST escapar para `drawtext`: `:`, `'`, `\`, `%` y saltos de línea |
| Sin rutas del cliente | La tipografía se resuelve en servidor contra una lista fija |
| Sin secretos | Los argumentos de FFmpeg no contienen credenciales ni URLs firmadas |
| Límites | Texto máximo 90 caracteres por línea y 4 líneas por gráfico |

## UI

| Superficie | Cambio | Testid |
|---|---|---|
| Resultado | Se muestra el vídeo con gráficos, sin distinguirlo del normal | `story-result-video` |
| Resultado | Si los gráficos fallaron, nota discreta no bloqueante | `story-graphics-note` |

**Copy:** `Los gráficos no se pudieron añadir; el vídeo está completo.` Nunca un error rojo: el vídeo es válido.

## Test plan

| Archivo | Casos |
|---|---|
| `graphics-plan.spec.ts` | Determinismo; un título por escena; texto tomado del guion; zona segura; límites de longitud |
| `graphics-renderer.spec.ts` | Comandos correctos por tipo; escapado de `: ' \ %`; sin `drawtext` → desactivado; fuente de respaldo |
| `story-reel-worker.spec.ts` | Gráficos tras el montaje; fallo no bloquea; idempotencia |
| `story-assembly.spec.ts` | El MP4 final conserva la duración y el códec |

## Fuera de alcance

- Animación de gráficos y transiciones.
- Editor visual por el usuario.
- Gráficos de datos o iconos.
- Subtítulos: pertenecen a 014 (audio), porque dependen de los tiempos del TTS.
- Sustituir la pantalla inventada por contenido real compuesto en perspectiva: requiere tracking y va en una spec futura.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `drawtext` no está en todos los FFmpeg | Se detecta al arrancar y se desactiva con evento; el vídeo se entrega igual |
| Una fuente concreta falta en producción | Lista de respaldo; si no hay ninguna, se desactiva |
| El texto tapa al personaje | Posiciones fijas en zona segura; se valida con una historia real |
| Doble codificación degrada la calidad | Un solo pase sobre el MP4 final, con `-crf 18` |

## Fases

1. `graphics-plan.ts` puro + tests.
2. `graphics-renderer.ts` con argumentos y escapado + tests.
3. Integración tras el montaje, con la degradación declarada.
4. Persistencia y DTO.
5. UI y copy.
6. Gate completo y una historia real: comparar con y sin gráficos.
