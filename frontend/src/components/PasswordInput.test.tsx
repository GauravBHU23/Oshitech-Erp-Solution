import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PasswordInput from "./PasswordInput";

describe("PasswordInput", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("toggles password visibility without changing the value", () => {
    act(() => root.render(<PasswordInput aria-label="Password" value="test-password" readOnly />));

    const input = container.querySelector("input");
    expect(input?.type).toBe("password");
    expect(input?.value).toBe("test-password");

    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Show password"]')?.click());
    expect(input?.type).toBe("text");
    expect(container.querySelector('[aria-label="Hide password"]')).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Hide password"]')?.click());
    expect(input?.type).toBe("password");
    expect(input?.value).toBe("test-password");
  });
});
