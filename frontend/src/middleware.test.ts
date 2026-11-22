import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const request = (path: string) => new NextRequest(`http://localhost${path}`);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("maintenance middleware", () => {
  it("redirects frontend pages to the maintenance screen when enabled", () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");

    const response = middleware(request("/dashboard"));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost/maintenance");
  });

  it.each(["/maintenance", "/support", "/api/v1/auth/me/", "/_next/static/app.js", "/logo.svg"])(
    "keeps %s accessible while maintenance is enabled",
    (path) => {
      vi.stubEnv("MAINTENANCE_MODE", "true");

      const response = middleware(request(path));

      expect(response?.headers.get("x-middleware-next")).toBe("1");
    }
  );

  it("does not redirect when maintenance mode is disabled", () => {
    vi.stubEnv("MAINTENANCE_MODE", "false");

    const response = middleware(request("/dashboard"));

    expect(response?.headers.get("x-middleware-next")).toBe("1");
  });
});
