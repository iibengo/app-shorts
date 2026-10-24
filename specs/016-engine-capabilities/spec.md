# Feature Specification: Contrato de capacidad de los motores

**Feature Branch**: `016-engine-capabilities`

**Created**: 2026-10-24

**Status**: Draft (Checkpoint 1 pendiente). No se escribe código hasta la aprobación humana.

**Input**: User description: "En el futuro podremos poner diferentes modelos con diferentes formas de comunicarnos, incluso de prompts, ya que usan diferentes inputs: más fotos, vídeo, etc. Depende del modelo debería funcionar bien. Tenemos que tener la info de cada modelo para saber qué hacer; incluso el tipo de clip cambiará, y el precio. Todo eso debemos dejarlo atado."

## El problema, medido

El pipeline pide **duraciones que el motor no acepta** y depende de números escritos a mano que nadie contrastó.

### Fichas verificadas contra el esquema oficial (2026-10-24)

| Campo | Motor rápido | Motor de calidad |
|---|---|---|
| Duraciones | `6` o `10` (por defecto `6`) | **`5` o `10`** (por defecto `5`) |
| Resoluciones | `512P`, `768P` (por defecto `768P`) | no expone; la salida sigue a la entrada |
| Proporción de salida | hereda de la imagen de entrada | hereda de la imagen de entrada |
| Prompt negativo | **no existe el campo** | **sí**, por defecto `"blur, distort, and low quality"` |
| Primera imagen | `image_url` | `image_url` |
| Última imagen | `end_image_url` | `tail_image_url` |
| Optimizador de prompt | `prompt_optimizer` (por defecto `true`) | no |
| Fuerza de guiado | no | `cfg_scale` (por defecto `0.5`) |

**Hallazgo:** el nombre del campo de última imagen **cambia entre los dos motores**. Un pipeline que lo dé por hecho rompe al cambiar de motor.

Lo que hace hoy el código: `preset === 'quality' ? 5 : 6`, un ternario, y el campo negativo se envía solo a calidad. Acierta con los dos motores actuales **por casualidad**. Con el tercero, rompe.

**Consecuencia ya sufrida:** una historia con planos de 2 y 3 segundos recibió clips de **6 segundos** que el montaje recortaba. Funcionaba con pocos planos y fallaba la verificación final con doce.

| Regla | Contrato |
|---|---|
| Sin números mágicos | Ninguna duración, resolución ni coste puede estar escrita en el orquestador |
| Una ficha por motor | Cada motor declara lo que acepta; el pipeline elige de esa lista |
| Nada inventado | Si un motor no admite lo pedido, se elige la opción válida más cercana, nunca un valor inventado |
| Fallo temprano | Una combinación imposible MUST fallar antes de gastar, con un código estable |

## Alcance

1. **Registro de capacidades** por motor: duraciones válidas, entradas, resolución, proporción, coste y si admite prompt negativo.
2. **Selección determinista**: del tiempo deseado a la duración válida más cercana.
3. **Verificación del montaje** que comprueba **cada clip** contra lo que el motor prometió, no el total.
4. **Coste derivado de la ficha**, no de constantes.
5. **Adaptación del director**: recibe los límites del motor y planifica dentro de ellos. El montaje deja de recortar.

**Fuera de alcance:** añadir motores nuevos; cambiar de motor; los campos de entrada que todavía no usamos (vídeo de referencia, primera y última imagen).

## Requisitos funcionales

| ID | Requisito |
|---|---|
| FR-001 | MUST existir `server/story/engine-capabilities.ts`: registro puro de motores, sin I/O ni entorno |
| FR-002 | Cada ficha MUST declarar: identificador, duraciones admitidas, entradas admitidas, resoluciones, proporción de salida, coste por duración y si admite negativo |
| FR-003 | El orquestador MUST elegir la duración de la ficha. MUST NOT contener ninguna duración literal |
| FR-004 | La elección MUST ser determinista: la duración válida más cercana a la pedida; en empate, la menor, para no encarecer |
| FR-005 | Si el motor no admite ninguna duración razonable para el plano, el envío MUST fallar antes de llamar al proveedor con `engine-unsupported-duration` |
| FR-006 | El montaje MUST verificar cada clip contra la duración solicitada a ese motor, con una tolerancia declarada en la ficha |
| FR-007 | La verificación del total MUST usar la suma de lo realmente recortado, no un margen fijo que se acumule con el número de planos |
| FR-008 | El coste de un clip MUST calcularse como `costePorSegundo × segundosRealesDelMotor`, no como una unidad fija |
| FR-009 | La ficha MUST declarar si el motor acepta prompt negativo; el orquestador MUST NOT enviarlo a quien no lo acepta |
| FR-010 | Un motor desconocido en la ficha MUST fallar con `engine-unknown` antes de gastar |
| FR-011 | El registro MUST ser exhaustivo por tipo: añadir un motor sin ficha no MUST compilar |

## Contrato de datos

