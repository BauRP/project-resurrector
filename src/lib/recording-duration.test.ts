import { describe, expect, it } from "vitest";
import { CaptureDurationClock } from "./recording-duration";

describe("confirmed single-camera capture duration", () => {
  it("does not use delayed encoder finalization as recording time", () => {
    const clock = new CaptureDurationClock();
    clock.startedAt(1000);
    clock.stopRequestedAt(61000);
    expect(clock.durationMs()).toBe(60000);
  });
  it("excludes confirmed pauses, including stop while paused", () => {
    const clock = new CaptureDurationClock();
    clock.startedAt(1000);
    clock.pausedAtTime(10000);
    clock.resumedAt(30000);
    clock.pausedAtTime(50000);
    clock.stopRequestedAt(60000);
    expect(clock.durationMs()).toBe(29000);
  });
  it("does not invent duration when start or stop was never observed", () => {
    const clock = new CaptureDurationClock();
    expect(clock.durationMs()).toBe(null);
    clock.stopRequestedAt(5000);
    expect(clock.durationMs()).toBe(null);
  });
  it("rejects missing, reversed and duplicated lifecycle callbacks", () => {
    const clock = new CaptureDurationClock();
    clock.startedAt(2000);
    clock.pausedAtTime(1000);
    clock.stopRequestedAt(30000);
    expect(clock.durationMs()).toBe(null);
    const second = new CaptureDurationClock();
    second.startedAt(2000);
    second.startedAt(2001);
    second.stopRequestedAt(30000);
    expect(second.durationMs()).toBe(null);
  });
  it("does not invent duration from a paused stream without a stop request", () => {
    const clock = new CaptureDurationClock();
    clock.startedAt(100);
    clock.pausedAtTime(300);
    expect(clock.durationMs()).toBe(null);
  });
});
