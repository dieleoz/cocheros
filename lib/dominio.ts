// Reglas de negocio de la SPEC (R1–R10). Funciones puras: las usan la web, la PWA y, en F1, el servidor.

export type TipoMov =
  | "ENTRADA_COMPRA"
  | "ENTRADA_MANUAL"
  | "TRASLADO_SALIDA"
  | "TRASLADO_ENTRADA"
  | "VENTA"
  | "MERMA"
  | "DEVOLUCION_SALIDA"
  | "DEVOLUCION_ENTRADA"
  | "AJUSTE_CONTEO";

export interface Movimiento {
  id: string; // UUID creado en el dispositivo (sincronización idempotente)
  ubicacion: string;
  insumo: string;
  lote?: string;
  tipo: TipoMov;
  cantidad: number; // en unidad base, con signo
  ref?: string;
  motivo?: string;
  usuario: string;
  fecha: string; // ISO
}

export interface Lote {
  id: string;
  insumo: string;
  vence: string; // AAAA-MM-DD
}

export type EstadoAsig = "DESPACHADA" | "RECIBIDA" | "RECIBIDA_CON_DIFERENCIA" | "ANULADA";

export interface LineaAsig {
  insumo: string;
  lote?: string;
  enviada: number;
  recibida?: number;
}

export interface Asignacion {
  id: string;
  origen: string;
  destino: string;
  estado: EstadoAsig;
  lineas: LineaAsig[];
}

export interface Estado {
  movimientos: Movimiento[];
  asignaciones: Asignacion[];
  lotes: Lote[];
}

export class ErrorRegla extends Error {}

const CON_MOTIVO: TipoMov[] = ["ENTRADA_MANUAL", "MERMA", "DEVOLUCION_SALIDA"];

/** R1: el saldo es la suma de los movimientos. */
export function saldo(movs: Movimiento[], ubicacion: string, insumo: string, lote?: string): number {
  return movs
    .filter((m) => m.ubicacion === ubicacion && m.insumo === insumo && (lote === undefined || m.lote === lote))
    .reduce((s, m) => s + m.cantidad, 0);
}

/** R2: presentación a unidad base. */
export function aBase(cantidad: number, factorPresentacion: number): number {
  return cantidad * factorPresentacion;
}

/** R1 y sincronización: agrega un movimiento; si su id ya existe, no hace nada (idempotente). */
export function registrar(estado: Estado, mov: Movimiento): Estado {
  if (estado.movimientos.some((m) => m.id === mov.id)) return estado;
  if (CON_MOTIVO.includes(mov.tipo) && !mov.motivo?.trim()) {
    throw new ErrorRegla(`${mov.tipo} exige motivo`);
  }
  // R6: en punto de venta se acepta saldo negativo; se alerta aparte.
  return { ...estado, movimientos: [...estado.movimientos, mov] };
}

/** R3 primer paso y R5: despacha desde bodega; la mercancía queda en tránsito. */
export function despachar(
  estado: Estado,
  a: { id: string; origen: string; destino: string; lineas: { insumo: string; cantidad: number; lote?: string }[] },
  usuario: string,
  fecha: string,
): Estado {
  for (const l of a.lineas) {
    if (!(l.cantidad > 0)) throw new ErrorRegla(`Cantidad inválida para ${l.insumo}`);
    const disp = saldo(estado.movimientos, a.origen, l.insumo, l.lote);
    if (l.cantidad > disp) throw new ErrorRegla(`${l.insumo}: hay ${disp}, no se puede despachar ${l.cantidad}`);
  }
  const movs: Movimiento[] = a.lineas.map((l, k) => ({
    id: `${a.id}-S${k}`,
    ubicacion: a.origen,
    insumo: l.insumo,
    lote: l.lote,
    tipo: "TRASLADO_SALIDA",
    cantidad: -l.cantidad,
    ref: a.id,
    usuario,
    fecha,
  }));
  const asig: Asignacion = {
    id: a.id,
    origen: a.origen,
    destino: a.destino,
    estado: "DESPACHADA",
    lineas: a.lineas.map((l) => ({ insumo: l.insumo, lote: l.lote, enviada: l.cantidad })),
  };
  return { ...estado, movimientos: [...estado.movimientos, ...movs], asignaciones: [...estado.asignaciones, asig] };
}

/** R3 segundo paso: el punto confirma lo recibido; la diferencia queda marcada. */
export function recibir(estado: Estado, asigId: string, recibidas: number[], usuario: string, fecha: string): Estado {
  const a = estado.asignaciones.find((x) => x.id === asigId);
  if (!a) throw new ErrorRegla(`No existe ${asigId}`);
  if (a.estado !== "DESPACHADA") throw new ErrorRegla(`${asigId} está ${a.estado}`);
  if (recibidas.length !== a.lineas.length || recibidas.some((r) => !(r >= 0))) {
    throw new ErrorRegla("Cantidades recibidas inválidas");
  }
  const lineas = a.lineas.map((l, k) => ({ ...l, recibida: recibidas[k] }));
  const conDif = lineas.some((l) => l.recibida !== l.enviada);
  const movs: Movimiento[] = lineas
    .map((l, k) => ({
      id: `${a.id}-E${k}`,
      ubicacion: a.destino,
      insumo: l.insumo,
      lote: l.lote,
      tipo: "TRASLADO_ENTRADA" as const,
      cantidad: l.recibida,
      ref: a.id,
      usuario,
      fecha,
    }))
    .filter((m) => m.cantidad > 0);
  const nueva: Asignacion = { ...a, lineas, estado: conDif ? "RECIBIDA_CON_DIFERENCIA" : "RECIBIDA" };
  return {
    ...estado,
    movimientos: [...estado.movimientos, ...movs],
    asignaciones: estado.asignaciones.map((x) => (x.id === asigId ? nueva : x)),
  };
}

/** R8: cuánto sugerir enviar a un punto. */
export function sugeridoAsignacion(saldoPunto: number, maximo: number, saldoBodega: number): number {
  return Math.max(0, Math.min(maximo - saldoPunto, saldoBodega));
}

/** R7: cuánto pedir al proveedor; 0 si no está bajo mínimo. */
export function sugeridoReorden(p: { saldo: number; pendiente: number; minimo: number; maximo: number }): number {
  const disponible = p.saldo + p.pendiente;
  if (disponible >= p.minimo) return 0;
  return Math.max(0, p.maximo - disponible);
}

/** R4 y R10: lotes despachables de un insumo, el que vence primero adelante; los vencidos no salen. */
export function lotesFEFO(lotes: Lote[], insumo: string, hoy: string): Lote[] {
  return lotes.filter((l) => l.insumo === insumo && l.vence > hoy).sort((a, b) => a.vence.localeCompare(b.vence));
}

/** R10: lotes que vencen en los próximos `dias` (incluye vencidos). */
export function porVencer(lotes: Lote[], hoy: string, dias = 2): Lote[] {
  const limite = new Date(Date.parse(hoy) + dias * 86400000).toISOString().slice(0, 10);
  return lotes.filter((l) => l.vence <= limite);
}