```ts
export interface EngineCapacity {
  readonly id: string
  /** Duraciones que el proveedor acepta, según su documentación. */
  readonly durationsSeconds: readonly number[]
  /** Valores por defecto del proveedor, para no adivinar. */
  readonly defaultDurationSeconds: number
  readonly resolutions: readonly string[]
  /** Proporciones de salida garantizadas. */
  readonly aspectRatios: readonly string[]
  /** `false` cuando el proveedor no expone un canal negativo útil. */
  readonly negativePrompt: boolean
  /** Unidades de entrada que acepta. */
  readonly inputs: readonly ('image' | 'first-last-frame' | 'multi-image' | 'video')[]
  /** Coste por segundo entregado. */
  readonly costPerSecondUsd: number
  /** Margen aceptado entre lo pedido y lo entregado, en segundos. */
  readonly durationToleranceSeconds: number
}
```

| Regla | Contrato |
|---|---|
| Fuente | Los valores vienen de la documentación oficial del proveedor, citada en un comentario con fecha |
| Sin rangos inventados | `durationsSeconds` es una lista cerrada; `[2,3,4,5]` MUST NOT escribirse si el proveedor no los acepta |
| Proporción | Un motor que hereda la proporción de la imagen de entrada MUST declararlo explícitamente |
| Nombres de campo | El registro MUST declarar cómo se llama cada entrada **en ese motor**. Hoy el campo de última imagen se llama distinto en cada uno |
| Optimizador | Si el motor corre un optimizador de prompt por defecto, la ficha MUST declararlo: reescribe lo que enviamos |

## Duración: qué hace el pipeline

**Decisión del humano (2026-10-24):** *"Si MiniMax solo acepta 6 segundos como mínimo, tenemos que adaptarnos a eso, más bien el director o el motor."*

**El que se adapta es el director.** No se fabrican planos de 2 s para recortarlos de un clip de 6.

| Caso | Comportamiento |
|---|---|
| El motor declara sus duraciones | El director MUST recibirlas **antes** de repartir los planos |
| Reparto de duraciones | Cada plano MUST durar un valor de la lista del motor. Nunca un valor intermedio |
| Número de planos | Se deriva de la duración objetivo y del mínimo del motor: 15 s con mínimo 6 = **2 planos**, no 4 |
| Recorte | El montaje MUST NOT recortar. Une clips que ya duran lo que el motor entrega |
| Incompatibilidad | Si la duración objetivo no se puede componer con las duraciones del motor, la creación MUST rechazarse antes de gastar con `engine-unsupported-plan` |

| Regla | Contrato |
|---|---|
| Coste honesto | Se paga exactamente lo que se usa: no hay segundos comprados y tirados |
| Sin recortes | Un recorte en el montaje MUST considerarse un error de planificación, no un caso normal |
| Honestidad de producto | Con un motor de mínimo 6 s, una historia de 15 s tiene dos planos. MUST NOT prometerse más variedad de la que el motor permite |

## Verificación del montaje

| Regla | Contrato |
|---|---|
| Por clip | Cada clip normalizado MUST comprobarse contra la duración pedida al motor, con su tolerancia |
| Total | El total MUST comprobarse contra la suma de las duraciones de los planos, con tolerancia `n × 0,05 s`, acotada a 1 s |
| Sin margen acumulado | La tolerancia del total MUST NOT ser una constante pequeña e independiente del número de planos |

## Coste

| Regla | Contrato |
|---|---|
| Derivado | El guardián MUST usar `costPerSecondUsd` de la ficha, no una constante por clip |
| Reserva | La estimación previa MUST usar la duración que el motor entregará, no la que el plano usa |
| Sin cambio de perfil | Los caps por perfil no cambian en esta spec; si el coste real sube, MUST detectarse aquí y tratarse en una enmienda |

## Test plan

| Caso | Contrato |
|---|---|
| Selección de duración | Para cada ficha: duración exacta, más cercana, empate, fuera de rango |
| Sin literales | Test que falla si el orquestador contiene una duración numérica |
| Exhaustividad | Un motor sin ficha MUST fallar; el tipo obliga a declararla |
| Verificación | 12 clips de 2 y 3 s con clips de 6 s: el montaje MUST aceptar el resultado |
| Coste | Un clip de 6 s usado como 2 s MUST cobrarse como 6 s |
| Negativo | Un motor sin canal negativo MUST NOT recibirlo |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un proveedor cambia sus duraciones | La ficha se actualiza con la fecha de la documentación; un test fija la lista |
| Menos planos por historia con motores de mínimo alto | Es una consecuencia del motor, no un fallo. Se declara en el producto y se elige motor sabiendo esto |
| El coste por segundo real difiere | El guardián es la autoridad; el valor se declara como estimado |
| Motores con entradas que aún no usamos | `inputs` ya las contempla; añadirlas no cambia la ficha |

## Fases

1. Registro de capacidades con las dos fichas actuales, documentadas y fechadas.
2. Selección de duración en el orquestador, sin literales. Tests.
3. Coste derivado de la ficha. Tests.
4. Verificación del montaje por clip. Test con la historia de 12 planos ya pagada.
5. Gate completo y remontaje de la historia de 30 s.
