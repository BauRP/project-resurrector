/** WebView and Camera2 enumeration finish out of order after fold, hotplug,
 * permission prompts or Activity recreation. Only the latest discovery may
 * replace visible camera candidates or native lens descriptions.
 */
export class CameraDiscoveryEpoch {
  private revision = 0;
  begin(): number { return ++this.revision; }
  valid(revision: number): boolean { return revision === this.revision; }
  invalidate(): void { this.revision++; }
}
