import { describe, expect, it } from "vitest";
import { distinctSecondaryCameras } from "./DualCameraPreview";
const devices = [
  { deviceId: "main", label: "Camera 1" },
  { deviceId: "front", label: "Camera 2" },
  { deviceId: "front", label: "Duplicate" },
  { deviceId: "", label: "Unknown" },
  { deviceId: "macro", label: "Camera 3" },
];
describe("separate camera preview candidates", () => {
  it("does not present another camera without a primary WebView ID", () => {
    expect(distinctSecondaryCameras(devices, "")).toEqual([]);
  });
  it("omits the primary stream, duplicates and unidentified cameras", () => {
    expect(distinctSecondaryCameras(devices, "main").map(c => c.deviceId)).toEqual(["front", "macro"]);
  });
});
