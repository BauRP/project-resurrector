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
      // Width-only changes preserve the existing height CSS variable.
      expect(root.style.getPropertyValue("--app-viewport-height")).toBe("840px");
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 730 });
      window.dispatchEvent(new Event("resize"));
      raf.splice(0).forEach(fn => fn(performance.now()));
      expect(root.style.getPropertyValue("--app-viewport-height")).toBe("730px");
      expect(setProperty.mock.calls.length).toBeGreaterThan(original);
    } finally {
      stop();
      if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
      if (originalHeight) Object.defineProperty(window, "innerHeight", originalHeight);
    }
  });
  it("avoids duplicate CSS writes for real tab changes with unchanged viewport", () => {
    document.body.innerHTML = '<div class="app-shell"><div class="app-header"></div><div class="app-scroll"><div class="camera-screen"></div></div></div>';
    const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const originalHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 420 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 840 });
    const raf: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { raf.push(fn); return raf.length; });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const root = document.documentElement;
    const cssWrite = vi.spyOn(root.style, "setProperty");
    const stop = startDisplayAdaptation();
    try {
      const writes = cssWrite.mock.calls.length;
      root.dataset["activeMulticamTab"] = "settings";
      window.dispatchEvent(new Event("resize"));
      raf.splice(0).forEach(fn => fn(performance.now()));
      expect(cssWrite.mock.calls.length).toBe(writes);
      // An actual height change still updates the same CSS property.
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 710 });
      window.dispatchEvent(new Event("resize"));
      raf.splice(0).forEach(fn => fn(performance.now()));
      expect(root.style.getPropertyValue("--app-viewport-height")).toBe("710px");
      expect(cssWrite.mock.calls.length).toBeGreaterThan(writes);
    } finally {
      stop();
      delete root.dataset["activeMulticamTab"];
      if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
      if (originalHeight) Object.defineProperty(window, "innerHeight", originalHeight);
    }
  });
  it("does not rewrite root datasets during repeated resize bursts with unchanged geometry", () => {
    document.body.innerHTML = '<div class="app-shell"><div class="app-header"></div><div class="app-scroll"></div></div>';
    const raf: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn:FrameRequestCallback) => {raf.push(fn);return raf.length;});
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const root = document.documentElement;
    const setAttr = vi.spyOn(root, "setAttribute");
    const stop = startDisplayAdaptation();
    try {
      const before = setAttr.mock.calls.filter(x => String(x[0]).startsWith("data-")).length;
      for(let i=0;i<30;i++) {
        window.dispatchEvent(new Event("resize"));
        raf.splice(0).forEach(fn=>fn(performance.now()));
      }
      expect(setAttr.mock.calls.filter(x => String(x[0]).startsWith("data-")).length).toBe(before);
    } finally {stop();}
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
