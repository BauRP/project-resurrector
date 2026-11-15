/** Foreground editor gestures must take priority over disposable video jobs.
 * Pointer hover is not a gesture: don't postpone thumbnails just because a
 * mouse moves over the page. Android dragging and touch scrolling, however,
 * stay active until the final pointerup/touchend.
 */
export const EDITOR_ACTIVE_INPUT_EVENTS = [
  "pointerdown", "pointermove", "keydown", "wheel", "touchstart", "touchmove",
] as const;

export function isEditorActiveInput(event: Event): boolean {
  if (event.type !== "pointermove") return true;
  const pointer = event as PointerEvent;
  return (typeof pointer.buttons === "number" && pointer.buttons > 0) ||
    pointer.pointerType === "touch";
}
