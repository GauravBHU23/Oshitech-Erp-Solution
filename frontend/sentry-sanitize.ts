import type { Event } from "@sentry/nextjs";

export function sanitizeSentryEvent<T extends Event>(event: T): T {
  const request = event.request;
  if (!request) return event;

  delete request.cookies;
  delete request.data;
  delete request.query_string;
  if (typeof request.url === "string") {
    request.url = request.url.split("?", 1)[0];
  }
  if (request.headers) {
    request.headers = Object.fromEntries(
      Object.entries(request.headers).filter(
        ([name]) => !["authorization", "cookie", "set-cookie", "x-csrftoken"].includes(name.toLowerCase()),
      ),
    );
  }
  return event;
}
