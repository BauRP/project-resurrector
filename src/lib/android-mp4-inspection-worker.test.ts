import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Android MP4 inspection does not block the UI thread", () => {
  it("runs MediaExtractor validation on a dedicated worker, retaining path security", () => {
    const code = readFileSync("android/app/src/main/java/app/lovable/multicampov/MultiCamNativePlugin.java","utf8");
    const method=code.slice(code.indexOf("public void inspectVideoFile("),code.indexOf("private static JSObject inspectRecordedFile"));
    expect(code).toContain('new Thread(task, "multicam-mp4-inspection")');
    expect(method).toContain("mp4InspectionWorker.execute(() -> {");
    expect(method).toContain("getCanonicalFile()");
    expect(method).toContain('call.reject("Доступ разрешён только к видеозаписям приложения")');
    expect(method).toContain("call.resolve(inspectRecordedFile(file))");
    expect(method).toContain("RejectedExecutionException");
    expect(code).toContain("extractor.release()");
  });
});
