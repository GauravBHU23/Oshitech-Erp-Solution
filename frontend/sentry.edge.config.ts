import * as Sentry from "@sentry/nextjs";
import { sanitizeSentryEvent } from "./sentry-sanitize";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0,
  beforeSend: sanitizeSentryEvent,
});
