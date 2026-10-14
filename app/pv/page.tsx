"use client";
import { useCallback, useEffect, useState } from "react";
import { ErrorRegla, Estado, recibir, registrar, saldo, TipoMov } from "@/lib/dominio";
import { ItemCola, useCola, useEstado, uuid } from "@/lib/almacen";
import { INSUMOS, MIN_PV, PUNTOS } from "@/lib/semilla";

type Vista = "saldo" | "recibir" | "descargar" | "cola";
type Desc = "VENTA" | "MERMA" | "DEVOLUCION_SALIDA";
const fmt = (n: number) => n.toLocaleString("es-CO");
const ETIQ: Record<Desc, string> = { VENTA: "Venta", MERMA: "Merma", DEVOLUCION_SALIDA: "Devolución" };

/** Aplica la cola al estado del servidor. Idempotente: reenviar no duplica (E2E-4). */
function aplicar(e: Estado, cola: ItemCola[]): { e: Estado; cola: ItemCola[] } {
  let s = e;
  const nueva = cola.map((it) => {
    if (it.estado !== "pendiente") return it;
    try {
      s = it.clase === "mov" ? registrar(s, it.mov) : recibir(s, it.asig, it.recibidas, "oper", it.fecha);
      return { ...it, estado: "enviado" as const };
    } catch (x) {
      return { ...it, estado: "error" as const, error: x instanceof ErrorRegla ? x.message : String(x) };
    }
  });
  return { e: s, cola: nueva };
}

