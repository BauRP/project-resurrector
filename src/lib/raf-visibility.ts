/** Three consecutive responsive RAF callbacks can identify Android WebViews
 * that report hidden even while still displaying real frames. Sparse callbacks
 * from real background pages do not authorize GPU readback.
 */
export function responsiveHiddenFrameGuard(maxGapMs = 350, stableFrames = 3) {
  let last: number | null = null;
  let count = 0;
  return (time: number, hidden: boolean): boolean => {
    if (!hidden) { last = time; count = 0; return true; }
    if (last !== null && time > last && time - last <= maxGapMs) count++;
    else count = 1;
    last = time;
    return count >= stableFrames;
  };
}
