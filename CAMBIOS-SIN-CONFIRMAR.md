# Cambios tomados sin confirmación del humano

Registro de decisiones aplicadas por el agente sin aprobación explícita, para
revisarlas después. Cada entrada dice qué se hizo, por qué y cómo se comprobó.
Si algo aquí no convence, se revierte sin más: nada de esto es irreversible.

---

## 2026-10-24 · Sesión autónoma (humano ausente)

**Instrucción recibida:** «sigue con lo que puedas sin parar, sin confirmaciones,
recuerda apuntar tus cambios, no hagas pruebas con saldo, ve commiteando».

**Restricciones respetadas:** cero llamadas a proveedores de pago; ninguna
prueba real; todo lo que sigue se valida con tests locales y FFmpeg.

---

### 1. Registro de este archivo

**Qué:** crear `CAMBIOS-SIN-CONFIRMAR.md` en la raíz.
**Por qué:** el humano lo pidió explícitamente para poder revisar después.
**Coste:** 0.

---

### 2. Test del flujo completo que sí comprueba los gráficos

**Qué:** el test de flujo completo existía y pasaba, pero su fake de montaje
nunca devolvía gráficos, así que un pintor declarado y nunca asignado pasó
inadvertido durante toda la spec 015. Se añade una aserción que comprueba que
los gráficos llegan a la historia guardada.
**Por qué:** hoy los bugs reales los encontró un script de reproducción, no la
suite. Este es el hueco concreto: el flujo se probaba, pero no el dato que
cruza el límite.
**Comprobación:** el test falla si se quita el guardado y pasa con él.
**Coste:** 0.
**Tests:** 1909 passed / 12 skipped, build correcto.

---

### 3. Test de montaje con FFmpeg real

**Qué:** nuevo `tests/acceptance/story-assembly-real.spec.ts`. Codifica clips de
verdad con FFmpeg local, los monta con el ensamblador real, pinta los gráficos y
comprueba que se devuelven.
**Por qué:** el test de flujo usaba un montaje falso que nunca devolvía gráficos.
Ese hueco dejó pasar un pintor declarado y nunca asignado durante toda una spec.
**Comprobación:** se verificó que **falla** si se quita la asignación del pintor
y **pasa** con ella. Es el test que habría cazado el bug de ayer.
**Sin coste:** solo FFmpeg local, sin red ni proveedor. Se salta si no hay FFmpeg.
**Coste:** 0.

### 4. Documentación sincronizada

**Qué:** estado de la 016 a `Implemented`, recuento de tests y nombre de la
última migración en `AGENTS.md`.
**Por qué:** eran datos desfasados que confunden a quien lea el repositorio.
**Coste:** 0.
