## 2026-11-05: Editor library memory optimization

The app-freeze investigation remains the sole active workstream. The two technical specifications remain paused at the checkpoint percentages.

The previous editor used `objectStore("clips").getAll()`, which read all original video Blobs into a single IndexedDB result. The editor now first loads only record keys, then fetches and analyses one original clip at a time, returning the same sorted media collection. After cancellation it frees temporary object URLs; the library connection is closed even on failures and when the user changes screens. No stored media is deleted, no recordings or controls are disabled. Existing audio waveform analysis, thumbnail generation, proxy generation, tracks and export paths remain present.

Limitations: this fixes one clear peak-memory risk; the old full-Blob `arrayBuffer()` audio analyser and long-running proxy tasks remain further performance risks. No assertion of a device-level freeze fix is warranted without the owner's logcat/diagnostic reports.
