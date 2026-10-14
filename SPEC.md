# SPEC — Cocheros: control de inventario de la franquicia

Versión: v1 (borrador) · Estado: no construido · Fecha: 2026-10-14

Línea base del proyecto. Todo cambio entra primero aquí y dice a qué afecta. Lo que aparezca al construir y no
bloquee va a «Versión siguiente».

## 1. Problema

Cocheros es una franquicia de perros calientes. El dueño de la franquicia opera una bodega central y abastece varios
puntos de venta (carros o locales) en distintos lugares. Hoy no hay registro único de qué insumo está en bodega, qué se envió a cada punto, qué se vendió o
perdió y qué hay que pedir al proveedor. Consecuencias: faltantes en punto de venta, compras a ojo, mermas y
vencimientos sin explicar, y diferencias entre lo despachado y lo recibido que nadie puede rastrear.

## 2. Objetivos (v1)

| # | Objetivo | Cómo se mide |
| :--- | :--- | :--- |
| O1 | Saldo por insumo y ubicación (bodega y cada punto) disponible en línea | Consulta de saldo = suma del kardex, prueba E2E-1 |
| O2 | Todo movimiento queda trazado: quién, cuándo, dónde, cuánto, lote y motivo | Ningún saldo cambia sin movimiento; prueba E2E-3 |
| O3 | El administrador sabe qué pedir y a qué punto asignar | Reporte de reorden con insumos bajo mínimo |
| O4 | El operador registra descargas desde el celular, incluso sin señal | Movimientos creados sin red se sincronizan sin duplicar; prueba E2E-4 |
| O5 | Diferencias de despacho, conteo y merma visibles | Reporte de diferencias por punto y periodo |

## 3. Fuera de alcance (v1)

- **Facturación electrónica y POS de cobro.** La venta se registra como descarga de inventario, no como factura DIAN.
  Integración con un POS existente: versión siguiente.
- **Contabilidad y costeo contable.** Se guarda el costo unitario de compra para valorizar, sin asientos contables.
- **Pagos a proveedores y cuentas por pagar.**
- **Nómina, turnos y caja del operador.**
- **Múltiples bodegas centrales.** El modelo lo admite (ubicación de tipo BODEGA), la interfaz v1 maneja una.

## 4. Roles

| Rol | Alcance | Puede |
| :--- | :--- | :--- |
| `SUPERADMIN` | Todo el negocio | Catálogo, proveedores, puntos de venta, usuarios, pedidos, entradas a bodega, asignaciones, ajustes, reportes |
| `OPERADOR_PV` | Uno o más puntos asignados | Ver saldo y asignaciones de su punto, confirmar recepción, registrar descargas (venta, merma, devolución), conteo físico |

Un operador nunca ve ni modifica otro punto de venta. La restricción se aplica en la base de datos (políticas por fila),
no sólo en la interfaz.

## 5. Modelo de datos

```
Insumo(id, codigo, nombre, categoria, unidad_base, presentacion, factor_presentacion,
       perecedero, dias_vida_util, stock_minimo_bodega, activo)
Proveedor(id, nit, nombre, contacto, telefono, activo)
Ubicacion(id, tipo[BODEGA|PUNTO_VENTA], nombre, direccion, lat, lon, activo)
Usuario(id, nombre, email, rol, activo)  ·  UsuarioUbicacion(usuario_id, ubicacion_id)
StockMinimo(ubicacion_id, insumo_id, minimo, maximo)
Lote(id, insumo_id, codigo_lote, fecha_vencimiento, costo_unitario)
Pedido(id, proveedor_id, estado[BORRADOR|ENVIADO|RECIBIDO_PARCIAL|RECIBIDO|ANULADO], fecha, total)
  PedidoLinea(pedido_id, insumo_id, cantidad, costo_unitario, cantidad_recibida)
Asignacion(id, origen_id, destino_id, estado[BORRADOR|DESPACHADA|RECIBIDA|RECIBIDA_CON_DIFERENCIA|ANULADA],
           creada_por, despachada_en, recibida_en, recibida_por)
  AsignacionLinea(asignacion_id, insumo_id, lote_id, cantidad_enviada, cantidad_recibida, nota)
Movimiento(id uuid, ubicacion_id, insumo_id, lote_id, tipo, cantidad (+/-), costo_unitario,
           referencia_tipo, referencia_id, motivo, usuario_id, creado_en_dispositivo, recibido_en_servidor,
           dispositivo_id)
Conteo(id, ubicacion_id, fecha, usuario_id, estado[ABIERTO|CERRADO])
  ConteoLinea(conteo_id, insumo_id, saldo_sistema, cantidad_contada)
```

