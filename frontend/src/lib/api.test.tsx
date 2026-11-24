import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("API requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds the Ngrok browser-warning bypass header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"status":"ok"}',
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/health/")).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/health/",
      expect.objectContaining({
        headers: expect.objectContaining({
          "ngrok-skip-browser-warning": "true",
        }),
      })
    );
  });
});
