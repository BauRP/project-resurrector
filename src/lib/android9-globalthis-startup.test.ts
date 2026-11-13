import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

describe("Android 9 WebView 69 application entry compatibility", () => {
  const entry = readFileSync("scripts/create-capacitor-entry.mjs", "utf8");
  const verifier = readFileSync("scripts/verify-android9-bundle.mjs", "utf8");

  it("installs globalThis before importing the Capacitor app", () => {
    const match = entry.match(/<script>\s*([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(entry.indexOf("<script>")).toBeLessThan(entry.indexOf('<script type="module"'));
    const window: Record<string, unknown> = {};
    const code = match?.[1] ?? "";
    // An isolated JS environment without globalThis imitates Chrome/WebView 69.
    runInNewContext(code, { window, Object });
    expect(window.globalThis).toBe(window);
    runInNewContext(code, { window, Object });
    expect(window.globalThis).toBe(window);
  });

  it("fails the Android build if the actual emitted HTML loses the polyfill", () => {
    expect(verifier).toContain("Android 9 startup polyfill missing");
    expect(verifier).toContain("legacyScript > firstModule");
  });
});
