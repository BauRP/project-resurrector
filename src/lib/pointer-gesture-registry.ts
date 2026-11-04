/** Owns editor pointer gestures across tab changes and lost pointerup.
 * A pointercancel, blur or unmount cancels the gesture without committing
 * a drag, and no callbacks remain attached to the old editor after exit. */
export class PointerGestureRegistry {
  private active = new Set<() => void>();
  register(move: (event: PointerEvent) => void, up: (event: PointerEvent) => void): () => void {
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("blur", cleanup);
      this.active.delete(cleanup);
    };
    const onUp = (event: PointerEvent) => {
      if (finished) return;
      cleanup();
      up(event);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("blur", cleanup);
    this.active.add(cleanup);
    return cleanup;
  }
  dispose(): void {
    for (const release of [...this.active]) release();
  }
  get size(): number { return this.active.size; }
}
