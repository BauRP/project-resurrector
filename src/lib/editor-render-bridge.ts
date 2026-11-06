/** Small in-app contract: EditorPro owns actual timeline/media state while
 * ExportDrawer owns the explicit user click. No server and no fake progress.
 * Registering an editor instance never starts rendering.
 */
export interface EditorExportConfig {
  resolution: string; fps: string; aspect: string; videoCodec: string;
  audioCodec: string; bitrate: number;
}
export type EditorRenderResult = { blob: Blob; filename: string };
export type EditorRenderHandler = (
  config: EditorExportConfig, signal: AbortSignal, progress: (percent: number) => void,
) => Promise<EditorRenderResult>;

let owner: symbol | null = null;
let current: EditorRenderHandler | null = null;
export function registerEditorRender(ownerToken: symbol, handler: EditorRenderHandler): () => void {
  owner = ownerToken; current = handler;
  return () => { if (owner === ownerToken) { owner = null; current = null; } };
}
export async function renderActiveEditor(
  config: EditorExportConfig, signal: AbortSignal, onProgress: (percent: number) => void,
): Promise<EditorRenderResult> {
  if (!current) throw new Error("Редактор ещё не готов. Откройте медиатеку и добавьте видео на таймлайн.");
  if (signal.aborted) throw new Error("Экспорт отменён");
  return current(config, signal, onProgress);
}
