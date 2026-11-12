import { describe, expect, it } from "vitest";
import { emptyCapabilityMatrix, loadMatrix } from "./capabilities";

describe("Astra restored camera matrix typed-array corruption", () => {
  const save = (v: unknown) => localStorage.setItem("multicam-capability-matrix", JSON.stringify(v));
  it("accepts a genuine unavailable camera matrix", () => {
    const matrix=emptyCapabilityMatrix();
    save(matrix);
    expect(loadMatrix()?.rear.available).toBe(false);
  });
  it("rejects forged objects inside arrays, leaving original bytes unchanged", () => {
    const matrix=emptyCapabilityMatrix();
    const corrupted={...matrix,rear:{...matrix.rear,resolutions:[{width:1920}]}};
    save(corrupted);
    expect(loadMatrix()).toBeNull();
    expect(JSON.parse(localStorage.getItem("multicam-capability-matrix")!).rear.resolutions[0])
      .toEqual({width:1920});
  });
  it("rejects malformed nested native camera profiles", () => {
    const matrix=emptyCapabilityMatrix();
    save({...matrix,hardwareCameras:[{cameraId:17}]});
    expect(loadMatrix()).toBeNull();
  });
  it("rejects nonfinite camera numbers and wrong permissions", () => {
    const matrix=emptyCapabilityMatrix();
    save({...matrix,front:{...matrix.front,maxFps:-1}});
    expect(loadMatrix()).toBeNull();
    save({...matrix,permissions:{...matrix.permissions,camera:42}});
    expect(loadMatrix()).toBeNull();
  });
});
