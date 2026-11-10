import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("Native freeze report identifies the real Android System WebView provider", () => {
  it("records Chromium provider and OS separately from bundled AndroidX libraries", () => {
    const monitor=readFileSync("android/app/src/main/java/app/lovable/multicampov/UiFreezeMonitor.java","utf8");
    expect(monitor).toContain("WebView.getCurrentWebViewPackage()");
    expect(monitor).toContain('append(" WebView provider: ")');
    expect(monitor).toContain('append(webView.packageName)');
    expect(monitor).toContain('append(webView.versionName == null ? "unknown" : webView.versionName)');
    expect(monitor).toContain('append(android.os.Build.VERSION.SDK_INT)');
  });
});
