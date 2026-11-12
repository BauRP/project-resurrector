import { describe, expect, it, vi } from "vitest";
import { createLatestProjectWriter, readAsyncProjectSnapshot } from "./async-project-persistence";

describe("Astra async project saves do not block Android navigation", () => {
  it("keeps only the latest snapshot while a previous IndexedDB operation is pending", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const writes: number[] = [];
    const writer = createLatestProjectWriter(async (n: number) => {
      writes.push(n);
      if (n === 1) await gate;
    });
    writer.enqueue(1);
    writer.enqueue(2);
    writer.enqueue(3);
    expect(writes).toEqual([1]);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(writes).toEqual([1,3]);
    writer.close();
  });
  it("drains the latest accepted project on unmount, rejecting any new edits", async () => {
    let finish!: () => void;
    const blocker = new Promise<void>(resolve => { finish = resolve; });
    const writes: number[] = [];
    const writer = createLatestProjectWriter(async (value: number) => {
      writes.push(value);
      if (value === 1) await blocker;
    });
    writer.enqueue(1);
    writer.enqueue(2);
    writer.enqueue(3);
    writer.close();
    writer.enqueue(4);
    finish();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(writes).toEqual([1, 3]);
  });
  it("never submits another IndexedDB write when the current operation hangs", async () => {
    const write = vi.fn((_value:number) => new Promise<void>(() => undefined));
    const writer=createLatestProjectWriter(write);
    writer.enqueue(1);
    for(let n=2;n<200;n++) writer.enqueue(n);
    expect(write).toHaveBeenCalledTimes(1);
    writer.close();
  });
  it("aborts a real stalled IndexedDB read transaction instead of only timing out JavaScript", async () => {
    vi.useFakeTimers();
    const abort = vi.fn();
    const close = vi.fn();
    const tx: {
      oncomplete?: () => void; onerror?: () => void; onabort?: () => void;
      error: null; abort: () => void;
      objectStore: () => { get: () => { result: undefined } };
    } = {
      error: null, abort,
      objectStore: () => ({ get: () => ({ result: undefined }) }),
    };
    const db = {
      close, onversionchange: null,
      transaction: () => tx,
      objectStoreNames: { contains: () => true },
    };
    const request: { result: typeof db; onsuccess?: () => void } = { result: db };
    vi.stubGlobal("indexedDB", {
      open: () => {
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    });
    try {
      const outcome = readAsyncProjectSnapshot().then(
        () => "resolved", () => "rejected",
      );
      await vi.advanceTimersByTimeAsync(5010);
      expect(await outcome).toBe("rejected");
      expect(abort).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("does not let an older Activity overwrite a later project in IndexedDB", async () => {
    const { writeAsyncProjectSnapshot } = await import("./async-project-persistence");
    const actual = { savedAt: 300, state: { markers: ["newer"] } };
    const put = vi.fn();
    const close = vi.fn();
    let currentSaved: unknown = actual;
    const tx = {
      oncomplete: undefined as undefined | (() => void),
      onerror: undefined as undefined | (() => void),
      onabort: undefined as undefined | (() => void),
      error: null,
      abort: vi.fn(),
      objectStore: () => ({
        get: () => {
          const request = {
            result: currentSaved,
            onsuccess: undefined as undefined | (() => void),
            onerror: undefined as undefined | (() => void),
          };
          queueMicrotask(() => request.onsuccess?.());
          return request;
        },
        put,
      }),
    };
    const db = {
      close, onversionchange: null,
      transaction: () => {
        // A readwrite transaction waits until its read finishes.
        queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
        return tx;
      },
      objectStoreNames: { contains: () => true },
    };
    const req: { result: typeof db; onsuccess?: () => void } = { result: db };
    vi.stubGlobal("indexedDB", {
      open: () => {
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    });
    try {
      await writeAsyncProjectSnapshot({ savedAt: 200, state: { markers: ["old"] } });
      expect(put).not.toHaveBeenCalled();
      currentSaved = { savedAt: 100, state: { markers: ["earlier"] } };
      await writeAsyncProjectSnapshot({ savedAt: 400, state: { markers: ["newest"] } });
      expect(put).toHaveBeenCalledTimes(1);
      expect(put).toHaveBeenCalledWith(
        { savedAt: 400, state: { markers: ["newest"] } }, "latest",
      );
      expect(close).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("handles an environment with no IndexedDB without inventing restored data", async () => {
    if (typeof indexedDB === "undefined")
      expect(await readAsyncProjectSnapshot()).toBeNull();
  });
});
