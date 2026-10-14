// Escenarios E2E de la SPEC §9 sobre el dominio. Los valores esperados salen de la SPEC, no del código.
import { describe, expect, it } from "vitest";
import {
  aBase, despachar, ErrorRegla, Estado, lotesFEFO, Movimiento, recibir, registrar, saldo, sugeridoReorden,
} from "@/lib/dominio";

const B = "Bodega Central";
const A = "PV Chapinero";
const F = "2026-10-14T08:00:00Z";
const vacio = (): Estado => ({ movimientos: [], asignaciones: [], lotes: [] });
const mov = (p: Partial<Movimiento> & Pick<Movimiento, "id" | "ubicacion" | "insumo" | "tipo" | "cantidad">) =>
  ({ usuario: "t", fecha: F, ...p }) as Movimiento;

describe("requisitos", () => {
  it("E2E-1 carga, asignación, recepción y venta dan bodega 380 y punto 90", () => {
    let e = registrar(vacio(), mov({ id: "m1", ubicacion: B, insumo: "PAN", tipo: "ENTRADA_MANUAL", cantidad: 500, motivo: "carga inicial" }));
    e = despachar(e, { id: "ASG-1", origen: B, destino: A, lineas: [{ insumo: "PAN", cantidad: 120 }] }, "admin", F);
    expect(saldo(e.movimientos, A, "PAN")).toBe(0); // R3: en tránsito no suma al punto
    e = recibir(e, "ASG-1", [120], "oper", F);
    e = registrar(e, mov({ id: "v1", ubicacion: A, insumo: "PAN", tipo: "VENTA", cantidad: -30 }));
    expect(saldo(e.movimientos, B, "PAN")).toBe(380);
    expect(saldo(e.movimientos, A, "PAN")).toBe(90);
  });

  it("E2E-2 recibir 48 de 50 marca diferencia y suma 48", () => {
    let e = registrar(vacio(), mov({ id: "m1", ubicacion: B, insumo: "SAM", tipo: "ENTRADA_COMPRA", cantidad: 50 }));
    e = despachar(e, { id: "ASG-2", origen: B, destino: A, lineas: [{ insumo: "SAM", cantidad: 50 }] }, "admin", F);
    e = recibir(e, "ASG-2", [48], "oper", F);
    const a = e.asignaciones.find((x) => x.id === "ASG-2")!;
    expect(a.estado).toBe("RECIBIDA_CON_DIFERENCIA");
    expect(a.lineas[0].enviada - a.lineas[0].recibida!).toBe(2);
    expect(saldo(e.movimientos, A, "SAM")).toBe(48);
  });

  it("E2E-4 reenviar la cola de 3 ventas deja 3 movimientos, no 6", () => {
    const cola = ["u-1", "u-2", "u-3"].map((id) => mov({ id, ubicacion: A, insumo: "PAN", tipo: "VENTA", cantidad: -2 }));
    let e = vacio();
    for (let i = 0; i < 2; i++) for (const m of cola) e = registrar(e, m);
    expect(e.movimientos).toHaveLength(3);
  });

  it("E2E-6 no se despacha más de lo que hay en bodega", () => {
    const e = registrar(vacio(), mov({ id: "m1", ubicacion: B, insumo: "PAN", tipo: "ENTRADA_COMPRA", cantidad: 10 }));
    expect(() => despachar(e, { id: "X", origen: B, destino: A, lineas: [{ insumo: "PAN", cantidad: 11 }] }, "a", F))
      .toThrow(ErrorRegla);
  });

  it("E2E-7 tres paquetes de 10 son 30 unidades", () => {
    expect(aBase(3, 10)).toBe(30);
  });

  it("E2E-8 mínimo 200, saldo 150, pendiente 0, máximo 400 sugiere 250", () => {
    expect(sugeridoReorden({ saldo: 150, pendiente: 0, minimo: 200, maximo: 400 })).toBe(250);
    expect(sugeridoReorden({ saldo: 250, pendiente: 0, minimo: 200, maximo: 400 })).toBe(0);
  });

  it("E2E-9 propone primero el lote del 2026-10-20 y excluye vencidos", () => {
    const lotes = [
      { id: "L2", insumo: "SAM", vence: "2026-11-05" },
      { id: "L1", insumo: "SAM", vence: "2026-10-20" },
      { id: "L0", insumo: "SAM", vence: "2026-10-01" },
    ];
    expect(lotesFEFO(lotes, "SAM", "2026-10-14").map((l) => l.id)).toEqual(["L1", "L2"]);
  });
});

describe("comportamiento", () => {
  it("R6 una venta sin saldo en el punto se acepta y deja saldo negativo", () => {
    const e = registrar(vacio(), mov({ id: "v", ubicacion: A, insumo: "SAM", tipo: "VENTA", cantidad: -3 }));
    expect(saldo(e.movimientos, A, "SAM")).toBe(-3);
  });

  it("R1 un id repetido con otra cantidad no sobrescribe el original", () => {
    let e = registrar(vacio(), mov({ id: "x", ubicacion: A, insumo: "PAN", tipo: "VENTA", cantidad: -1 }));
    e = registrar(e, mov({ id: "x", ubicacion: A, insumo: "PAN", tipo: "VENTA", cantidad: -50 }));
    expect(saldo(e.movimientos, A, "PAN")).toBe(-1);
  });

  it("una merma sin motivo se rechaza", () => {
    expect(() => registrar(vacio(), mov({ id: "m", ubicacion: A, insumo: "PAN", tipo: "MERMA", cantidad: -1 })))
      .toThrow(ErrorRegla);
  });

  it("una asignación ya recibida no se recibe dos veces", () => {
    let e = registrar(vacio(), mov({ id: "m1", ubicacion: B, insumo: "PAN", tipo: "ENTRADA_COMPRA", cantidad: 5 }));
    e = despachar(e, { id: "ASG", origen: B, destino: A, lineas: [{ insumo: "PAN", cantidad: 5 }] }, "a", F);
    e = recibir(e, "ASG", [5], "o", F);
    expect(() => recibir(e, "ASG", [5], "o", F)).toThrow(ErrorRegla);
  });
});
