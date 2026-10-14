// Datos de ejemplo de la demo (F0). Se reemplazan por db/semillas en F1.
import { despachar, Estado, registrar, TipoMov } from "./dominio";

export const BODEGA = "Bodega Central";
export const PUNTOS = ["PV Chapinero", "PV Usaquén", "PV Salitre"];
export const UBICACIONES = [BODEGA, ...PUNTOS];

export const INSUMOS: Record<string, { nombre: string; unidad: string; proveedor: string }> = {
  PAN: { nombre: "Pan para perro", unidad: "und", proveedor: "Panadería ejemplo S.A.S." },
  SAM: { nombre: "Salchicha americana", unidad: "und", proveedor: "Cárnicos ejemplo S.A.S." },
  SRA: { nombre: "Salchicha ranchera", unidad: "und", proveedor: "Cárnicos ejemplo S.A.S." },
  PAP: { nombre: "Papa ripio", unidad: "g", proveedor: "Mecato ejemplo Ltda." },
  QUE: { nombre: "Queso mozzarella rallado", unidad: "g", proveedor: "Lácteos ejemplo S.A." },
  TOC: { nombre: "Tocineta picada", unidad: "g", proveedor: "Cárnicos ejemplo S.A.S." },
  SPI: { nombre: "Salsa de piña", unidad: "ml", proveedor: "Salsas ejemplo Ltda." },
  SRO: { nombre: "Salsa rosada", unidad: "ml", proveedor: "Salsas ejemplo Ltda." },
  MOS: { nombre: "Mostaza", unidad: "ml", proveedor: "Salsas ejemplo Ltda." },
};

export const MIN_BODEGA: Record<string, number> = { PAN: 200, SAM: 150, SRA: 80, PAP: 5000, QUE: 4000, TOC: 2000, SPI: 4000, SRO: 4000, MOS: 3000 };
export const MAX_BODEGA: Record<string, number> = { PAN: 600, SAM: 500, SRA: 200, PAP: 25000, QUE: 15000, TOC: 6000, SPI: 15000, SRO: 15000, MOS: 8000 };
export const MIN_PV: Record<string, number> = { PAN: 40, SAM: 30, SRA: 15, PAP: 1000, QUE: 800, TOC: 400, SPI: 800, SRO: 800, MOS: 600 };
export const MAX_PV: Record<string, number> = { PAN: 120, SAM: 90, SRA: 40, PAP: 3000, QUE: 2500, TOC: 1200, SPI: 2500, SRO: 2500, MOS: 1800 };

export const minimo = (u: string, i: string) => (u === BODEGA ? MIN_BODEGA : MIN_PV)[i];

const INICIAL: Record<string, Record<string, number>> = {
  [BODEGA]: { PAN: 230, SAM: 470, SRA: 60, PAP: 18000, QUE: 9500, TOC: 3100, SPI: 12000, SRO: 12500, MOS: 2400 },
  "PV Chapinero": { PAN: 34, SAM: 41, SRA: 12, PAP: 1450, QUE: 900, TOC: 520, SPI: 1300, SRO: 700, MOS: 950 },
  "PV Usaquén": { PAN: 88, SAM: 70, SRA: 25, PAP: 2600, QUE: 2100, TOC: 900, SPI: 2000, SRO: 2100, MOS: 1500 },
  "PV Salitre": { PAN: 61, SAM: 11, SRA: 20, PAP: 2200, QUE: 1600, TOC: 700, SPI: 1900, SRO: 1700, MOS: 1200 },
};

export function estadoInicial(): Estado {
  const f = "2026-10-13T06:00:00Z";
  let e: Estado = {
    movimientos: [],
    asignaciones: [],
    lotes: [
      { id: "L-PAN-1009", insumo: "PAN", vence: "2026-10-16" },
      { id: "L-SAM-0930", insumo: "SAM", vence: "2026-11-02" },
      { id: "L-SRO-0812", insumo: "SRO", vence: "2027-01-15" },
    ],
  };
  for (const u of UBICACIONES)
    for (const i of Object.keys(INICIAL[u])) {
      const tipo: TipoMov = "ENTRADA_MANUAL";
      e = registrar(e, { id: `ini-${u}-${i}`, ubicacion: u, insumo: i, tipo, cantidad: INICIAL[u][i], motivo: "Carga inicial", usuario: "admin", fecha: f });
    }
  e = registrar(e, { id: "ven-sal-1", ubicacion: "PV Salitre", insumo: "SAM", tipo: "VENTA", cantidad: -14, usuario: "oper.salitre", fecha: "2026-10-13T21:40:00Z" });
  e = despachar(
    e,
    { id: "ASG-0142", origen: BODEGA, destino: "PV Chapinero", lineas: [{ insumo: "PAN", cantidad: 80 }, { insumo: "SAM", cantidad: 50 }, { insumo: "SRO", cantidad: 1500 }] },
    "admin",
    "2026-10-14T06:10:00Z",
  );
  return e;
}