Tipos de `Movimiento`:

| Tipo | Signo | Origen |
| :--- | :--- | :--- |
| `ENTRADA_COMPRA` | + | Recepción de pedido en bodega |
| `ENTRADA_MANUAL` | + | Carga inicial o donación; exige motivo |
| `TRASLADO_SALIDA` | − | Despacho de asignación (bodega) |
| `TRASLADO_ENTRADA` | + | Recepción de asignación (punto) |
| `VENTA` | − | Descarga por venta en punto |
| `MERMA` | − | Daño, vencimiento, caída; motivo obligatorio |
| `DEVOLUCION_SALIDA` / `DEVOLUCION_ENTRADA` | −/+ | Punto devuelve a bodega |
| `AJUSTE_CONTEO` | ± | Cierre de conteo físico |

## 6. Reglas de negocio

- **R1 Kardex inmutable.** El saldo de (ubicación, insumo, lote) es la suma de sus movimientos. Ningún movimiento se
  edita ni se borra; un error se corrige con un movimiento contrario que referencia al original.
- **R2 Unidad base.** Todo se guarda en unidad base (unidad, gramo, mililitro). La presentación (paquete x 10, galón)
  sólo convierte al registrar: `cantidad_base = cantidad × factor_presentacion`.
- **R3 Asignación en dos pasos.** Al despachar se crea `TRASLADO_SALIDA` en bodega y la asignación queda `DESPACHADA`
  (en tránsito, no suma al punto). Al recibir, el operador confirma cantidades; se crea `TRASLADO_ENTRADA` por lo
  recibido. Si recibido ≠ enviado, estado `RECIBIDA_CON_DIFERENCIA` y la diferencia se muestra al administrador.
- **R4 FEFO.** Al despachar, el sistema propone los lotes con vencimiento más próximo; el administrador puede cambiarlos.
- **R5 Sin saldo negativo en bodega.** No se despacha más de lo disponible en bodega.
- **R6 Saldo negativo en punto, permitido y alertado.** Una venta registrada sin señal ya ocurrió; el servidor la
  acepta y marca alerta de saldo negativo para revisión.
- **R7 Reorden.** Un insumo entra al reporte de reorden cuando saldo de bodega + pedidos `ENVIADO` pendientes <
  `stock_minimo_bodega`. Cantidad sugerida = máximo − (saldo + pendiente).
- **R8 Sugerencia de asignación.** Para cada punto, sugerido = `maximo` − saldo del punto, limitado por saldo de bodega.
- **R9 Conteo físico.** Al cerrar un conteo se generan `AJUSTE_CONTEO` por cada diferencia. Durante un conteo abierto
  se pueden seguir registrando ventas; el saldo de sistema se congela al abrir el conteo.
- **R10 Vencimiento.** Lotes con `fecha_vencimiento` ≤ hoy + 2 días se alertan; vencidos no se pueden despachar.

## 7. Funciones por aplicación

### 7.1 Web (administrador; también usable por operador)

| Id | Función | Prioridad |
| :--- | :--- | :--- |
| W1 | Inicio de sesión, recuperación de contraseña, alta y baja de usuarios con rol y puntos | P0 |
| W2 | Catálogo de insumos, presentaciones, mínimos y máximos por ubicación | P0 |
| W3 | Proveedores y puntos de venta | P0 |
| W4 | Carga inicial de inventario por archivo CSV (plantilla descargable) | P0 |
| W5 | Pedidos a proveedor: crear, enviar, recibir total o parcial con lote y vencimiento | P0 |
| W6 | Asignaciones a puntos: crear (con sugerido R8), despachar (FEFO), ver en tránsito y diferencias | P0 |
| W7 | Tablero: saldo por ubicación, alertas (bajo mínimo, vencimiento, saldo negativo, diferencias) | P0 |
| W8 | Kardex por insumo y ubicación con filtros y exportación CSV | P0 |
| W9 | Reporte de reorden (R7) y de mermas por punto y periodo | P0 |
| W10 | Conteo físico y ajuste | P1 |
| W11 | Recetas: un producto vendido (perro sencillo, especial) descuenta varios insumos | P1 |
| W12 | Generar pedido a proveedor desde el reporte de reorden | P1 |

### 7.2 Móvil (operador de punto de venta)

