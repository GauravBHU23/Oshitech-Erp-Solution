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
  themeColor: "#4f46e5",
};

// Light mode is the default before first paint; the user can switch it with the theme toggle.
const THEME_SCRIPT = `document.documentElement.dataset.theme="light";`;

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
