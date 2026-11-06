import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const service = readFileSync("android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java", "utf8");

describe("Gallery retry must never freeze UI-facing Camera2 state lock", () => {
  it("runs durable Gallery URI commit on the dedicated state writer rather than inside STATE_LOCK", () => {
    const retry = service.slice(service.indexOf("public static boolean retryGalleryPublication("), service.indexOf("@Override public void onDestroy()", service.indexOf("public static boolean retryGalleryPublication(")));
    expect(retry).toContain("savedCommit=STATE_WRITER.submit(() ->");
    expect(retry).toContain('prefs.edit().putString("uri",uri).putString("message",message).commit()');
    expect(retry).toContain("if(!savedCommit.get())");
    expect(retry).toContain("if(stillCurrent)");
    expect(retry).toContain("savedUri=uri");
    expect(retry).toContain("NativeCaptureAuditStore.append(context,status(context))");
    const commitAt=retry.indexOf("savedCommit.get()");
    const commitSubmit=retry.indexOf("savedCommit=STATE_WRITER.submit");
    expect(commitAt).toBeGreaterThan(commitSubmit);
    expect(retry).not.toContain("if(!prefs.edit().putString");
  });
});
