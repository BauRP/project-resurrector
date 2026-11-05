import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { RecordingChunkSpool } from "./recording-chunk-spool";

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

  it("uses the same spool for single and simultaneous two-camera recording", () => {
    const single = readFileSync("src/components/multicam/CameraTab.tsx","utf8");
    const dual = readFileSync("src/lib/dual-live-recording.ts","utf8");
    expect(single).toContain("spool.append(event.data)");
    expect(single).toContain("await spool.finish(mime)");
    expect(single).toContain("void spool.clearAfterSave()");
    expect(dual).toContain("spools[i]!.append(e.data)");
    expect(dual).toContain("await spool.finish(mime)");
    expect(dual).toContain("await saveRecordedClipsAtomically(clips)");
    expect(dual).toContain("spool.clearAfterSave()");
  });
});
