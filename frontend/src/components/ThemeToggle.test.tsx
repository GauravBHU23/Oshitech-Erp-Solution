// Runtime validation coverage for: light default and synchronized color theme.
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
    document.documentElement.dataset.theme = "light";
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps the current light theme despite saved or system dark preferences", () => {
    localStorage.setItem("oshitech-theme", "dark");

    act(() => root.render(<ThemeToggle />));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles the theme and synchronizes every mounted control without persisting it", () => {
    act(() => root.render(<><ThemeToggle /><ThemeToggle /></>));
    const buttons = container.querySelectorAll("button");

    act(() => buttons[0].click());

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("oshitech-theme")).toBeNull();
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");

    act(() => buttons[1].click());

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("oshitech-theme")).toBeNull();
    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
  });
});
