import Link from "next/link";

export default function Inicio() {
  return (
    <main className="inicio">
      <h1>Cocheros</h1>
      <p>Inventario de la franquicia: bodega central y puntos de venta. Versión de demostración con datos de ejemplo
        guardados en este navegador.</p>
      <div className="opciones">
        <Link className="card" href="/admin">
          <h2>Administración</h2>
          <span className="note">Dueño de la franquicia: saldos, asignaciones a puntos, reorden y kardex.</span>
        </Link>
        <Link className="card" href="/pv">
          <h2>Punto de venta</h2>
          <span className="note">Operador: recibir mercancía y registrar ventas y mermas, también sin señal. Desde el
            celular, use «Agregar a pantalla de inicio» para instalarla.</span>
        </Link>
      </div>
    </main>
  );
}
