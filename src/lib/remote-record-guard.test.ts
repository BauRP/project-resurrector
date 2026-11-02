import { describe, expect, it } from "vitest";
import { RemoteRecordGuard } from "./remote-record-guard";
import type { MulticamState } from "./multicam-store";

const state = (extra: Partial<MulticamState> = {}) => ({
  role: "slave", tab: "camera", captureKind: "video",
  recording: false, recordingPhase: "idle", ...extra,
}) as MulticamState;
const command = (from: string, on: boolean, at: number) =>
  ({ type: "record" as const, from, on, at });

describe("guard for director remote record commands", () => {
  it("permits a connected director to request start without pretending encoder started", () => {
    const guard = new RemoteRecordGuard();
    expect(guard.accept(command("director", true, 100), state(), true)).toEqual({
      recording: true, recordingPhase: "starting",
      recordingStartedAt: null, paused: false, captureSaveError: "",
    });
    expect(guard.accept(command("director", true, 100), state(), true)).toBeNull();
    expect(guard.accept(command("imposter", false, 101),
      state({ recording: true, recordingPhase: "recording" }), true)).toBeNull();
  });
  it("allows quick stop during startup while refusing replay and an outdated start", () => {
    const guard = new RemoteRecordGuard();
    guard.accept(command("host", true, 300), state(), true);
    expect(guard.accept(command("host", false, 301),
      state({ recording: true, recordingPhase: "starting" }), true))
      .toMatchObject({ recording: false, recordingPhase: "stopping" });
    expect(guard.accept(command("host", true, 300), state(), true)).toBeNull();
    expect(guard.accept(command("host", true, 302),
      state({ recordingPhase: "saving" }), true)).toBeNull();
  });
  it("blocks disconnected peers, unrelated roles, photos and off-camera screens", () => {
    const guard = new RemoteRecordGuard();
    for (const s of [
      state({role:"solo"}), state({role:"host"}),
      state({tab:"editor"}), state({captureKind:"photo"}),
    ]) expect(guard.accept(command("host", true, 400),s,true)).toBeNull();
    expect(guard.accept(command("host", true, 401),state(),false)).toBeNull();
    expect(guard.accept(command("host", true, 402),state(),true)).not.toBeNull();
  });
  it("accepts the next director only after the pairing context resets", () => {
    const guard=new RemoteRecordGuard();
    guard.accept(command("old",true,10),state(),true);
    expect(guard.accept(command("new",true,11),state(),true)).toBeNull();
    guard.reset();
    expect(guard.accept(command("new",true,11),state(),true))
      .toMatchObject({ recording:true, recordingPhase:"starting" });
  });
  it("retains the paired director until a deliberate reset", () => {
    const guard=new RemoteRecordGuard();
    guard.accept(command("A",true,1),state(),true);
    expect(guard.accept(command("B",true,2),state(),true)).toBeNull();
    guard.reset();
    expect(guard.accept(command("B",true,2),state(),true)).not.toBeNull();
    expect(guard.accept(command("B",false,Number.NaN),
      state({recording:true,recordingPhase:"recording"}),true)).toBeNull();
  });
});
