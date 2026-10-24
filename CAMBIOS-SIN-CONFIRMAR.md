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

### 8. Un clip sin archivo pasaba el control de calidad

**Qué:** cuando la descarga de un clip no devolvía ruta, el control de calidad
registraba **cero problemas técnicos**. Ahora registra un problema de flujo.
**Por qué:** era deuda anotada en el backlog (punto 16). Un clip que no existe
se presentaba al revisor como "sin problemas técnicos", que es peor que un falso
negativo: es una afirmación falsa sobre el material.
**Comprobación:** el test falla sin el arreglo y pasa con él.
**Coste:** 0.
**Tests:** 1911 passed / 12 skipped, build correcto.

### 9. Integración continua

**Qué:** `.github/workflows/gate.yml` ejecuta la suite completa y el build en cada
push y en cada pull request a `main`.
**Por qué:** el backlog lo tenía pendiente (punto 13) y es lo que habría avisado
de los fallos de esta sesión sin depender de que alguien lanzara el gate a mano.
**Comprobación:** se ha ejecutado la suite completa **sin base de datos y sin
claves** (`env -u DATABASE_URL -u NUXT_FAL_KEY`): 1911 en verde. Es decir, no hay
ningún test que dependa de infraestructura real, y el CI no necesitará secretos.
**Sin proveedor real:** ningún test sale a la red; los opt-in siguen saltados.
**Coste:** 0.

**Pendiente de comprobar:** el primer push a GitHub. No se puede validar el
workflow sin ejecutarlo allí.

### 10. Auditoría del `typecheck` (sin arreglar la deuda antigua)

**Qué:** no se ha arreglado la deuda anterior, solo la de esta sesión (326 → 306).
Se clasificó lo que queda.
**Por qué:** cada error antiguo exige decidir qué contrato manda (por ejemplo,
si el plan lleva `beats` o se derivan de las escenas, o si el resultado de QC es
por escena o por plano). Son decisiones de diseño, no correcciones mecánicas, y
no se toman sin el humano.
**Lo que sí se arregló hoy:** importaciones que faltaban, una variable
inexistente, un valor que podía ser `undefined` y una función con parámetros de
más. Todos introducidos en esta sesión.

### 11. Escrituras batch: NO tocadas

**Qué:** no se ha hecho nada con el punto 15 del backlog (transaccionalidad de las
escrituras historia→planos).
**Por qué:** implica envolver varias escrituras en una transacción y cambiar la
firma del repositorio. Si el orden o el guard cambian mal, el resultado es peor
que ahora (planos bloqueados en un estado del que no salen), y ese es justo el
tipo de bug que costó una noche entera. **No se hace sin el humano delante.**
**Coste:** 0.

### 12. El typecheck antiguo: clasificado, no arreglado

**Qué:** de 326 a 306 errores, solo los introducidos hoy.
**Qué queda:** errores que exigen decidir qué contrato manda (si `beats` existe
en el plan o se deriva, si el resultado de QC es por escena o por plano). Son
decisiones de diseño.
**Coste:** 0.

### 13. Etiqueta accesible en los vídeos

**Qué:** los dos reproductores de vídeo llevan ahora `aria-label` con el título de
la historia.
**Por qué:** sin etiqueta, un lector de pantalla anuncia solo «vídeo», sin decir
de qué. Es el mínimo de accesibilidad y no cambia nada visual.
**Coste:** 0.
**Tests:** 1911 passed / 12 skipped, build correcto.

### 14. Fuera el interruptor de depuración del ensamblador

**Qué:** se quita la variable de entorno que permitía conservar el directorio de
trabajo del montaje.
**Por qué:** la añadí para inspeccionar el fallo. En producción nadie debe poder
desactivar la limpieza de temporales: se acumularían archivos.
**Coste:** 0.

### 15. El mensaje de presupuesto ya no inventa una cifra

**Qué:** el mensaje por defecto de «presupuesto agotado» decía «límite de 8
dólares». Ahora no nombra cantidad, porque el cap depende del perfil: 2,50 para
una historia de 15 s con el perfil barato, 15 para una de 90 s en producción.
Cuando quien lanza el error conoce el cap real, lo añade.
**Por qué:** una cifra fija es falsa para casi todos los casos, y el usuario no
puede saber cuánto le queda de verdad.
**Comprobación:** suite completa en verde tras actualizar el test que fijaba el
texto antiguo.
**Coste:** 0.

### 16. Tests de la línea de foco

**Qué:** nuevo `tests/unit/story-shot-card.spec.ts`. Comprueba que la tarjeta de
un plano nombra al personaje del que trata, que no dibuja la línea cuando el
sujeto no nombra a nadie de la escena, y que el acento y las mayúsculas no
impiden el emparejamiento.
**Por qué:** la línea de foco se añadió hoy y no tenía cobertura de componente.
**Coste:** 0.

### 17. Las referencias de personaje se ven también al revisar