| Id | Función | Prioridad |
| :--- | :--- | :--- |
| M1 | Inicio de sesión; selección de punto si tiene varios | P0 |
| M2 | Saldo actual de su punto, con alertas de bajo mínimo y vencimiento | P0 |
| M3 | Asignaciones pendientes: ver detalle y confirmar recepción con cantidades reales | P0 |
| M4 | Registrar descarga: venta, merma (con motivo y foto opcional) y devolución | P0 |
| M5 | Funcionamiento sin conexión con cola de sincronización visible (pendientes, enviados, error) | P0 |
| M6 | Historial de movimientos del día | P0 |
| M7 | Registro por producto vendido usando recetas (W11) | P1 |
| M8 | Conteo físico desde el celular | P1 |
| M9 | Lectura de código de barras con la cámara | P2 |

## 8. Arquitectura

Cambio 2026-10-14: despliegue en Vercel pedido por Diego. Afecta a §7.2 (el móvil es PWA en v1) y §12 (F3).

| Capa | Elección | Por qué |
| :--- | :--- | :--- |
| Despliegue | Vercel, un solo proyecto | Pedido; web y móvil salen del mismo código |
| Web | Next.js + TypeScript, rutas `/admin` | Superadministrador |
| Móvil | Misma app, ruta `/pv`, instalable como PWA (manifiesto); cola local sin conexión | Vercel no aloja apps nativas; el operador la instala desde el navegador del celular |
| Reglas de negocio | `lib/dominio.ts`, funciones puras compartidas por web, móvil y servidor | Una sola implementación de R1–R10, probada sin base de datos |
| Base de datos y autenticación | PostgreSQL gestionado (Supabase) con políticas por fila | Kardex en SQL, roles en la base. Hasta conectarla, la demo guarda en el navegador |
| Lógica transaccional | Funciones SQL (`rpc`) para despachar, recibir, cerrar conteo | Atomicidad: el movimiento y el cambio de estado van en una transacción |

Sincronización (O4, M5):

- Cada movimiento se crea en el dispositivo con `id` UUID, `creado_en_dispositivo` y `dispositivo_id`.
- La cola envía en orden; el servidor inserta con `ON CONFLICT (id) DO NOTHING` (idempotente: reenviar no duplica).
- El cliente sólo crea movimientos; nunca envía saldos. El saldo local = saldo del servidor + pendientes locales.
- Recepción de asignación sin señal: se guarda local y se confirma al sincronizar; si el administrador la anuló
  entretanto, el servidor rechaza y el móvil lo muestra como error para revisión.

Estructura de ficheros:

```
app/admin/         web del superadministrador
app/pv/            app móvil del operador (PWA)
lib/dominio.ts     reglas R1–R10, tipos, conversión de unidades
lib/semilla.ts     datos de ejemplo (1 bodega, 3 puntos)
lib/almacen.ts     persistencia de la demo (navegador); se reemplaza por Supabase
db/migraciones/    esquema, políticas por fila, funciones rpc (F1 con Supabase)
pruebas/           escenarios de §9
docs/mock/         maqueta HTML inicial
```

## 9. Verificación de extremo a extremo

Cada prueba ejecuta el código contra una base de prueba y asevera valores fijados aquí, no calculados por el código.

| Id | Escenario | Valor esperado |
| :--- | :--- | :--- |
| E2E-1 | Carga inicial 500 panes en bodega; asignar 120 a Punto A; Punto A recibe 120; vende 30 | Bodega 380, Punto A 90 |
| E2E-2 | Asignar 50 salchichas, Punto A recibe 48 | Estado `RECIBIDA_CON_DIFERENCIA`, diferencia 2, Punto A +48 |
| E2E-3 | Intentar `UPDATE` o `DELETE` sobre `movimiento` con cualquier rol | Rechazado por la base |
| E2E-4 | Móvil sin red registra 3 ventas, reenvía la cola dos veces | 3 movimientos en servidor, no 6 |
| E2E-5 | Operador de Punto A consulta saldo de Punto B | 0 filas devueltas |
| E2E-6 | Despachar más de lo que hay en bodega | Rechazado (R5) |
| E2E-7 | Paquete de 10 salchichas, recibir 3 paquetes | Movimiento de 30 unidades (R2) |
| E2E-8 | Mínimo bodega 200, saldo 150, pedido enviado 0, máximo 400 | Reorden sugiere 250 (R7) |
| E2E-9 | Dos lotes, vence 2026-10-20 y 2026-11-05; despachar | Propone primero el del 20-oct (R4) |

