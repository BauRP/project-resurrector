import {afterEach, describe, expect, it, vi} from "vitest";
import {assertSavedClipsReadable,readPersistedClip} from "./clip-persistence";

const oldDescriptor=Object.getOwnPropertyDescriptor(globalThis,"indexedDB");
afterEach(()=>{
  vi.useRealTimers();
  if(oldDescriptor)Object.defineProperty(globalThis,"indexedDB",oldDescriptor);
  else Reflect.deleteProperty(globalThis,"indexedDB");
});

describe("read-back verification remains bounded even when Android storage hangs",()=>{
  it("fails after deadline if saved video verification never opens",async()=>{
    vi.useFakeTimers();
    const open=vi.fn(()=>({}));
    Object.defineProperty(globalThis,"indexedDB",{configurable:true,value:{open}});
    const clip={id:"stored",blob:new Blob([new Uint8Array(2048)])};
    const operation=assertSavedClipsReadable([clip as never]);
    const assertion=expect(operation).rejects.toThrow("Проверка видео не ответила");
    await vi.advanceTimersByTimeAsync(12000);
    await assertion;
    expect(open).toHaveBeenCalledOnce();
  });
  it("fails after deadline if clip retrieval never opens and does not retry",async()=>{
    vi.useFakeTimers();
    const open=vi.fn(()=>({}));
    Object.defineProperty(globalThis,"indexedDB",{configurable:true,value:{open}});
    const operation=readPersistedClip("stored");
    const assertion=expect(operation).rejects.toThrow("Чтение видео слишком долго");
    await vi.advanceTimersByTimeAsync(12000);
    await assertion;
    expect(open).toHaveBeenCalledOnce();
  });
  it("closes late IndexedDB connections rather than opening transactions",async()=>{
    vi.useFakeTimers();
    const req:Record<string,any>={result:{close:vi.fn(),transaction:vi.fn()}};
    Object.defineProperty(globalThis,"indexedDB",{configurable:true,value:{open:()=>req}});
    const operation=readPersistedClip("stored");
    const assertion=expect(operation).rejects.toThrow("Чтение видео слишком долго");
    await vi.advanceTimersByTimeAsync(12000);
    await assertion;
    req["onsuccess"]();
    expect(req.result.close).toHaveBeenCalledOnce();
    expect(req.result.transaction).not.toHaveBeenCalled();
  });
});
