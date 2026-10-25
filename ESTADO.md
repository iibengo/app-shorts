# ESTADO — parte de situación

> **Léelo antes que el backlog.** Este archivo dice **dónde está el trabajo a medias**, que el backlog no puede saber. Se actualiza en cada sesión.

**Última actualización:** 2026-10-26

---

## Lo que está probado con dinero real

| Afirmación | Cómo se comprobó | Fecha |
|---|---|---|
| La cadena completa genera un vídeo solo | 12 keyframes, 12 vídeos, montaje, gráficos, entrega. ~2,15 USD | 2026-10-25 |
| El MP4 se entrega y se abre | `GET /api/story/:id/download`, 7.140.803 bytes | 2026-10-25 |
| Una voz real se sintetiza y se mide | 10 palabras → 3,657 s; 28 → 9,744 s. ~0,003 USD | 2026-10-25 |
| El audio entra en un MP4 con subtítulos | FFmpeg real, salida con pista de audio | 2026-10-25 |
| `concat -c copy` no pierde fotogramas con clips normalizados | 135 de 135, con clips del reel manual | 2026-10-26 |

## Lo que NO se ha ejecutado nunca

**Ninguna historia completa con voz.** La 014 tiene todas las piezas, pero **nadie ha generado una historia de principio a fin con `STORY_AUDIO_ENABLED=true`**.

Es lo primero que hay que hacer cuando haya presupuesto. Cuesta **~1,30 USD** (30 s: 3 keyframes + 3 clips + voz).

**Ninguna spec está `Validated`.**

---

## La 014 está a medio cablear

**Dónde está cada pieza:**

| Pieza | Archivo | Estado |
|---|---|---|
| Plan de tiempo desde el motor | `server/story/time-plan.ts` | ✅ conectado en `reel-service.create` |
| Subtítulos desde la voz | `captions-plan.ts`, `captions-render.ts` | ✅ **no conectado al montaje** |
| Adaptador TTS Fal | `tts-fal-adapter.ts` | ✅ probado con stub, endpoint real confirmado |
| Medición de audio | `audio-probe.ts` | ✅ |
| Servicio de voz | `story-audio-service.ts` | ✅ **no conectado al flujo real** |
| Muxeo en el MP4 | `audio-mux.ts` | ✅ **no conectado al ensamblador** |
| Migración `story_audio` | `prisma/migrations/20261026120000_story_audio` | ✅ **aplicada en local** |

**Lo que falta, en una frase:** que `reel-service` llame a `StoryAudioService` después del guion y que `shot-assembly-service` use `muxAudioPlan` en vez de su salida actual.

## Interruptor

`STORY_AUDIO_ENABLED=true` en `.env` lo activa. **Apagado, el pipeline es el de antes de la 014.** Hoy está **encendido en el `.env` local** para pruebas.

---

## Datos medidos que no están en las specs

| Dato | Valor | Dónde |
|---|---|---|
| Velocidad del habla | **2,8 palabras/s** (ElevenLabs Turbo v2.5, voz Sarah, español) | `speech-rate.ts` |
| Endpoint de voz correcto | `fal-ai/elevenlabs/tts/turbo-v2.5` (**punto**, no guion) | `tts-capabilities.ts` |
| **15 s no se puede construir** con clips de 6 y 10 | `planShotDurations` devuelve `null`; el sistema lo rechaza con `audio-too-long` | `time-plan.ts` |
| 30 s = 3 clips de 10 s (no 12 de 6) | Con MiniMax | `time-plan.ts` |
| 45 s **no tiene combinación** con 6 y 10 | Requiere otro motor o más duraciones | `time-plan.ts` |

**Consecuencia de producto pendiente:** el formulario ofrece 15 s y el motor no puede hacerlo. **Decisión abierta.**

---

## Errores que costaron horas (para no repetirlos)

| Error | Lección |
|---|---|
| `isDatabaseError` marcaba cualquier `Prisma*` como caída | Un error genérico oculta la causa real |
| `internal-error` no registraba nada | Sin traza, se depura a ciegas |
| Un `import` no entró en el build y solo falló en ejecución | **Los tests de función no prueban la tubería** |
| El `stake` validado y descartado en tres puntos | Lo mismo: test de función, no de camino |
| "Typecheck a cero" medido con `tsc`, no con `nuxi typecheck` | Medir con el comando del gate |

**Regla que sale de aquí:** cuando algo se añade a un contrato, comprobar que **llega al prompt final**, no solo que el validador lo acepta.

---

## Presupuesto

| Concepto | USD |
|---|---|
| Saldo al empezar la sesión del 25 | 5,00 |
| Gastado (historia completa) | −2,15 |
| Recargado | +2,15 aprox. |
| Gastado (2 pruebas de voz) | −0,003 |
| **Disponible** | **~4,99** |

**Regla vigente: no lanzar generaciones sin autorización explícita.**

---

## Qué leer, en orden

1. Este archivo.
2. `AGENTS.md` — contexto canónico.
3. `BACKLOG.md` — qué falta, por prioridad.
4. `docs/analisis-reel-vs-app.md` — por qué el reel manual se entiende y el nuestro no.
5. `examples/informe-reel-cafeandcode/INFORME.md` — la referencia de calidad.
6. `specs/014-story-audio-narration-captions/spec.md` — la spec a medio implementar.
7. `CAMBIOS-SIN-CONFIRMAR.md` — las 32 decisiones tomadas sin confirmación humana explícita.
