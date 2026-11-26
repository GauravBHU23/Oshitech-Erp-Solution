
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { withSentryConfig } = require("@sentry/nextjs/config");
const API = (process.env.API_URL || "http://localhost:8000").replace(/\/+$/, "");
const isProd = process.env.NODE_ENV === "production";

const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://sdk.cashfree.com",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://*.cashfree.com https://*.ingest.sentry.io",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://*.cashfree.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.cashfree.com",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow your website domain during development
  allowedDevOrigins: ["oshitech.in", "*.oshitech.in"],

  // Optional: alag build folder (jaise dev server chalte hue production build test karna)
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // File tracing misses @sentry/server-runtime-injection's dynamic import; force-include it.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@sentry/server-runtime-injection/**"],
  },

  env: {
    NEXT_PUBLIC_SITE_BUILD_DATE: new Date().toISOString(),
  },

  eslint: { ignoreDuringBuilds: true },

  poweredByHeader: false,

  // Django URLs me trailing slash zaroori hai, isliye Next ko slash hatane na dein
  skipTrailingSlashRedirect: true,
  async rewrites() {
    // Keep every browser API request same-origin; set API_URL for local or tunneled backends.
    return [
      {
        source: "/api/:path*",
        destination: `${API}/api/:path*/`,
      },
    ];
  },

  async headers() {
    const base = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];

    if (isProd) {
      base.push({ key: "Content-Security-Policy", value: csp });
      base.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }

    return [{ source: "/:path*", headers: base }];
  },
};

export default withSentryConfig(nextConfig, { silent: true });
