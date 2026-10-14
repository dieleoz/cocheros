# Cocheros — inventario de la franquicia

Control de inventario de Cocheros (perros calientes). Una bodega central abastece varios puntos de venta. El dueño de
la franquicia carga el inventario, pide al proveedor y asigna mercancía a cada punto. Cada operador ve el saldo de su
punto, recibe lo asignado y registra ventas, mermas y devoluciones desde el celular, también sin señal.

Estado: F0, demostración. Las reglas están implementadas y probadas; los datos se guardan en el navegador. Falta la
base de datos (F1) para que varios equipos compartan el mismo inventario.

## Dónde está cada cosa

| Ruta | Qué es |
| :--- | :--- |
| `SPEC.md` | Línea base: alcance, reglas R1–R10, modelo de datos, pruebas E2E, fases |
| `ROADMAP.md` | Runbook de desarrollo y estado por fase |
| `docs/mock/index.html` | Maqueta HTML inicial (un solo fichero) |
| `lib/dominio.ts` | Reglas de negocio (kardex, asignación en dos pasos, reorden, FEFO) |
| `lib/semilla.ts` | Catálogo y saldos de ejemplo |
| `lib/almacen.ts` | Persistencia de la demo en el navegador y cola sin conexión |
| `app/admin/` | Web del dueño de la franquicia: tablero, asignaciones, reorden, kardex |
| `app/pv/` | App móvil del operador (PWA instalable) |
| `public/sw.js` | Service worker: abre `/pv` sin señal |
| `pruebas/` | Escenarios de la SPEC §9 |

## Uso local

```bash
npm install
npm test          # 11 pruebas: 7 de requisito, 4 de comportamiento
npm run dev       # http://localhost:3000  ·  /admin  ·  /pv
```

## Despliegue en Vercel

Un solo proyecto sirve la web y la app móvil. Vercel detecta Next.js sin configuración:

1. Subir el repositorio a GitHub (`dieleoz/cocheros`).
2. En Vercel: *Add New → Project*, importar el repositorio y desplegar. O bien, por línea de comandos:
   `npx vercel` (vista previa) y `npx vercel --prod`.
3. En el celular del operador, abrir `https://<dominio>/pv` y usar «Agregar a pantalla de inicio». Queda instalada
   como app y abre sin señal.

Vercel no publica apps nativas en Play Store ni App Store; si se necesitan, ver SPEC «Versión siguiente».
