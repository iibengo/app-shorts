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

---

### 5. Errores de tipos en el ensamblador

**Qué:** importar los tipos que faltaban, corregir una variable inexistente y
proteger un valor que podía ser `undefined` en el ensamblador.
**Por qué:** eran errores introducidos por los cambios de esta sesión. El
`typecheck` global no está en el gate, así que nadie los habría visto hasta que
se decidiera arreglarlo entero.
**Efecto:** el total baja de 326 a 312 errores; ese archivo queda limpio.
**Coste:** 0.

### 6. Tipos en el compositor de prompts

**Qué:** una función de unión quedó con tres parámetros cuando ya solo usa dos,
y el tamaño del foco recibía un encuadre que podía ser indefinido.
**Por qué:** ambos venían de los cambios de hoy. El fallback `medium` coincide
con el que ya usa el bloque de identidad, así que foco y encuadre no se
contradicen.
**Efecto:** 312 → 306 errores. Tests del compositor en verde.
**Coste:** 0.

**Deuda anotada, no tocada:** `storyBeatForScene` lee `plan.beats`, que no existe
en el tipo actual. Es deuda anterior, no de esta sesión; arreglarla requiere
decidir si el plan lleva `beats` o se derivan de las escenas.

### 7. Test del mensaje de saldo agotado

**Qué:** un test que fija que el código nuevo dice «saldo» y no «servicio», que
no es reintentable y que devuelve 503.
**Por qué:** el arreglo de ayer no tenía test; sin él, cualquiera podría volver a
mapear el saldo agotado a un error genérico y nadie lo notaría.
**Coste:** 0.
