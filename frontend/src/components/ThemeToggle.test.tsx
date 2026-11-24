// Runtime validation coverage for: persistent, synchronized color theme.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "./ThemeToggle";

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

describe("ThemeToggle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("applies a saved preference when mounted", () => {
    localStorage.setItem("oshitech-theme", "dark");

    act(() => root.render(<ThemeToggle />));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("persists a toggle and synchronizes every mounted control", () => {
    act(() => root.render(<><ThemeToggle /><ThemeToggle /></>));
    const buttons = container.querySelectorAll("button");

    act(() => buttons[0].click());

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("oshitech-theme")).toBe("dark");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");

    act(() => buttons[1].click());

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("oshitech-theme")).toBe("light");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
  });
});
