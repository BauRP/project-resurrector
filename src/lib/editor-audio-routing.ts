/**
 * Deduplicate the audio decoder of an original video that is already being
 * displayed by a live <video> element. A silent scrubbing proxy still needs
 * the independent ORIGINAL audio <audio> element, as do hidden videos and
 * detached tracks. This policy never drops sound or discards original media.
 */
export interface EditorAudioRoutingClip {
  id:string;
  mediaId:string;
  reverse?:boolean;
}
export interface AudibleEditorClip {
  id:string;
  kind:"video"|"audio";
}
export function sharedEditorVideoAudioIds(
  visible:readonly EditorAudioRoutingClip[],
  audible:readonly AudibleEditorClip[],
  proxies:Readonly<Record<string,string>>,
):ReadonlySet<string> {
  const audibleVideos=new Set(audible.filter(i=>i.kind==="video").map(i=>i.id));
  return new Set(
    visible.filter(i => !i.reverse && audibleVideos.has(i.id) &&
      !proxies[i.mediaId]).map(i=>i.id)
  );
}
