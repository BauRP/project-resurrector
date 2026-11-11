import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Settings privacy overlay only mounts when opened", () => {
  it("preserves the privacy dialog and exit animation but avoids an idle animation tree", () => {
    const settings = readFileSync("src/components/multicam/SettingsTab.tsx", "utf8");
    expect(settings).toContain('const [privacyMounted,setPrivacyMounted]=useState(false)');
    expect(settings).toContain('onClick={()=>{setPrivacyMounted(true);setPrivacy(true);}}');
    expect(settings).toContain('const SettingsPrivacyDialog = lazy(() => import("./SettingsPrivacyDialog")');
    expect(settings).toContain('{privacyMounted && <Suspense fallback={null}><SettingsPrivacyDialog');
    expect(settings).not.toContain('from "framer-motion"');
    const privacy = readFileSync("src/components/multicam/SettingsPrivacyDialog.tsx", "utf8");
    expect(privacy).toContain('exit={{opacity:0}}');
    expect(privacy).toContain('aria-modal="true" aria-label={title}');
    expect(privacy).toContain('onClick={onClose}');
    expect(privacy).toContain('activateAccessibleDialog(dialog.current, onClose)');
  });
});
