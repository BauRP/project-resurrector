import { afterEach, describe, expect, it, vi } from "vitest";
import { grabFrames, savePhoto } from "@/components/multicam/CameraPro";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("emulator and WebView photo callback recovery", () => {
  it("does not hang if indexedDB.open never calls back", async () => {
    vi.useFakeTimers();
    const open = vi.fn(() => ({}));
    vi.stubGlobal("indexedDB", { open });
    const operation = savePhoto(new Blob(["frame"]), { mode: "single" });
    const rejected = expect(operation).rejects.toThrow("Проверьте медиатеку");
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("closes the database after a successful commit without deleting photos", async () => {
    vi.useFakeTimers();
    const tx: Record<string, any> = { objectStore: () => ({ add: vi.fn() }) };
    const db = { close: vi.fn(), transaction: vi.fn(() => tx), objectStoreNames: { contains: () => true } };
    const req: Record<string, any> = { result: db };
    vi.stubGlobal("indexedDB", { open: () => req });
    const listener = vi.fn();
    window.addEventListener("multicam-photos-changed", listener);
    try {
      const operation = savePhoto(new Blob(["frame"]), { mode: "single" });
      req.onsuccess();
      expect(db.close).not.toHaveBeenCalled();
      tx.oncomplete();
      await operation;
      expect(db.close).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener("multicam-photos-changed", listener); }
  });
  it("closes a late DB connection after the timeout", async () => {
    vi.useFakeTimers();
    const db = { close: vi.fn() };
    const req: Record<string, any> = { result: db };
    vi.stubGlobal("indexedDB", { open: () => req });
    const pending = savePhoto(new Blob(["frame"]), {});
    const rejected = expect(pending).rejects.toThrow("Проверьте медиатеку");
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    req.onsuccess();
    expect(db.close).toHaveBeenCalledTimes(1);
  });
  it("stops waiting for a lost toBlob callback without degrading quality", async () => {
    vi.useFakeTimers();
    const encode = vi.fn();
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: vi.fn(), filter: "" }),
      toBlob: encode,
    };
    const element = vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLCanvasElement);
    try {
      const photo = grabFrames({ videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement, "none", 1, 0);
      const rejected = expect(photo).rejects.toThrow("Кодирование фотографии");
      expect(encode).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.93);
      await vi.advanceTimersByTimeAsync(5000);
      await rejected;
    } finally { element.mockRestore(); }
  });
});
