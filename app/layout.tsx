import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const disp = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-disp" });
const body = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-body" });
const num = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-num" });

export const metadata: Metadata = {
  title: "Cocheros · Inventario",
  description: "Control de inventario de la franquicia Cocheros: bodega central y puntos de venta.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#26313a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" className={`${disp.variable} ${body.variable} ${num.variable}`}>
      <body>{children}</body>
    </html>
  );
}