export default function PuntoDeVenta() {
  const { estado, cambiar } = useEstado();
  const { cola, fijar } = useCola();
  const [pv, setPv] = useState(PUNTOS[0]);
  const [vista, setVista] = useState<Vista>("saldo");
  const [simSinSenal, setSim] = useState(false);
  const [navOnline, setNav] = useState(true);
  const [toast, setToast] = useState("");
  const enLinea = navOnline && !simSinSenal;
  const avisar = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    setNav(navigator.onLine);
    const on = () => setNav(true), off = () => setNav(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const sincronizar = useCallback((c: ItemCola[]) => {
    const pend = c.filter((x) => x.estado === "pendiente").length;
    if (!pend) return;
    let resultado: ItemCola[] = c;
    cambiar((e) => { const r = aplicar(e, c); resultado = r.cola; return r.e; });
    fijar(resultado);
    const errores = resultado.filter((x) => x.estado === "error").length;
    avisar(errores ? `${pend - errores} enviados, ${errores} con error. Revise la cola.` : `${pend} movimientos enviados.`);
  }, [cambiar, fijar]);

  useEffect(() => { if (enLinea) sincronizar(cola); }, [enLinea]); // eslint-disable-line react-hooks/exhaustive-deps

  const encolar = (it: ItemCola) => {
    const c = [it, ...cola];
    fijar(c);
    if (enLinea) sincronizar(c);
    else avisar("Guardado en el teléfono. Se enviará al recuperar señal.");
  };

  if (!estado) return <p className="note" style={{ padding: 16 }}>Cargando…</p>;
  const pendientes = cola.filter((x) => x.estado === "pendiente");
  const saldoLocal = (i: string) =>
    saldo(estado.movimientos, pv, i) +
    pendientes.reduce((a, x) => a + (x.clase === "mov" && x.mov.ubicacion === pv && x.mov.insumo === i ? x.mov.cantidad : 0), 0);

  return (
    <div className="pv">
      <header className="pv-top">
        <h1>Cocheros</h1>
        <select aria-label="Punto de venta" value={pv} onChange={(ev) => setPv(ev.target.value)}>
          {PUNTOS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button className={`red ${enLinea ? "" : "off"}`} onClick={() => setSim(!simSinSenal)} title="Simular pérdida de señal">
          {enLinea ? "En línea" : "Sin señal"}
        </button>
      </header>
      <main className="pv-body">
        {vista === "saldo" && <Saldo saldoLocal={saldoLocal} hayPend={pendientes.length > 0} />}
        {vista === "recibir" && <Recibir e={estado} pv={pv} cola={cola} encolar={encolar} />}
        {vista === "descargar" && <Descargar pv={pv} encolar={encolar} />}
        {vista === "cola" && <Cola cola={cola} enLinea={enLinea} sincronizar={() => sincronizar(cola)} />}
      </main>
      <nav className="pv-nav">
        {([["saldo", "Mi saldo"], ["recibir", "Recibir"], ["descargar", "Descargar"], ["cola", `Cola${pendientes.length ? ` (${pendientes.length})` : ""}`]] as [Vista, string][]).map(([v, t]) => (
          <button key={v} aria-current={vista === v} onClick={() => setVista(v)}>{t}</button>
        ))}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Saldo({ saldoLocal, hayPend }: { saldoLocal: (i: string) => number; hayPend: boolean }) {
  return (
    <div className="card">
      <div className="row"><b>Saldo actual</b><span className="note">{hayPend ? "Incluye pendientes sin enviar" : "Sincronizado"}</span></div>
      <div>
        {Object.entries(INSUMOS).map(([i, n]) => {
          const v = saldoLocal(i);
          return <div className="item" key={i}><span>{n.nombre}</span><b className={v < 0 ? "bad" : v < MIN_PV[i] ? "warn" : ""}>{fmt(v)} {n.unidad}</b></div>;
        })}
      </div>
    </div>
  );
}

function Recibir({ e, pv, cola, encolar }: { e: Estado; pv: string; cola: ItemCola[]; encolar: (it: ItemCola) => void }) {
  const [rec, setRec] = useState<Record<string, string>>({});
  const enCola = new Set(cola.filter((x) => x.clase === "recepcion" && x.estado === "pendiente").map((x) => (x as { asig: string }).asig));
  const pend = e.asignaciones.filter((g) => g.destino === pv && g.estado === "DESPACHADA" && !enCola.has(g.id));
  if (!pend.length)
    return <div className="card"><b>Sin asignaciones pendientes</b><p className="note">Cuando la bodega despache, aparecerá aquí para confirmar lo recibido.</p></div>;
  return (
    <>
      {pend.map((g) => (
        <div className="card" key={g.id}>
          <div className="row"><b>{g.id}</b><span className="pill mut">en tránsito</span></div>
          <p className="note">Cuente lo que llegó y corrija si no coincide.</p>
          <div>
            {g.lineas.map((l, k) => (
              <div className="item" key={k}>
                <span>{INSUMOS[l.insumo].nombre}<br /><span className="note">Enviado {fmt(l.enviada)} {INSUMOS[l.insumo].unidad}</span></span>
                <input className="q" inputMode="numeric" aria-label={`Recibido ${INSUMOS[l.insumo].nombre}`}
                  value={rec[`${g.id}-${k}`] ?? String(l.enviada)} onChange={(ev) => setRec({ ...rec, [`${g.id}-${k}`]: ev.target.value })} />
              </div>
            ))}
          </div>
          <button className="btn pri full" onClick={() => encolar({
            id: uuid(), clase: "recepcion", asig: g.id, fecha: new Date().toISOString(), estado: "pendiente",
            recibidas: g.lineas.map((l, k) => Number(rec[`${g.id}-${k}`] ?? l.enviada)),
          })}>Confirmar recepción</button>
        </div>
      ))}
    </>
  );
}

function Descargar({ pv, encolar }: { pv: string; encolar: (it: ItemCola) => void }) {
  const [tipo, setTipo] = useState<Desc>("VENTA");
  const [ins, setIns] = useState("PAN");
  const [cant, setCant] = useState("1");
  const [mot, setMot] = useState("");
  const [err, setErr] = useState("");
  const ok = () => {
    const c = Number(cant);
    if (!(c > 0)) return setErr("La cantidad debe ser mayor que cero.");
    if (tipo !== "VENTA" && !mot.trim()) return setErr("Escriba el motivo de la merma o devolución.");
    setErr("");
    const t: TipoMov = tipo;
    encolar({ id: uuid(), clase: "mov", estado: "pendiente", mov: {
      id: uuid(), ubicacion: pv, insumo: ins, tipo: t, cantidad: -c, motivo: mot.trim() || undefined, usuario: "oper", fecha: new Date().toISOString(),
    } });
    setMot("");
  };
  return (
    <div className="card">
      <b>Registrar descarga</b>
      <div className="seg">
        {(Object.keys(ETIQ) as Desc[]).map((x) => <button key={x} className="btn" aria-pressed={tipo === x} onClick={() => setTipo(x)}>{ETIQ[x]}</button>)}
      </div>
      <label className="campo">Insumo
        <select value={ins} onChange={(ev) => setIns(ev.target.value)}>
          {Object.entries(INSUMOS).map(([i, n]) => <option key={i} value={i}>{n.nombre} ({n.unidad})</option>)}
        </select>
      </label>
      <label className="campo">Cantidad<input inputMode="numeric" value={cant} onChange={(ev) => setCant(ev.target.value)} /></label>
      {tipo !== "VENTA" && <label className="campo">Motivo (obligatorio)<input value={mot} placeholder="Ej.: paquete roto" onChange={(ev) => setMot(ev.target.value)} /></label>}
      {err && <p className="note bad">{err}</p>}
      <button className="btn pri full" onClick={ok}>Registrar {ETIQ[tipo].toLowerCase()}</button>
      <p className="note">Con recetas (M7) se registrará «2 perros especiales» y se descontarán pan, salchicha, salsas y papa.</p>
    </div>
  );
}

function Cola({ cola, enLinea, sincronizar }: { cola: ItemCola[]; enLinea: boolean; sincronizar: () => void }) {
  const pend = cola.filter((x) => x.estado === "pendiente").length;
  return (
    <div className="card">
      <div className="row"><b>Cola de sincronización</b><span className={`pill ${pend ? "warn" : "ok"}`}>{pend} pendientes</span></div>
      <div>
        {cola.length ? cola.slice(0, 50).map((x) => (
          <div className="item" key={x.id}>
            <span>
              {x.clase === "mov" ? `${ETIQ[x.mov.tipo as Desc] ?? x.mov.tipo} · ${INSUMOS[x.mov.insumo].nombre} ${fmt(-x.mov.cantidad)}` : `Recepción ${x.asig}`}
              <br /><span className="note">{x.id.slice(0, 8)}{x.error ? ` · ${x.error}` : ""}</span>
            </span>
            <span className={`pill ${x.estado === "enviado" ? "ok" : x.estado === "error" ? "bad" : "warn"}`}>{x.estado}</span>
          </div>
        )) : <p className="note">No hay movimientos en la cola.</p>}
      </div>
      <button className="btn pri full" disabled={!enLinea || !pend} onClick={sincronizar}>
        {enLinea ? "Sincronizar ahora" : "Sin señal: se enviará al reconectar"}
      </button>
      <p className="note">Cada movimiento lleva un identificador único creado en el teléfono; reenviar no duplica.</p>
    </div>
  );
}
