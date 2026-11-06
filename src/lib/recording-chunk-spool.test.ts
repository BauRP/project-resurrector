import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { RecordingChunkSpool, MAX_UNSPOOLED_BYTES } from "./recording-chunk-spool";

afterEach(() => vi.unstubAllGlobals());

function chunk(n: number): Blob {
  return new Blob(["x".repeat(n)], { type: "video/webm" });
}

describe("MediaRecorder recording chunk spool", () => {
  it("saves every chunk in order using the compatible Blob fallback without OPFS", async () => {
    vi.stubGlobal("navigator", { storage: undefined });
    const spool = new RecordingChunkSpool("single-fallback");
    spool.append(chunk(1024));
    spool.append(chunk(2048));
    const result = await spool.finish("video/webm");
    expect(result.size).toBe(3072);
    expect(result.type).toBe("video/webm");
    expect(await spool.finish("video/webm")).toBe(result);
    await spool.clearAfterSave();
  });

  it("streams into OPFS and removes only a successfully saved temporary file", async () => {
    const stored: Blob[] = [];
    const writes = vi.fn(async (data: Blob) => { stored.push(data); });
    const close = vi.fn(async () => undefined);
    const removeEntry = vi.fn(async () => undefined);
    const handle = {
      createWritable: async () => ({ write: writes, close }),
      getFile: async () => new Blob(stored, {type:"application/octet-stream"}),
    };
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => ({
      getFileHandle: async () => handle, removeEntry,
    }) } });
    const spool = new RecordingChunkSpool("dual-front");
    spool.append(chunk(512));
    spool.append(chunk(1024));
    const output = await spool.finish("video/webm");
    expect(output.size).toBe(1536);
    expect(writes).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
    expect(removeEntry).not.toHaveBeenCalled();
    await spool.clearAfterSave();
    expect(removeEntry).toHaveBeenCalledOnce();
  });

  it("preserves a successfully written file prefix and spills later chunks to memory after a write error", async () => {
    const stored: Blob[] = [];
    const writer = {
      write: vi.fn(async (part: Blob) => {
        if (stored.length > 0) throw Error("disk quota exhausted");
        stored.push(part);
      }),
      close: vi.fn(async () => undefined),
    };
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => ({
      getFileHandle: async () => ({
        createWritable: async () => writer,
        getFile: async () => new Blob(stored),
      }),
      removeEntry: async () => undefined,
    }) } });
    const spool = new RecordingChunkSpool("quota");
    spool.append(chunk(1024));
    spool.append(chunk(2048));
    spool.append(chunk(512));
    expect((await spool.finish("video/webm")).size).toBe(3584);
    expect(writer.write).toHaveBeenCalledTimes(2);
  });

  it("does not reorder chunks when OPFS write fails in the middle of a recording", async () => {
    const persisted: Blob[] = [];
    let writes = 0;
    const getDirectory = vi.fn(async () => ({
      getFileHandle: async () => ({
        createWritable: async () => ({
          write: async (piece: Blob) => {
            writes++;
            if (writes > 1) throw new Error("quota reached");
            persisted.push(piece);
          },
          close: async () => undefined,
        }),
        getFile: async () => new Blob(persisted),
      }),
      removeEntry: async () => undefined,
    }));
    vi.stubGlobal("navigator", {storage: {getDirectory}});
    const indexed = vi.fn();
    vi.stubGlobal("indexedDB", {open: indexed});
    const spool = new RecordingChunkSpool("ordered");
    spool.append(new Blob(["first"]));
    spool.append(new Blob(["second"]));
    spool.append(new Blob(["third"]));
    const data = await spool.finish("video/webm");
    const result = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(data);
    });
    expect(result).toBe("firstsecondthird");
    expect(indexed).not.toHaveBeenCalled();
  });

  it("leaves the temporary file intact when a recording is not confirmed saved", async () => {
    const removeEntry = vi.fn();
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => ({
      getFileHandle: async () => ({
        createWritable: async () => ({write: async (_part: Blob) => {}, close: async () => {}}),
        getFile: async () => chunk(1024),
      }),
      removeEntry,
    }) } });
    const spool = new RecordingChunkSpool("interrupted");
    spool.append(chunk(1024));
    expect((await spool.finish("video/webm")).size).toBe(1024);
    expect(removeEntry).not.toHaveBeenCalled();
  });

  it("warns exactly once when a legacy device cannot spool and its emergency RAM buffer fills", async () => {
    vi.stubGlobal("navigator", { storage: undefined });
    vi.stubGlobal("indexedDB", undefined);
    const spool = new RecordingChunkSpool("no-spool");
    const stop = vi.fn();
    spool.onMemoryPressure(stop);
    const nominal = new Blob(["minimal"]);
    Object.defineProperty(nominal, "size", {value: MAX_UNSPOOLED_BYTES});
    spool.append(nominal);
    spool.append(new Blob(["more"]));
    await spool.finish("video/webm");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("never duplicates an emergency-memory fragment when the recorder stop callback throws", async () => {
    vi.stubGlobal("navigator", {storage: undefined});
    vi.stubGlobal("indexedDB", undefined);
    const spool = new RecordingChunkSpool("on-pressure-throws");
    spool.onMemoryPressure(() => { throw new Error("OEM recorder already closed"); });
    const big = new Blob(["original"]);
    Object.defineProperty(big, "size", {value: MAX_UNSPOOLED_BYTES});
    spool.append(big);
    const result = await spool.finish("video/webm");
    // The mock size forces the pressure threshold; only ONE piece survives.
    expect(result.size).toBe(8);
  });

  it("rejects indefinite OPFS writes instead of leaving the capture stuck in saving", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {storage: {getDirectory: async () => ({
      getFileHandle: async () => ({
        createWritable: async () => ({
          write: async () => new Promise<void>(() => {}),
          close: async () => undefined,
        }),
      }),
      removeEntry: async () => undefined,
    })}});
    const spool = new RecordingChunkSpool("stalled-disk");
    spool.append(new Blob(["encoded"]));
    const result = expect(spool.finish("video/webm")).rejects.toThrow("Pending recording chunks: timeout");
    await vi.advanceTimersByTimeAsync(20010);
    await result;
    vi.useRealTimers();
  });
  it("cannot leave an already saved recording stuck during OPFS cleanup", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => ({
      getFileHandle: async () => ({
        createWritable: async () => ({
          write: async () => undefined,
          close: async () => undefined,
        }),
        getFile: async () => new Blob(["saved"]),
      }),
      removeEntry: async () => new Promise<void>(() => {}),
    }) } });
    const spool = new RecordingChunkSpool("cleanup-timeout");
    spool.append(new Blob(["saved"]));
    await spool.finish("video/webm");
    const cleanup = spool.clearAfterSave();
    await vi.advanceTimersByTimeAsync(8010);
    await expect(cleanup).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("uses the same spool for single and simultaneous two-camera recording", () => {
    const single = readFileSync("src/components/multicam/CameraTab.tsx","utf8");
    const dual = readFileSync("src/lib/dual-live-recording.ts","utf8");
    expect(single).toContain("spool.append(event.data)");
    expect(single).toContain("spool.onMemoryPressure(");
    expect(single).toContain("await spool.finish(mime)");
    expect(single).toContain("void spool.clearAfterSave()");
    expect(dual).toContain("spools[i]!.append(e.data)");
    expect(dual).toContain("spool.onMemoryPressure(");
    expect(dual).toContain("await spool.finish(mime)");
    expect(dual).toContain("await saveRecordedClipsAtomically(clips)");
    expect(dual).toContain("spool.clearAfterSave()");
  });
});
