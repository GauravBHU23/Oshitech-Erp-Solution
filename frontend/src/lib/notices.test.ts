import { describe, expect, it } from "vitest";
import { isNewNotice } from "./notices";

describe("isNewNotice", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");

  it("marks notices published within the last seven days as new", () => {
    expect(isNewNotice("2026-11-25", now)).toBe(true);
    expect(isNewNotice("2026-11-19", now)).toBe(true);
  });

  it("does not mark old, future-dated, or invalid notices as new", () => {
    expect(isNewNotice("2026-11-18", now)).toBe(false);
    expect(isNewNotice("2026-11-26", now)).toBe(false);
    expect(isNewNotice("not-a-date", now)).toBe(false);
    expect(isNewNotice(null, now)).toBe(false);
  });
});
