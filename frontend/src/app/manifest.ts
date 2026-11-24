import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Oshitech Education ERP",
    short_name: "Oshitech ERP",
    description: "School & college ERP: students, teachers, attendance, exams, admit cards, ID cards and results.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f6f7fb",
    theme_color: "#4f46e5",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dashboard", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Attendance", url: "/attendance", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "ID Cards", url: "/id-cards", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
