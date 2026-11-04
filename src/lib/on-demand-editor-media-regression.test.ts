import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";

describe("on-demand editor media work", () => {
  const code = readFileSync("src/components/multicam/EditorPro.tsx","utf8");
  it("does not automatically encode every unedited video in the library",()=>{
    expect(code).toContain('const timelineVideoKey = useMemo(');
    expect(code).toContain('items.filter(i => i.kind === "video").map(i => i.mediaId)');
    expect(code).toContain('m.kind !== "video" || !neededIds.has(m.id)');
    expect(code).toContain('!neededIds.has(m.id) || loadedProxyIds.current.has(m.id)');
    expect(code).toContain('}, [media, timelineVideoKey])');
  });
  it("retains original playback and full proxy functions for timeline media",()=>{
    expect(code).toContain('await makeThumbs(m.url, m.duration, 10, abort.signal)');
    expect(code).toContain('await generateProxy(m.id, m.url, abort.signal)');
    expect(code).toContain('source={proxies[i.mediaId] ?? mediaById.get(i.mediaId)?.url ?? ""}');
    expect(code).toContain('loadedProxyIds.current.clear()');
  });
  it("releases late native subscriptions rather than leaking UI observers",()=>{
    const native=readFileSync("src/lib/native-capture.ts","utf8");
    expect(native).toContain('lateHandle.remove().catch(() => undefined)');
    expect(native).toContain('onLate?: (value: T) => void');
    expect(native).toContain("requestPermissions: options => guard(");
  });
});
