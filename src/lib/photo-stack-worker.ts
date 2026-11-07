export {}; // Worker is a module; avoid colliding with the DOM global `length`.
/** Off-main-thread exact photo accumulation: 4K/long exposure worker. */
type StackRequest = { id: number; type: "start" | "frame" | "finish";
  pixelCount: number; frameCount: number; buffer?: ArrayBuffer };
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<StackRequest>) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
let sum: Uint16Array | Uint32Array | null = null;
let count = 0, length = 0, received = 0;
workerScope.onmessage = ({ data }) => {
  try {
    if (data.type === "start") {
      length = data.pixelCount;
      count = data.frameCount;
      if (!Number.isSafeInteger(length) || length <= 0 || length > 100000000 ||
          !Number.isInteger(count) || count < 2 || count > 100000)
        throw new Error("Некорректный размер фотосерии");
      sum = count <= 257 ? new Uint16Array(length) : new Uint32Array(length);
      received = 0;
      workerScope.postMessage({ id: data.id });
      return;
    }
    if (!sum) throw new Error("Фотосерия не подготовлена");
    if (data.type === "frame") {
      if (!data.buffer || data.buffer.byteLength !== length || received >= count)
        throw new Error("Неполный кадр фотосерии");
      const frame = new Uint8ClampedArray(data.buffer);
      for (let i = 0; i < length; i++) sum[i]! += frame[i]!;
      received++;
      workerScope.postMessage({ id: data.id });
      return;
    }
    if (received !== count) throw new Error("Фотосерия не содержит все кадры");
    const result = new Uint8ClampedArray(length);
    for (let i = 0; i < length; i++) result[i] = sum[i]! / count;
    sum = null;
    workerScope.postMessage({ id: data.id, buffer: result.buffer }, [result.buffer]);
  } catch (error) {
    workerScope.postMessage({ id: data.id,
      error: error instanceof Error ? error.message : String(error) });
  }
};
