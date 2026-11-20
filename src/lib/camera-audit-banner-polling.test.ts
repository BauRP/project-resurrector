import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const banner = readFileSync("src/components/multicam/CameraAuditBanner.tsx", "utf8");
describe("Android camera audit polling", () => {
  it("only rerenders when the persisted checkpoint changes", () => {
    const step=banner.slice(banner.indexOf("const checkpoint = ["),banner.indexOf("// A vendor CameraService"));
    expect(step).toContain("if (checkpoint !== lastCheckpoint)");
    expect(step).toContain("setAudit(response.audit)");
    expect(step.indexOf("setAudit(response.audit)")).toBeGreaterThan(step.indexOf("if (checkpoint !== lastCheckpoint)"));
  });
  it("stops polling at a saved resource pause without misreporting a frozen renderer", () => {
    expect(banner).toContain('response.audit.state === "retry" || response.audit.codecState === "retry"');
    expect(banner).not.toContain("Android не отвечает на проверку.");
  });
});
