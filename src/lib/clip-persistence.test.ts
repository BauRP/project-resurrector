import { describe, expect, it, vi } from "vitest";
import { persistedClipMatches, sampledClipBytesMatch, saveRecordedClipsAtomically } from "./clip-persistence";

describe("video persistence evidence", () => {
  const blob = new Blob([new Uint8Array(2048)], { type: "video/webm" });
  const expected = { id: "real-clip-id", blob };
  it("accepts read-back of the same video ID, size and MIME type", () => {
    expect(persistedClipMatches(expected, { ...expected })).toBe(true);
  });
  it("rejects missing or corrupted saved media without deleting original blobs", () => {
    expect(persistedClipMatches(expected, null)).toBe(false);
    expect(persistedClipMatches(expected, { ...expected, id: "different" })).toBe(false);
    expect(persistedClipMatches(expected, { ...expected, blob: new Blob([new Uint8Array(100)], { type: "video/webm" }) })).toBe(false);
    expect(persistedClipMatches(expected, { ...expected, blob: new Blob([new Uint8Array(2048)], { type: "video/mp4" }) })).toBe(false);
  });
});

describe("bounded persisted-byte sampling (not full-file integrity)", () => {
  const payload = new Uint8Array(8192).map((_, index) => index % 251);
  const media = (data: Uint8Array) => new Blob([data.slice().buffer], {type:"video/webm"});
  it("accepts equal bytes without loading an entire long video", async () => {
    expect(await sampledClipBytesMatch(media(payload),media(payload))).toBe(true);
  });
  it("detects same-sized corruption in middle, start and end samples", async () => {
    for (const at of [0, 4096, 8191]) {
      const changed = payload.slice(); changed[at] = (changed[at] ?? 0) ^ 0xff;
      expect(await sampledClipBytesMatch(media(payload),media(changed))).toBe(false);
    }
  });
  it("does not accept matching bytes with a different media MIME", async () => {
    expect(await sampledClipBytesMatch(media(payload),new Blob([payload.slice().buffer],{type:"video/mp4"}))).toBe(false);
  });
});

describe("non-destructive video persistence policy", () => {
  it("rejects duplicate IDs within an atomic group before any storage access", async () => {
    const saved=Object.getOwnPropertyDescriptor(globalThis,"indexedDB");
    const open=vi.fn();
    Object.defineProperty(globalThis,"indexedDB",{configurable:true,value:{open}});
    try {
      const clip={id:"same-id",createdAt:1,camera:1,mode:"video",
        profile:"standard",playbackRate:1,blob:new Blob([new Uint8Array(2048)])};
      await expect(saveRecordedClipsAtomically([clip,clip])).rejects.toThrow("Повторяющиеся");
      expect(open).not.toHaveBeenCalled();
    } finally {
      if(saved) Object.defineProperty(globalThis,"indexedDB",saved);
      else Reflect.deleteProperty(globalThis,"indexedDB");
    }
  });
  it("uses add-only operations rather than replacing a previously saved video", async () => {
    const saved=Object.getOwnPropertyDescriptor(globalThis,"indexedDB");
    const add=vi.fn();
    const put=vi.fn();
    const db={close:vi.fn(),objectStoreNames:{contains:()=>true},
      transaction:vi.fn(()=>transaction)};
    const transaction: {oncomplete?:()=>void; onabort?:()=>void; onerror?:()=>void;
      error?: {name:string}; objectStore:()=>{add:typeof add;put:typeof put}} = {
      objectStore:()=>({add,put}),
    };
    const request: {result:typeof db;onsuccess?:()=>void;onerror?:()=>void;
      onupgradeneeded?:()=>void;onblocked?:()=>void}={result:db};
    Object.defineProperty(globalThis,"indexedDB",{configurable:true,value:{open:()=>request}});
    try {
      const clip={id:"already-present",createdAt:1,camera:1,mode:"video",
        profile:"standard",playbackRate:1,blob:new Blob([new Uint8Array(2048)])};
      const pending=saveRecordedClipsAtomically([clip]);
      request.onsuccess?.();
      expect(add).toHaveBeenCalledWith(clip);
      expect(put).not.toHaveBeenCalled();
      transaction.error={name:"ConstraintError"};
      transaction.onabort?.();
      await expect(pending).rejects.toThrow("уже существует");
    } finally {
      if(saved) Object.defineProperty(globalThis,"indexedDB",saved);
      else Reflect.deleteProperty(globalThis,"indexedDB");
    }
  });
});
