"use client";
// Persistencia de la demo en el navegador. En F1 se reemplaza por Supabase con la misma interfaz.
import { useCallback, useEffect, useRef, useState } from "react";
import { Estado, Movimiento } from "./dominio";
import { estadoInicial } from "./semilla";

const CLAVE = "cocheros.estado.v1";
const CLAVE_COLA = "cocheros.cola.v1";

function leer<T>(clave: string, defecto: () => T): T {
  try {
    const s = localStorage.getItem(clave);
    return s ? (JSON.parse(s) as T) : defecto();
  } catch {
    return defecto();
  }
}
function guardar(clave: string, v: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(v));
  } catch {
    /* almacenamiento bloqueado: la demo sigue en memoria */
  }
}

/** Estado compartido entre /admin y /pv del mismo navegador. */
export function useEstado() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const ref = useRef<Estado | null>(null);
  const fijar = (e: Estado) => {
    ref.current = e;
    setEstado(e);
  };
  useEffect(() => {
    fijar(leer(CLAVE, estadoInicial));
    const f = (e: StorageEvent) => e.key === CLAVE && fijar(leer(CLAVE, estadoInicial));
    window.addEventListener("storage", f);
    return () => window.removeEventListener("storage", f);
  }, []);
  /** Aplica `fn` de forma síncrona; lanza ErrorRegla si la regla lo rechaza. */
  const cambiar = useCallback((fn: (e: Estado) => Estado) => {
    const actual = leer(CLAVE, () => ref.current ?? estadoInicial());
    const sig = fn(actual);
    guardar(CLAVE, sig);
    fijar(sig);
  }, []);
  const reiniciar = useCallback(() => {
    const e = estadoInicial();
    guardar(CLAVE, e);
    guardar(CLAVE_COLA, []);
    fijar(e);
  }, []);
  return { estado, cambiar, reiniciar };
}

/** Elemento de la cola del teléfono: un movimiento, o una recepción de asignación. */
export type ItemCola =
  | { id: string; clase: "mov"; mov: Movimiento; estado: "pendiente" | "enviado" | "error"; error?: string }
  | { id: string; clase: "recepcion"; asig: string; recibidas: number[]; fecha: string; estado: "pendiente" | "enviado" | "error"; error?: string };

export function useCola() {
  const [cola, setCola] = useState<ItemCola[]>([]);
  useEffect(() => {
    setCola(leer(CLAVE_COLA, () => []));
    const f = (e: StorageEvent) => e.key === CLAVE_COLA && setCola(leer(CLAVE_COLA, () => []));
    window.addEventListener("storage", f);
    return () => window.removeEventListener("storage", f);
  }, []);
  const fijar = useCallback((c: ItemCola[]) => {
    guardar(CLAVE_COLA, c);
    setCola(c);
  }, []);
  return { cola, fijar };
}


export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, () => ((Math.random() * 16) | 0).toString(16));
}
