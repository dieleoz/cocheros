# ROADMAP — Cocheros

## Runbook de desarrollo (cada fase)

1. **SPEC.** El cambio entra primero en `SPEC.md`: qué requisito, qué regla, qué prueba lo cierra y a qué afecta.
2. **Pruebas.** Se escriben los escenarios de la SPEC con valores fijados en ella. Se ejecutan y se ven en rojo.
3. **Desarrollo.** Se implementa lo mínimo hasta verlas en verde. Lo que aparezca y no bloquee va a «Versión
   siguiente» de la SPEC.
4. **Verificación.** `npm test` y `npm run build` en verde; recorrido manual de la fase en el navegador.
5. **Entrega.** Commit y despliegue los decide Diego.

## Estado

| Fase | Contenido | Estado |
| :--- | :--- | :--- |
| F0 | Dominio, demo `/admin` y `/pv` en el navegador | Hecha: 11/11 pruebas (rojo visto con dominio vacío, verde con implementación); build de Next.js OK; recorrido sin señal → recepción con diferencia → sincronización verificado en navegador |
| F1 | Base de datos: esquema, políticas por fila, funciones rpc; E2E-3 y E2E-5 | Bloqueada por P1 (qué base de datos) |
| F2 | Web P0 sobre la base: usuarios, catálogo, pedidos, carga CSV | Pendiente |
| F3 | PWA P0 sobre la base; E2E-4 en celular real sin señal | Pendiente |
| F4 | Conteo físico, recetas, pedido desde reorden | Pendiente |

## Próxima sesión

- Respuesta de Diego a P1 (base de datos) y P2–P6 de la SPEC §11.
- Desplegar F0 en Vercel para revisar en el celular.
