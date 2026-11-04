import { afterEach, describe, expect, it, vi } from "vitest";
import { startDisplayAdaptation } from "./display-topology";
import { readFileSync } from "node:fs";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WebView layout feedback cannot repaint forever", () => {
  it("coalesces identical ResizeObserver notifications but handles real window changes", () => {
    document.body.innerHTML = '<div class="app-shell"><div class="app-header"></div><div class="app-scroll"><div class="camera-screen"></div></div></div>';
    const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const originalHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 420 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 840 });
    const raf: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn:FrameRequestCallback) => {raf.push(fn); return raf.length;});
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const root = document.documentElement;
    const setProperty = vi.spyOn(root.style, "setProperty");
    const stop = startDisplayAdaptation();
    const original = setProperty.mock.calls.length;
    try {
      expect(original).toBeGreaterThan(0);
      for (let i = 0; i < 16; i++) {
        window.dispatchEvent(new Event("resize"));
        raf.splice(0).forEach(fn => fn(performance.now()));
      }
      expect(setProperty.mock.calls.length).toBe(original);
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 620 });
      window.dispatchEvent(new Event("resize"));
      raf.splice(0).forEach(fn => fn(performance.now()));
      expect(root.dataset["windowClass"]).toBe("medium");
      expect(setProperty.mock.calls.length).toBeGreaterThan(original);
    } finally {
      stop();
      if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
      if (originalHeight) Object.defineProperty(window, "innerHeight", originalHeight);
    }
  });
  it("compares keyboard, editor and hinge geometry rather than just outer window dimensions", () => {
    const source = readFileSync("src/lib/display-topology.ts", "utf8");
    expect(source).toContain("viewport?.offsetTop");
    expect(source).toContain("viewport?.height");
    expect(source).toContain("header?.bottom");
    expect(source).toContain("camera?.width");
    expect(source).toContain("f.leftPx,f.topPx,f.rightPx,f.bottomPx");
  });
});
