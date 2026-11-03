/** One diagnostic operation owns the camera test workflow at a time.
 * A state-render delay cannot allow RAW, EIS/OIS, two-encoder probes or
 * slow-motion to open overlapping camera sessions.
 *
 * The native Camera2 owner is separately verified just before acquisition.
 */
export type DiagnosticOperation = "mode-scan" | "raw" | "stabilization" | "dual" | "high-speed";
export interface DiagnosticLease {
  readonly operation: DiagnosticOperation;
  isCurrent(): boolean;
  release(): void;
}
export class DiagnosticCaptureGate {
  private current: symbol | null = null;
  private operation: DiagnosticOperation | null = null;

  acquire(operation: DiagnosticOperation): DiagnosticLease | null {
    if (this.current !== null) return null;
    const token = Symbol(operation);
    this.current = token;
    this.operation = operation;
    return {
      operation,
      isCurrent: () => this.current === token,
      release: () => {
        // Stale async completions may not unlock a different probe.
        if (this.current === token) {
          this.current = null;
          this.operation = null;
        }
      },
    };
  }

  activeOperation(): DiagnosticOperation | null { return this.operation; }
  reset(): void { this.current = null; this.operation = null; }
}
