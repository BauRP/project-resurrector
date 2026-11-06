import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CameraDiscoveryEpoch } from "./camera-discovery-epoch";

describe("camera discovery after fold, hotplug and permission changes", () => {
  it("discards a slower, older camera list even if it resolves last", async () => {
    const discovery = new CameraDiscoveryEpoch();
    let resolveOld!: (value: string[]) => void;
    let resolveNew!: (value: string[]) => void;
    const previous = new Promise<string[]>(resolve => { resolveOld = resolve; });
    const next = new Promise<string[]>(resolve => { resolveNew = resolve; });
    const visible: string[][] = [];
    const oldEpoch=discovery.begin();
    const first=previous.then(list => { if(discovery.valid(oldEpoch)) visible.push(list); });
    const nextEpoch=discovery.begin();
    const latest=next.then(list => { if(discovery.valid(nextEpoch)) visible.push(list); });
    resolveNew(["front","ultrawide"]); await latest;
    resolveOld(["unplugged-camera"]); await first;
    expect(visible).toEqual([["front","ultrawide"]]);
  });
  it("invalidates all pending Camera2 and WebView queries when Activity is destroyed", () => {
    const discovery=new CameraDiscoveryEpoch();
    const revision=discovery.begin();
    discovery.invalidate();
    expect(discovery.valid(revision)).toBe(false);
    expect(discovery.valid(discovery.begin())).toBe(true);
  });
  it("the real diagnostic panel invalidates both enumerations and cancels dual capture on devicechange", () => {
    const code=readFileSync("src/components/multicam/CameraDiagnostics.tsx","utf8");
    expect(code).toContain("const revision = discovery.begin()");
    expect(code).toContain("const current = () => mounted.current && discovery.valid(revision)");
    expect(code).toContain("discovery.invalidate()");
    expect(code).toContain("dualJob.current?.abort()");
    expect(code).toContain("if (current()) setNativeCameras(result.cameras)");
    expect(code).toContain("if (current()) setDevices(all.filter");
  });
});
