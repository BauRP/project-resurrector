import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra native DeviceMetrics timeout queue", () => {
 const java=readFileSync("android/app/src/main/java/app/lovable/multicampov/DeviceMetricsPlugin.java","utf8");
 it("never queues repeated native readings while a previous request still runs",()=>{
   expect(java).toContain("AtomicBoolean readInFlight");
   expect(java).toContain("readInFlight.compareAndSet(false, true)");
   expect(java).toContain("readInFlight.set(false);");
   expect(java).toContain("worker.execute(() -> {");
 });
 it("keeps real battery and storage monitoring, returning last real readings",()=>{
   expect(java).toContain("Intent.ACTION_BATTERY_CHANGED");
   expect(java).toContain("fs.getAvailableBytes()");
   expect(java).toContain("lastBattery = percent;");
   expect(java).toContain("lastStorageMB = storageMB;");
   expect(java).toContain("call.resolve(cachedMetrics());");
 });
});
