/** Indexed once when the timeline changes, not repeatedly at every
 * 30Hz playhead tick. This preserves selection and detached-audio routing.
 */
export interface EditorMediaLookupItem {
  id:string;
  mediaId:string;
  kind:"video"|"audio";
}
export function selectedVideoItemId(
  items:readonly EditorMediaLookupItem[], selected:string|null,
):string|null {
  return selected && items.some(i=>i.id===selected&&i.kind==="video")
    ? selected : null;
}
export function detachedAudioMediaIds(
  items:readonly EditorMediaLookupItem[],
):ReadonlySet<string> {
  const result=new Set<string>();
  for(const item of items)if(item.kind==="audio")result.add(item.mediaId);
  return result;
}
