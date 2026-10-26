import { describe, it, expect, vi } from "vitest";
import { readUnfinishedCapture, markUnfinishedCapture, clearUnfinishedCapture } from "./capture-interruption";

describe("crash-safe capture warning", () => {
  it("does not revive a recording, only stores a bounded warning marker", () => {
    const mock = new Map<string,string>();
    vi.stubGlobal("localStorage", {
      getItem:(key:string)=>mock.get(key)??null,
      setItem:(key:string,val:string)=>void mock.set(key,val),
      removeItem:(key:string)=>void mock.delete(key),
    });
    markUnfinishedCapture("single",1000);
    expect(readUnfinishedCapture()).toEqual({kind:"single",startedAt:1000});
    clearUnfinishedCapture("single",1001);
    expect(readUnfinishedCapture()).not.toBe(null);
    clearUnfinishedCapture("single",1000);
    expect(readUnfinishedCapture()).toBe(null);
    vi.unstubAllGlobals();
  });
  it("rejects malformed marker data", () => {
    vi.stubGlobal("localStorage",{getItem:()=>JSON.stringify({kind:"fake",startedAt:-100})});
    expect(readUnfinishedCapture()).toBe(null);
    vi.unstubAllGlobals();
  });
});
