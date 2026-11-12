import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("Astra status worker cannot accumulate camera bridge timeouts",()=>{
 const java=readFileSync("android/app/src/main/java/app/lovable/multicampov/NativeCapturePlugin.java","utf8");
 it("keeps one JPEG preview and one history operation in flight",()=>{
   expect(java).toContain("previewFramePending.compareAndSet(false,true)");
   expect(java).toContain("previewFramePending.set(false)");
   expect(java).toContain("historyPending.compareAndSet(false,true)");
   expect(java).toContain("historyPending.set(false)");
 });
 it("bounds camera control reply queue without disabling existing actions",()=>{
   expect(java).toContain("MAX_STATUS_ACKS = 16");
   expect(java).toContain("pendingStatusAcks.incrementAndGet() > MAX_STATUS_ACKS");
   expect(java).toContain("pendingStatusAcks.decrementAndGet()");
   expect(java).toContain("call.resolve(NativeCaptureService.status(context))");
   expect(java).toContain("NativeCaptureService.previewFrame()");
 });
 it("preserves the existing dedicated status worker and capture operations",()=>{
   expect(java).toContain('new Thread(r, "multicam-capture-status")');
   expect(java).toContain("startPreview(PluginCall call)");
   expect(java).toContain("stop(PluginCall call)");
 });
});
