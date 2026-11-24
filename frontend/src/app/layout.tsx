import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth";
import FormValidationGuard from "@/components/FormValidationGuard";
import { PwaRegister } from "@/components/PwaInstall";
import ThemeToggle from "@/components/ThemeToggle";
import Toaster from "@/components/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oshitech Education ERP | One connected school workspace",
  description: "Manage academics, teachers, students, attendance, ID cards and examinations in one connected, role based education ERP.",
  applicationName: "Oshitech ERP",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Oshitech ERP", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

// Theme ko first paint se pehle set karta hai, taaki dark mode me white flash na aaye
// aur jin pages par toggle button nahi hai wahan bhi sahi theme lage.
const THEME_SCRIPT = `(function(){try{var k="oshitech-theme",s=localStorage.getItem(k),m=window.matchMedia("(prefers-color-scheme: dark)");var apply=function(){var v=localStorage.getItem(k);var d=v?v==="dark":m.matches;document.documentElement.dataset.theme=d?"dark":"light";};apply();m.addEventListener&&m.addEventListener("change",function(){if(!localStorage.getItem(k)){apply();window.dispatchEvent(new Event("oshitech:theme-change"));}});}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AuthProvider><FormValidationGuard /><PwaRegister />{children}<div className="theme-toggle-floating no-print"><ThemeToggle /></div><Toaster /></AuthProvider>
      </body>
    </html>
  );
}
