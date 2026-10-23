import { describe, expect, it } from "vitest";
import { calculateDisplayRegions, windowClass, type DisplayTopology } from "./display-topology";

const topology = (features: DisplayTopology["foldingFeatures"]): DisplayTopology => ({
  widthPx: 1200, heightPx: 900, widthDp: 600, heightDp: 450,
  density: 2, revision: 1, posture: "reported", source: "test",
  foldingFeatures: features,
});
const hinge = (left: number, right: number, occlusion = "FULL") => ({
  leftPx: left, rightPx: right, topPx: 0, bottomPx: 900,
  orientation: "VERTICAL", state: "FLAT", occlusion, separating: true,
});

describe("adaptive window classes", () => {
  it("bases classes on usable logical CSS width rather than physical screen pixels", () => {
    expect(windowClass(360)).toBe("compact");
    expect(windowClass(600)).toBe("medium");
    expect(windowClass(839)).toBe("medium");
    expect(windowClass(840)).toBe("expanded");
    expect(windowClass(1200)).toBe("large");
    expect(windowClass(1600)).toBe("extra-large");
  });
});
describe("multi-hinge topology", () => {
  it("preserves no fold when Android reports no fold", () => {
    expect(calculateDisplayRegions(topology([]), 600, 450).regions).toHaveLength(1);
  });
  it("separates physical screen gaps without placing content inside hinge pixels", () => {
    const result = calculateDisplayRegions(topology([hinge(590,610)]),600,450);
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0]?.width).toBe(295);
    expect(result.regions[1]?.left).toBe(305);
    expect(result.occluded).toBe(true);
  });
  it("supports two actual Android hinge bounds for tri-fold devices", () => {
    const result = calculateDisplayRegions(topology([hinge(390,410), hinge(790,810)]),600,450);
    expect(result.regions).toHaveLength(3);
  });
  it("never fabricates extra hinges from a physical three-panel screen resolution", () => {
    const result = calculateDisplayRegions(topology([hinge(390,410)]),600,450);
    expect(result.regions).toHaveLength(2);
  });
  it("does not invent an occlusion gap on a flexible crease", () => {
    const result = calculateDisplayRegions(topology([hinge(600,600, "NONE")]),600,450);
    expect(result.occluded).toBe(false);
    expect(result.regions).toHaveLength(2);
  });
});
