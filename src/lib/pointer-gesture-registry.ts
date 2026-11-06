/** Owns editor pointer gestures across tab changes and lost pointerup.
 * A pointercancel, blur or unmount cancels the gesture without committing
 * a drag, and no callbacks remain attached to the old editor after exit. */
export class PointerGestureRegistry {
  private active = new Set<() => void>();
  register(move: (event: PointerEvent) => void, up: (event: PointerEvent) => void,
    onCancel?: () => void): () => void {
    let finished = false;
    const release = (cancelled: boolean) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      this.active.delete(cancel);
      if (cancelled) onCancel?.();
    };
    const cancel = () => release(true);
    const onUp = (event: PointerEvent) => {
      if (finished) return;
      release(false);
      up(event);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    this.active.add(cancel);
    return cancel;
  }
  dispose(): void {
    for (const release of [...this.active]) release();
  }
  get size(): number { return this.active.size; }
}
