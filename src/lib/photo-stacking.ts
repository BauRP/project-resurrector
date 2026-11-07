/** Exact full-resolution accumulation for night and long-exposure photos.
 * CPU pixel loops run in a dedicated Web Worker where supported. Never drop
 * a frame, change dimensions, or degrade the original photo quality.
 */
export function addPhotoPixels(sum: Uint16Array | Uint32Array, pixels: Uint8ClampedArray, from = 0, until = pixels.length): void {
  if (sum.length !== pixels.length) throw new Error("Несовпадение размеров кадров");
  for (let i = from; i < until; i++) sum[i]! += pixels[i]!;
}
export function finishPhotoPixels(sum: Uint16Array | Uint32Array, frameCount: number): Uint8ClampedArray {
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 100000) throw new Error("Invalid photo frame count");
  const output = new Uint8ClampedArray(sum.length);
  for (let i = 0; i < sum.length; i++) output[i] = sum[i]! / frameCount;
  return output;
}
export interface PhotoFrameStack {
  add(pixels: Uint8ClampedArray): Promise<void>;
  finish(): Promise<Uint8ClampedArray>;
  dispose(): void;
}
const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function inlineStack(pixelCount: number, frameCount: number, signal?: AbortSignal): PhotoFrameStack {
  let sums: Uint16Array | Uint32Array = frameCount <= 257
    ? new Uint16Array(pixelCount) : new Uint32Array(pixelCount);
  let disposed = false;
  const assertLive = () => {
    if (disposed || signal?.aborted) throw new Error("Обработка фотографии отменена");
  };
  let received = 0;
  return {
    async add(pixels) {
      assertLive();
      if (pixels.length !== pixelCount || received >= frameCount)
        throw new Error("Неполный кадр фотосерии");
      for (let start = 0; start < pixelCount; start += 262144) {
        assertLive();
        addPhotoPixels(sums, pixels, start, Math.min(pixelCount, start + 262144));
        await yieldToUi();
      }
      received++;
    },
    async finish() {
      assertLive();
      if (received !== frameCount) throw new Error("Фотосерия не содержит все кадры");
      const output = new Uint8ClampedArray(pixelCount);
      for (let start = 0; start < pixelCount; start += 262144) {
        assertLive();
        for (let i = start; i < Math.min(pixelCount, start + 262144); i++)
          output[i] = sums[i]! / frameCount;
        await yieldToUi();
      }
      return output;
    },
    dispose() { disposed = true; sums = new Uint16Array(0); },
  };
}

type Reply = { id: number; buffer?: ArrayBuffer; error?: string };
type Pending = { resolve: (value: ArrayBuffer | null) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Transfer frame buffers to a worker instead of allocating an additional
 * 33 MiB per full-resolution frame on the JavaScript UI thread.
 */
export function createPhotoFrameStack(pixelCount: number, frameCount: number, signal?: AbortSignal): PhotoFrameStack {
  if (!Number.isSafeInteger(pixelCount) || pixelCount <= 0 || pixelCount > 100000000 ||
      !Number.isInteger(frameCount) || frameCount < 2 || frameCount > 100000)
    throw new Error("Размер или количество кадров фотографии недоступны устройству");
  if (typeof Worker === "undefined") return inlineStack(pixelCount, frameCount, signal);
  let worker: Worker;
  try { worker = new Worker(new URL("./photo-stack-worker.ts", import.meta.url), { type: "module" }); }
  catch { return inlineStack(pixelCount, frameCount, signal); }

  let disposed = false;
  let nextId = 0;
  const pending = new Map<number, Pending>();
  const failAll = (reason: string) => {
    for (const [id, wait] of pending) {
      clearTimeout(wait.timer);
      wait.reject(new Error(reason));
      pending.delete(id);
    }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    failAll("Обработка фотографии отменена");
    signal?.removeEventListener("abort", dispose);
  };
  signal?.addEventListener("abort", dispose, { once: true });
  if (signal?.aborted) dispose();
  worker.addEventListener("error", () => {
    failAll("Фоновая обработка фотографии завершилась с ошибкой");
    dispose();
  });
  worker.addEventListener("message", (event: MessageEvent<Reply>) => {
    const response = event.data;
    const wait = pending.get(response.id);
    if (!wait) return;
    pending.delete(response.id);
    clearTimeout(wait.timer);
    if (response.error) wait.reject(new Error(response.error));
    else wait.resolve(response.buffer ?? null);
  });
  const send = (type: "start" | "frame" | "finish", pixels?: Uint8ClampedArray): Promise<ArrayBuffer | null> => {
    if (disposed || signal?.aborted) return Promise.reject(new Error("Обработка фотографии отменена"));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Фоновая обработка фотографии не ответила"));
        dispose();
      }, 8000);
      pending.set(id, { resolve, reject, timer });
      try {
        if (pixels) {
          const buffer = pixels.byteOffset === 0 &&
            pixels.buffer instanceof ArrayBuffer &&
            pixels.byteLength === pixels.buffer.byteLength
              ? pixels.buffer : pixels.slice().buffer;
          worker.postMessage({ id, type, pixelCount, frameCount, buffer }, [buffer]);
        } else worker.postMessage({ id, type, pixelCount, frameCount });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
        dispose();
      }
    });
  };
  const ready = send("start");
  void ready.catch(() => undefined);
  return {
    async add(pixels) {
      await ready;
      if (pixels.length !== pixelCount) throw new Error("Несовпадение размеров кадров");
      await send("frame", pixels);
    },
    async finish() {
      await ready;
      const result = await send("finish");
      if (!result || result.byteLength !== pixelCount)
        throw new Error("Не удалось получить полный обработанный кадр");
      return new Uint8ClampedArray(result);
    },
    dispose,
  };
}
