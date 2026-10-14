"use client";
import { useMemo, useState } from "react";
import { despachar, ErrorRegla, Estado, porVencer, saldo, sugeridoAsignacion, sugeridoReorden } from "@/lib/dominio";
import { useEstado } from "@/lib/almacen";
import { BODEGA, INSUMOS, MAX_BODEGA, MAX_PV, MIN_BODEGA, minimo, PUNTOS, UBICACIONES } from "@/lib/semilla";

type Vista = "tablero" | "asignar" | "reorden" | "kardex";
const HOY = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString("es-CO");
const fecha = (iso: string) => iso.replace("T", " ").slice(0, 16);

function alertas(e: Estado): [string, string][] {
  const a: [string, string][] = [];
  for (const u of UBICACIONES)
    for (const i of Object.keys(INSUMOS)) {
      const v = saldo(e.movimientos, u, i);
      const n = INSUMOS[i];
      if (v < 0) a.push(["bad", `${u}: ${n.nombre} en ${fmt(v)} ${n.unidad}. Venta registrada sin saldo (R6), revisar.`]);
      else if (v < minimo(u, i)) a.push(["warn", `${u}: ${n.nombre} ${fmt(v)} ${n.unidad}, mínimo ${fmt(minimo(u, i))}.`]);
    }
  for (const g of e.asignaciones) {
    if (g.estado === "RECIBIDA_CON_DIFERENCIA")
      g.lineas.filter((l) => l.recibida !== l.enviada).forEach((l) =>
        a.push(["bad", `${g.id} a ${g.destino}: ${INSUMOS[l.insumo].nombre} enviado ${fmt(l.enviada)}, recibido ${fmt(l.recibida ?? 0)}.`]));
    if (g.estado === "DESPACHADA") a.push(["mut", `${g.id} en tránsito hacia ${g.destino}.`]);
  }
  for (const l of porVencer(e.lotes, HOY())) a.push(["warn", `Lote ${l.id} (${INSUMOS[l.insumo].nombre}) vence el ${l.vence} (R10).`]);
  return a;
}

