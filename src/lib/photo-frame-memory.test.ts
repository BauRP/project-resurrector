import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { addPhotoPixels, createPhotoFrameStack, finishPhotoPixels } from "./photo-stacking";

describe("full-resolution photo accumulation off the Android WebView UI thread", () => {
  it("keeps all camera exposure frames, original dimensions and JPEG quality", () => {
    const camera = readFileSync("src/components/multicam/CameraPro.tsx", "utf8");
    expect(camera).toContain("for (let k = 0; k < frames; k++)");
    expect(camera).toContain("await stack.add(frame.data)");
    expect(camera).toContain("const averaged = await stack.finish()");
    expect(camera).toContain('c.toBlob(blob => finish(blob), "image/jpeg", 0.93)');
    expect(camera).toContain("c.width = w; c.height = h");
    const worker = readFileSync("src/lib/photo-stack-worker.ts", "utf8");
    expect(worker).toContain("new Uint16Array(length) : new Uint32Array(length)");
    expect(worker).toContain("received !== count");
    expect(worker).toContain("result[i] = sum[i]! / count");
  });
  it("performs exact 40-frame full exposure averaging", () => {
    const sum = new Uint16Array(4);
    const frame = new Uint8ClampedArray([255, 80, 0, 255]);
    for (let i = 0; i < 40; i++) addPhotoPixels(sum, frame);
    expect([...sum]).toEqual([10200, 3200, 0, 10200]);
    expect([...finishPhotoPixels(sum, 40)]).toEqual([255, 80, 0, 255]);
  });
  it("uses Uint32 at more than 257 frames to prevent overflow", () => {
    const sum = new Uint32Array(4);
    const frame = new Uint8ClampedArray([255, 255, 255, 255]);
    for (let i = 0; i < 300; i++) addPhotoPixels(sum, frame);
    expect(sum[0]).toBe(76500);
    expect([...finishPhotoPixels(sum, 300)]).toEqual([255, 255, 255, 255]);
  });
  it("rejects impossible pixel sizes rather than allocating unbounded RAM", () => {
    expect(() => createPhotoFrameStack(100000001, 40)).toThrow();
    expect(() => createPhotoFrameStack(-1, 40)).toThrow();
  });
  it("rejects mismatched input dimensions", () => {
    expect(() => addPhotoPixels(new Uint16Array(5),new Uint8ClampedArray(4))).toThrow();
  });
});
