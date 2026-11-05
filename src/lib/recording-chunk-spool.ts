import { RecordingIndexedChunks } from "./recording-indexed-chunks";

/**
 * OPFS-backed spool for WebView MediaRecorder dataavailable Blobs.
 *
 * When Chromium/Android WebView exposes the Origin Private File System,
 * append encoded bytes directly to a temporary app-private file. Keep only
 * the still-unwritten chunk in JS memory. Blob/File composition at stop does
 * not require loading every video byte into an ArrayBuffer.
 *
 * If OPFS is absent, spool individual Blob chunks in IndexedDB instead.
 * Older WebViews with no durable chunk storage retain the original in-memory
 * Blob workflow. Never certify bytes without a completed storage write.
 */
export class RecordingChunkSpool {
  private readonly filename: string;
  private readonly id: string;
  private writer: FileSystemWritableFileStream | null = null;
  private handle: FileSystemFileHandle | null = null;
  private root: FileSystemDirectoryHandle | null = null;
  private init: Promise<void> | null = null;
  private tail: Promise<void> = Promise.resolve();
  private fallback: Blob[] = [];
  private confirmedBytes = 0;
  private opfsFailed = false;
  private indexed: RecordingIndexedChunks | null = null;
  private indexedDisabled = false;
  private settled = false;
  private assembled: Promise<Blob> | null = null;

  constructor(id: string) {
    this.id = id;
    // The generated session identity is not user-controlled filename input.
    this.filename = "multicam-recording-" + id.replace(/[^a-zA-Z0-9_-]/g, "") + ".part";
  }

  private async initialize(): Promise<void> {
    if (this.opfsFailed || this.init) return this.init ?? Promise.resolve();
    this.init = (async () => {
      if (typeof navigator === "undefined" ||
          !navigator.storage || typeof navigator.storage.getDirectory !== "function") {
        this.opfsFailed = true;
        return;
      }
      try {
        this.root = await navigator.storage.getDirectory();
        this.handle = await this.root.getFileHandle(this.filename, { create: true });
        this.writer = await this.handle.createWritable();
      } catch {
        this.opfsFailed = true;
      }
    })();
    return this.init;
  }

  append(chunk: Blob): void {
    if (!chunk.size || this.settled) return;
    this.tail = this.tail.then(async () => {
      await this.initialize();
      if (this.opfsFailed || !this.writer) {
        if (!this.indexedDisabled) {
          this.indexed ??= new RecordingIndexedChunks(this.id);
          try {
            await this.indexed.append(chunk);
            return;
          } catch {
            // The IDB transaction did not confirm a commit. Retain this
            // chunk in memory; earlier confirmed pieces remain in IDB.
            this.indexedDisabled = true;
          }
        }
        this.fallback.push(chunk);
        return;
      }
      try {
        await this.writer.write(chunk);
        this.confirmedBytes += chunk.size;
      } catch {
        // Write may have partially succeeded. The committed prefix remains
        // authoritative; incomplete bytes after it will be ignored.
        this.opfsFailed = true;
        this.fallback.push(chunk);
      }
    }).catch(() => {
      this.opfsFailed = true;
      this.fallback.push(chunk);
    });
  }

  /** Materialize a Blob backed by OPFS + any fallback chunks. No full read. */
  finish(mime: string): Promise<Blob> {
    if (this.assembled) return this.assembled;
    this.settled = true;
    this.assembled = (async () => {
      await this.tail;
      if (this.writer) await this.writer.close();
      let prefix: Blob | null = null;
      if (this.confirmedBytes > 0) {
        if (!this.handle) throw new Error("Temporary recording file lost");
        const file = await this.handle.getFile();
        if (file.size < this.confirmedBytes)
          throw new Error("Temporary recording was truncated; original data retained");
        prefix = file.slice(0, this.confirmedBytes);
      }
      // All confirmed IndexedDB chunks were appended after the OPFS prefix
      // and before the fallback array: preserve the original byte order.
      const indexedParts = this.indexed ? await this.indexed.materialize() : [];
      return new Blob([
        ...(prefix ? [prefix] : []), ...indexedParts, ...this.fallback,
      ], { type: mime });
    })();
    return this.assembled;
  }

  /** Only remove temporary material AFTER the permanent clip is verified. */
  async clearAfterSave(): Promise<void> {
    if (!this.assembled) return;
    await this.assembled;
    this.fallback = [];
    if (this.indexed) {
      try { await this.indexed.clearAfterSave(); } catch { /* Keep original staged pieces. */ }
    }
    if (this.root && this.handle) {
      try { await this.root.removeEntry(this.filename); } catch { /* Retain safe temporary data. */ }
    }
  }
}