function Tablero({ e }: { e: Estado }) {
  const al = alertas(e);
  return (
    <>
      <div className="row"><h2>Tablero</h2><span className="note">Saldo = suma del kardex (R1)</span></div>
      <div className="kpis">
        <div className="kpi"><span>Puntos de venta</span><b>{PUNTOS.length}</b></div>
        <div className="kpi"><span>En tránsito</span><b>{e.asignaciones.filter((g) => g.estado === "DESPACHADA").length}</b></div>
        <div className="kpi"><span>Avisos</span><b className="warn">{al.filter((x) => x[0] === "warn").length}</b></div>
        <div className="kpi"><span>Requieren revisión</span><b className="bad">{al.filter((x) => x[0] === "bad").length}</b></div>
      </div>
      <div className="card">
        <h3>Alertas</h3>
        <ul className="alertas">
          {al.map((x, k) => (
            <li key={k}><span className={`pill ${x[0]}`}>{x[0] === "bad" ? "Revisar" : x[0] === "warn" ? "Aviso" : "Info"}</span>{x[1]}</li>
          ))}
        </ul>
      </div>
      <div className="tbl">
        <table>
          <thead><tr><th>Insumo</th><th>Unidad</th>{UBICACIONES.map((u) => <th key={u} className="n">{u}</th>)}</tr></thead>
          <tbody>
            {Object.entries(INSUMOS).map(([i, n]) => (
              <tr key={i}>
                <td>{n.nombre}</td><td className="mut">{n.unidad}</td>
                {UBICACIONES.map((u) => {
                  const v = saldo(e.movimientos, u, i);
                  return <td key={u} className={`n ${v < 0 ? "bad" : v < minimo(u, i) ? "warn" : ""}`}>{fmt(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Asignar({ e, cambiar, avisar }: { e: Estado; cambiar: (f: (e: Estado) => Estado) => void; avisar: (m: string) => void }) {
  const [dest, setDest] = useState(PUNTOS[0]);
  const [cant, setCant] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const sug = (i: string) => sugeridoAsignacion(saldo(e.movimientos, dest, i), MAX_PV[i], saldo(e.movimientos, BODEGA, i));
  const enviar = () => {
    const lineas = Object.keys(INSUMOS)
      .map((i) => ({ insumo: i, cantidad: Number(cant[i] ?? sug(i)) }))
      .filter((l) => l.cantidad !== 0);
    if (!lineas.length) return setErr("Indique al menos una cantidad.");
    const id = `ASG-${String(143 + e.asignaciones.length - 1).padStart(4, "0")}`;
    try {
      cambiar((s) => despachar(s, { id, origen: BODEGA, destino: dest, lineas }, "admin", new Date().toISOString()));
      setErr(""); setCant({});
      avisar(`${id} despachada a ${dest}. Queda en tránsito hasta que el punto la reciba.`);
    } catch (x) {
      setErr(x instanceof ErrorRegla ? `${x.message} (R5).` : String(x));
    }
  };
  return (
    <>
      <div className="row">
        <h2>Nueva asignación</h2>
        <label className="campo">Destino
          <select value={dest} onChange={(ev) => { setDest(ev.target.value); setCant({}); }}>
            {PUNTOS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <p className="note">Sugerido = máximo del punto − saldo del punto, limitado por la bodega (R8).</p>
      <div className="tbl">
        <table>
          <thead><tr><th>Insumo</th><th className="n">Saldo punto</th><th className="n">Máximo</th><th className="n">Bodega</th><th className="n">Sugerido</th><th className="n">A enviar</th></tr></thead>
          <tbody>
            {Object.entries(INSUMOS).map(([i, n]) => (
              <tr key={i}>
                <td>{n.nombre} <span className="mut">({n.unidad})</span></td>
                <td className="n">{fmt(saldo(e.movimientos, dest, i))}</td>
                <td className="n">{fmt(MAX_PV[i])}</td>
                <td className="n">{fmt(saldo(e.movimientos, BODEGA, i))}</td>
                <td className="n">{fmt(sug(i))}</td>
                <td className="n"><input className="q" id={`a-${i}`} inputMode="numeric" value={cant[i] ?? String(sug(i))}
                  onChange={(ev) => setCant({ ...cant, [i]: ev.target.value })} aria-label={`A enviar ${n.nombre}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row"><span className="note bad">{err}</span><button className="btn pri" onClick={enviar}>Despachar asignación</button></div>
      <h3>Asignaciones</h3>
      <div className="tbl">
        <table>
          <thead><tr><th>Id</th><th>Destino</th><th>Estado</th><th>Líneas</th></tr></thead>
          <tbody>
            {[...e.asignaciones].reverse().map((g) => (
              <tr key={g.id}>
                <td>{g.id}</td><td>{g.destino}</td>
                <td><span className={`pill ${g.estado === "RECIBIDA" ? "ok" : g.estado === "DESPACHADA" ? "mut" : "bad"}`}>{g.estado.replaceAll("_", " ").toLowerCase()}</span></td>
                <td>{g.lineas.map((l) => `${INSUMOS[l.insumo].nombre} ${fmt(l.enviada)}${l.recibida !== undefined && l.recibida !== l.enviada ? ` → ${fmt(l.recibida)}` : ""}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Reorden({ e }: { e: Estado }) {
  const filas = Object.keys(INSUMOS)
    .map((i) => ({ i, s: saldo(e.movimientos, BODEGA, i), p: sugeridoReorden({ saldo: saldo(e.movimientos, BODEGA, i), pendiente: 0, minimo: MIN_BODEGA[i], maximo: MAX_BODEGA[i] }) }))
    .filter((f) => f.p > 0);
  return (
    <>
      <div className="row"><h2>Reorden</h2><span className="note">Sugerido = máximo − (saldo + pendiente), si está bajo mínimo (R7)</span></div>
      <div className="tbl">
        <table>
          <thead><tr><th>Insumo</th><th className="n">Saldo bodega</th><th className="n">Pendiente</th><th className="n">Mínimo</th><th className="n">Máximo</th><th className="n">Pedir</th><th>Proveedor</th></tr></thead>
          <tbody>
            {filas.length ? filas.map(({ i, s, p }) => (
              <tr key={i}>
                <td>{INSUMOS[i].nombre}</td><td className="n warn">{fmt(s)}</td><td className="n">0</td>
                <td className="n">{fmt(MIN_BODEGA[i])}</td><td className="n">{fmt(MAX_BODEGA[i])}</td>
                <td className="n"><b>{fmt(p)}</b> {INSUMOS[i].unidad}</td><td>{INSUMOS[i].proveedor}</td>
              </tr>
            )) : <tr><td colSpan={7} className="mut">Ningún insumo bajo mínimo.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">Pedidos a proveedor (W5) y pedido desde reorden (W12) entran con la base de datos (F1–F2).</p>
    </>
  );
}

function Kardex({ e }: { e: Estado }) {
  const movs = useMemo(() => [...e.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha)), [e]);
  const csv = () => {
    const filas = [["fecha", "ubicacion", "insumo", "tipo", "cantidad", "referencia", "usuario"],
      ...movs.map((m) => [m.fecha, m.ubicacion, m.insumo, m.tipo, String(m.cantidad), m.ref ?? m.motivo ?? "", m.usuario])];
    const url = URL.createObjectURL(new Blob([filas.map((f) => f.map((c) => `"${c.replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "kardex-cocheros.csv" }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="row"><h2>Kardex</h2><button className="btn" onClick={csv}>Exportar CSV</button></div>
      <p className="note">Los movimientos no se editan ni se borran (R1); un error se corrige con un movimiento contrario.</p>
      <div className="tbl">
        <table>
          <thead><tr><th>Fecha</th><th>Ubicación</th><th>Insumo</th><th>Tipo</th><th className="n">Cantidad</th><th>Referencia</th><th>Usuario</th></tr></thead>
          <tbody>
            {movs.slice(0, 300).map((m) => (
              <tr key={m.id}>
                <td className="mut">{fecha(m.fecha)}</td><td>{m.ubicacion}</td><td>{INSUMOS[m.insumo]?.nombre ?? m.insumo}</td><td>{m.tipo}</td>
                <td className={`n ${m.cantidad < 0 ? "bad" : "ok"}`}>{m.cantidad > 0 ? "+" : ""}{fmt(m.cantidad)}</td>
                <td>{m.ref ?? m.motivo ?? "—"}</td><td className="mut">{m.usuario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Admin() {
  const { estado, cambiar, reiniciar } = useEstado();
  const [vista, setVista] = useState<Vista>("tablero");
  const [toast, setToast] = useState("");
  const avisar = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };
  const nav: [Vista, string][] = [["tablero", "Tablero"], ["asignar", "Asignaciones"], ["reorden", "Reorden"], ["kardex", "Kardex"]];
  return (
    <div className="web">
      <nav className="side">
        <div className="marca">Cocheros</div>
        {nav.map(([v, t]) => <button key={v} aria-current={vista === v} onClick={() => setVista(v)}>{t}</button>)}
        <div className="pie">
          <span>Superadministrador · demo</span>
          <a href="/pv">Abrir punto de venta</a>
          <button onClick={() => { reiniciar(); avisar("Datos de ejemplo restablecidos."); }}>Restablecer datos de ejemplo</button>
        </div>
      </nav>
      <main className="main">
        {!estado ? <p className="note">Cargando…</p>
          : vista === "tablero" ? <Tablero e={estado} />
          : vista === "asignar" ? <Asignar e={estado} cambiar={cambiar} avisar={avisar} />
          : vista === "reorden" ? <Reorden e={estado} />
          : <Kardex e={estado} />}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
