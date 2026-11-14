import { selectEditorClipDuration } from "./editor-media-duration";

/**
 * Save the REAL finite duration only when a user imports video/audio.
 * Opening the same 30-minute / one-hour / two-hour file later can then use
 * metadata from IndexedDB without initializing another WebView decoder.
 * Probe reads no Blob bytes and never transcodes, trims or changes the file.
 * Unsupported codecs, old Chromium and timeouts fall back to normal import.
 */
export async function probeEditorImportDuration(
  original: Blob,
  kind: "video" | "audio",
  timeoutMs = 3000,
): Promise<number | null> {
  if(typeof document==="undefined" || !original.size ||
     !Number.isFinite(timeoutMs) || timeoutMs <= 0) return null;
  let url: string | null = null;
  let element: HTMLMediaElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    url = URL.createObjectURL(original);
    element = document.createElement(kind === "video" ? "video" : "audio");
    const media = element;
    media.preload = "metadata";
    media.muted = true;
    return await new Promise<number | null>((resolve)=>{
      let finished = false;
      const finish=()=>{
        if(finished)return;
        finished=true;
        resolve(selectEditorClipDuration(media.duration));
      };
      const fail=()=>{
        if(finished)return;
        finished=true;
        resolve(null);
      };
      timer=setTimeout(fail,timeoutMs);
      media.onloadedmetadata=finish;
      media.ondurationchange=()=>{if(selectEditorClipDuration(media.duration)!==null)finish();};
      media.onerror=fail;
      try {
        media.src = url!;
        media.load();
      } catch { fail(); }
    });
  }catch{return null;}
  finally{
    if(timer!==null)clearTimeout(timer);
    if(element){
      element.onloadedmetadata=null;
      element.ondurationchange=null;
      element.onerror=null;
      try{element.pause();element.removeAttribute("src");element.load();}
      catch{/* WebView is closing the import decoder. */}
    }
    if(url!==null)URL.revokeObjectURL(url);
  }
}
