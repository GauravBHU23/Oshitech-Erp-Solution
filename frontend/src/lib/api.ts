/* eslint-disable @typescript-eslint/no-explicit-any */
// Sab requests same-origin /api/v1/... par jati hain (Nginx in production, Next proxy in dev).
// Auth httpOnly cookies me hai; JS ko token kabhi nahi dikhta.
const BASE = "/api/v1";
export const NGROK_SKIP_BROWSER_WARNING_HEADERS = {
  "ngrok-skip-browser-warning": "true",
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

function getCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

async function ensureCsrf() {
  if (!getCookie("csrftoken")) {
    await fetch(`${BASE}/auth/csrf/`, {
      credentials: "include",
      headers: NGROK_SKIP_BROWSER_WARNING_HEADERS,
    });
  }
}

function flatten(data: any): string {
  if (!data) return "Something went wrong. Please try again.";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(flatten).join(" ");
  if (typeof data === "object") {
    if (data.detail) return flatten(data.detail);
    return Object.entries(data)
      .map(([k, v]) => (k === "non_field_errors" ? flatten(v) : `${k}: ${flatten(v)}`))
      .join(" | ");
  }
  return String(data);
}

function friendly(status: number, message: string) {
  if (status === 403 && /permission|credentials/i.test(message)) return "You do not have permission to do this.";
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (status >= 500) return "The server had a problem. Please try again in a moment.";
  return message;
}

function notifyError(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("oshitech:toast", { detail: { id: Date.now() + Math.random(), kind: "error", message } }));
}

async function doRefresh(): Promise<boolean> {
  const sendRefresh = async () => {
    try {
      await ensureCsrf();
      const r = await fetch(`${BASE}/auth/refresh/`, {
        method: "POST",
        credentials: "include",
        headers: {
          ...NGROK_SKIP_BROWSER_WARNING_HEADERS,
          "X-CSRFToken": getCookie("csrftoken"),
        },
      });
      return r.ok;
    } catch {
      return false;
    }
  };

  // Refresh tokens rotate. Serialize tabs so two keep-alive requests cannot
  // race, blacklist the same refresh token and clear each other's cookies.
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("oshitech-auth-refresh", sendRefresh);
  }
  return sendRefresh();
}

let refreshing: Promise<boolean> | null = null;
function refresh() {
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; retried?: boolean; silent?: boolean } = {}
): Promise<T> {
  const method = opts.method ?? "GET";
  const unsafe = method !== "GET";
  if (unsafe) await ensureCsrf();

  const headers: Record<string, string> = { ...NGROK_SKIP_BROWSER_WARNING_HEADERS };
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
  if (opts.body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (unsafe) headers["X-CSRFToken"] = getCookie("csrftoken");

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      cache: "no-store",
      credentials: "include",
      headers,
      body: opts.body === undefined ? undefined : isFormData ? opts.body as FormData : JSON.stringify(opts.body),
    });
  } catch {
    const offline = new ApiError(0, "Could not reach the server. Check your internet connection and try again.");
    if (unsafe && !opts.silent) notifyError(offline.message);
    throw offline;
  }

  // Access token expire hua: ek baar refresh karke dobara try
  if (res.status === 401 && !opts.retried && !path.startsWith("/auth/login/")) {
    if (await refresh()) return api<T>(path, { ...opts, retried: true });
    // A missing session on the initial /me check is normal; it is not an expired login.
    if (!path.startsWith("/auth/me/")) window.dispatchEvent(new Event("auth:expired"));
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const error = new ApiError(res.status, friendly(res.status, flatten(data)), data);
    // Save / delete / action fail ho to user ko turant toast me batao
    if (unsafe && !opts.silent && !path.startsWith("/auth/refresh/")) notifyError(error.message);
    throw error;
  }
  return data as T;
}
