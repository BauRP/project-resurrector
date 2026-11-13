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
    runInNewContext(legacy, { window, Object });
    expect(window.globalThis).toBe(window);
    runInNewContext(legacy, { window, Object });
    expect(window.globalThis).toBe(window);
  });

  it("checks the emitted HTML and actual legacy asset before Android install", () => {
    expect(verifier).toContain("Android 9 startup polyfill missing");
    expect(verifier).toContain("legacyScript > firstModule");
    expect(verifier).toContain('join(outputRoot, "legacy-globalthis.js")');
  });
});
