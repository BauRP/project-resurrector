import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

describe("Android 9 WebView 69 application entry compatibility", () => {
  const entry = readFileSync("scripts/create-capacitor-entry.mjs", "utf8");
  const verifier = readFileSync("scripts/verify-android9-bundle.mjs", "utf8");
  const legacy = readFileSync("public/legacy-globalthis.js", "utf8");

  it("loads a parser-blocking classic script before the Capacitor module", () => {
    expect(entry).toContain('<script src="/legacy-globalthis.js"></script>');
    expect(entry.indexOf('<script src="/legacy-globalthis.js">')).toBeLessThan(entry.indexOf('<script type="module"'));
    const window: Record<string, unknown> = {};
    runInNewContext(legacy, { window, Object, Promise, setTimeout });
    expect(window['globalThis']).toBe(window);
    expect(typeof window['queueMicrotask']).toBe("function");
    const shim = window['queueMicrotask'];
    runInNewContext(legacy, { window, Object, Promise, setTimeout });
    expect(window['globalThis']).toBe(window);
    expect(window['queueMicrotask']).toBe(shim);
  });

  it("schedules callbacks asynchronously on the old WebView fallback", async () => {
    const window: Record<string, unknown> = {};
    runInNewContext(legacy, { window, Object, Promise, setTimeout });
    const queue = window['queueMicrotask'] as (fn: () => void) => void;
    const received: string[] = [];
    queue(() => { received.push("microtask"); });
    expect(received).toEqual([]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(received).toEqual(["microtask"]);
  });

  it("supports Object.fromEntries for editor module initialization on WebView 69", () => {
    const legacyObject = Object.assign(function LegacyObject() {}, {
      defineProperty: Object.defineProperty,
      fromEntries: undefined as typeof Object.fromEntries | undefined,
    });
    const window: Record<string, unknown> = {};
    runInNewContext(legacy, { window, Object: legacyObject, Promise, setTimeout });
    expect(legacyObject.fromEntries).toBeTypeOf("function");
    const convert = legacyObject.fromEntries!;
    const converted = convert([["a", 7], ["b", 8], ["__proto__", "safe"]]);
    expect(converted["a"]).toBe(7);
    expect(converted["b"]).toBe(8);
    expect(Object.prototype.hasOwnProperty.call(converted, "__proto__")).toBe(true);
    expect(converted["__proto__"]).toBe("safe");
  });

  it("checks the emitted HTML and actual legacy asset before Android install", () => {
    expect(verifier).toContain("Android 9 startup polyfill missing");
    expect(verifier).toContain("legacyScript === -1 || firstModule === -1");
    expect(verifier).toContain('join(outputRoot, "legacy-globalthis.js")');
    expect(verifier).toContain("window.queueMicrotask = function");
  });
});