Requisitos (O1–O5, R1–R10) se cuentan aparte de las pruebas de comportamiento de interfaz.

## 10. Datos y normativa aplicable

- **Datos personales (Ley 1581 de 2012).** Se guardan nombre, correo y teléfono de usuarios y contactos de proveedor.
  La ley exige autorización previa, expresa e informada del titular (art. 4 lit. c, según transcripción de la Cámara
  de Comercio de Bogotá, fuente F6; falta cotejar con el texto oficial). Se pide al crear el usuario.
- **Alimentos (Resolución 2674 de 2013).** Aplica a quien almacena, transporta, distribuye y comercializa alimentos
  (fuente F5, PDF escaneado). Lote y vencimiento por insumo apoyan esa trazabilidad; el sistema no certifica
  cumplimiento. Los artículos exactos sobre almacenamiento no están verificados: se leen por páginas antes de citarlos.

## 10b. Fuentes de contexto

| Id | Dato | Fuente |
| :--- | :--- | :--- |
| F1 | Insumos de un perro colombiano: salchicha, salsas, cebolla, huevo de codorniz, queso, papa ripio, tocineta, pan | empanadasdfabio.com/es/productos/empanadasdfabio-perro-caliente |
| F2 | Salchicha para perro en paquete de 12 und (480 g) | exito.com/salchicha-perro-caliente-x-12-unds-119468/p |
| F3 | FEFO como complemento de FIFO en perecederos; registro de mermas | wf.covermanager.com/en/blog/best-practices-for-inventory-management-in-restaurants |
| F4 | Referencias: bodega central con traslados (Mews, Wisk); kardex por bodega (Siigo); niveles par, recetas y mermas (MarketMan) | help.mews.com (multiple-warehouses-and-stock-transfers) · siigo.com/gestion-de-inventario · marketman.com/cap |
| F5 | Ámbito de la Resolución 2674 de 2013 | bogota.gov.co/sites/default/files/inline-files/resolucion-2674-de-2013.pdf |
| F6 | Ley 1581 de 2012, autorización del titular | bibliotecadigital.ccb.org.co (bitstream e66130d1-…) |
| F7 | UUID generado en el cliente y servidor idempotente para sincronizar sin conexión | archman.dev (offline-sync-and-conflict-resolution) · cleverence.com/articles/business-blogs/guide-real-time-sync-7462 |

Sin fuente abierta (no se usan como dato): punto de reorden estándar, funciones de Alegra y Toast.

## 11. Preguntas abiertas

| # | Pregunta | Quién | Bloquea |
| :--- | :--- | :--- | :--- |
| P1 | ¿Supabase como base de datos, o otra (Vercel Postgres, Neon)? | Diego | Sí, antes de F1 |
| P2 | ¿Cuántos puntos de venta y operadores al arranque? ¿Un operador puede cubrir varios puntos? | Diego | No |
| P3 | ¿La venta se registra por insumo (v1) o por producto con receta (W11) desde el inicio? | Diego | No |
| P4 | ¿Hay un POS o caja actual con el que integrarse más adelante? | Diego | No |
| P5 | ¿Se necesita un rol intermedio (bodeguero o supervisor) además de superadmin? | Diego | No |
| P6 | ¿Hace falta app nativa en tiendas (Play Store, App Store) o basta la PWA? | Diego | No |

## 12. Fases

| Fase | Contenido | Cierra cuando |
| :--- | :--- | :--- |
| F0 | Reglas en `lib/dominio.ts` y demo desplegable en Vercel con datos en el navegador | E2E-1, 2, 4, 6, 7, 8, 9 pasan sobre el dominio |
| F1 | Supabase: esquema, políticas, funciones rpc, semillas | E2E-3 y 5 pasan contra la base |
| F2 | Web P0 (W1–W9) sobre la base | Flujo administrador completo sobre semillas |
| F3 | PWA P0 (M1–M6) con cola sin conexión | E2E-4 pasa en un celular real, sin señal |
| F4 | P1 (conteo, recetas, pedido desde reorden) | Pruebas propias en la SPEC v2 |

## Versión siguiente

- App nativa (Expo) en tiendas, si la PWA no basta (P6).
- Integración con POS y facturación electrónica.
- Varias bodegas centrales y traslados entre puntos.
- Lectura de código de barras (M9).
- Pronóstico de demanda por día de semana y punto.
