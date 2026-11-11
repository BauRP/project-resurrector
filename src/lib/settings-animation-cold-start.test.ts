import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Android Settings animations do not compete with initial first paint", () => {
  it("keeps Framer Motion out of synchronous Settings and Help modules", () => {
    const settings=readFileSync("src/components/multicam/SettingsTab.tsx","utf8");
    const help=readFileSync("src/components/multicam/Help.tsx","utf8");
    expect(settings).not.toContain('from "framer-motion"');
    expect(help).not.toContain('from "framer-motion"');
    expect(settings).toContain('lazy(() => import("./SettingsPrivacyDialog")');
    expect(help).toContain('lazy(() => import("./HelpOverlay")');
    const overlay=readFileSync("src/components/multicam/HelpOverlay.tsx","utf8");
    expect(overlay).toContain("createPortal(");
    expect(overlay).toContain("exit={{ opacity: 0 }}");
    const privacy=readFileSync("src/components/multicam/SettingsPrivacyDialog.tsx","utf8");
    expect(privacy).toContain('aria-modal="true"');
    expect(privacy).toContain('activateAccessibleDialog(dialog.current, onClose)');
  });
});
