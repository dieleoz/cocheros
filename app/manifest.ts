import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cocheros · Punto de venta",
    short_name: "Cocheros PV",
    description: "Recibir mercancía y registrar ventas y mermas del punto de venta.",
    start_url: "/pv",
    scope: "/",
    display: "standalone",
    background_color: "#26313a",
    theme_color: "#26313a",
    icons: [{ src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