**Qué:** la lista de personajes con su imagen aparecía solo mientras se generaban
los planos. Ahora también se muestra en la pantalla de revisión.
**Por qué:** al revisar era imposible saber cómo había quedado un personaje
secundario; solo se veía durante la generación y desaparecía. Si el usuario no
mira en ese momento, nunca ve la cara de su personaje.
**Coste:** 0. Reutiliza el componente que ya existía.
**Tests:** 1914 passed / 12 skipped, build correcto.

### 18. El motivo del fallo de un personaje

**Qué:** cuando la referencia de un personaje falla, el servidor guarda ahora el
código del fallo y la pantalla lo traduce a una frase («el proveedor tardó
demasiado», «no cabía en el presupuesto»). Un código desconocido cae en una frase
neutra.
**Por qué:** en la historia real de hoy, **2 de 3 personajes fallaron** y la
interfaz solo decía «referencia no disponible». El usuario no tenía forma de
saber si era su foto, el proveedor o el dinero.
**Sin filtrar detalles:** el código es estable y del servidor; nunca se muestra
el mensaje crudo del proveedor.
**Coste:** 0.
**Tests:** 1914 + 2 nuevos, build correcto.

### 19. Regenerar una referencia de personaje

**Qué:** ruta nueva para volver a encolar la referencia de un personaje que
falló. Se niega en tres casos: si ya está lista (pagar por repetir algo que ya se
tiene), si es la foto subida por el usuario (no hay nada que redibujar) y si la
historia no está en un estado que lo permita.
**Por qué:** sin esto, un personaje que falla no se puede recuperar nunca; la
historia queda con un secundario sin imagen para siempre. Es la mitad de la
pantalla de personajes del backlog (punto 9a).
**Seguridad:** misma sesión, mismo origen, misma guarda que el resto de comandos.
**Coste:** 0 hasta que alguien la use; entonces cuesta una imagen por personaje.
**Tests:** 6 de aceptación con los cinco casos, más la suite completa
(1916 passed / 12 skipped) y build correcto.
**Pendiente:** el botón en la interfaz. Sin él, la ruta existe pero nadie la usa.

### 20. El botón de reintentar personaje

**Qué:** la lista de personajes muestra «Volver a intentar» cuando una referencia
generada falló. No aparece si ya está lista, ni en la foto subida por el usuario.
**Por qué:** la ruta existía desde el cambio anterior pero nadie podía usarla.
**Decisión de interfaz:** el botón no se muestra para la foto del usuario porque
no hay nada que redibujar; un botón que no hace nada es peor que no tenerlo.
**Coste:** 0 hasta pulsarlo; entonces, una imagen por personaje.
**Tests:** 4 nuevos de componente, 6 de ruta, suite completa en 1920 / 12 skipped.

### 21. Revisión externa: cuatro bloqueantes corregidos

Un revisor independiente encontró cuatro fallos graves en el trabajo anterior.
Todos corregidos:

1. **El motivo del fallo se guardaba y se descartaba al leer.** El parseo no
   leía `errorCode`, así que la mejora del punto 18 no funcionaba de punta a
   punta. Ahora se lee y se escribe.
2. **La ruta de reintentar aceptaba estados donde nadie la procesa.** En
   `WAITING_APPROVAL` devolvía 202 y dejaba la referencia en `pending` para
   siempre. Ahora solo se acepta durante la fase de keyframes, que es la única
   donde se recoge.
3. **Reiniciaba `attempts` a 0**, que es el único freno al gasto y la base del
   cálculo de coste. Una referencia se podía reencolar en bucle. Ahora no se
   toca el contador y se rechaza al llegar al tope.
4. **Faltaban la guarda de sesión y el límite de comandos** que tienen todas las
   rutas hermanas. Sin ellas, la ruta se podía llamar sin freno.

**Coste:** 0.
**Tests:** 1921 passed / 12 skipped, build correcto. Se añadieron dos casos
nuevos (estado incorrecto y tope agotado) y un test que impide que las dos
constantes del tope divergan.

### 22. Un error de tipos que era un fallo en ejecución

**Qué:** `storyBeatForScene` hacía `plan?.beats.find(...)`. Si el plan venía sin
`beats` —que es lo normal desde 008— reventaba en vez de usar el respaldo que
tiene doce líneas más abajo. Ahora usa `plan?.beats?.find(...)` y el tipo declara
`beats` como opcional.
**Por qué:** el revisor advirtió que no era deuda de tipos, era una excepción en
ejecución esperando a que llegara un plan sin `beats`.
**Efecto:** 306 → 300 errores de typecheck. Tests en verde.
**Coste:** 0.

### 23. La línea de foco mostraba el identificador interno

**Qué:** la tarjeta de un plano enseñaba «En foco: pixel», con el id del
personaje en minúsculas, en vez de su nombre. Ahora resuelve el nombre desde el
canon.
**Por qué:** el detalle es visible en la pantalla de revisión. Los tests nuevos
lo ocultaban porque usaban ids ya capitalizados.
**Coste:** 0.
