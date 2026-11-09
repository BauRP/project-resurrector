import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Settings privacy overlay only mounts when opened", () => {
  it("preserves the privacy dialog and exit animation but avoids an idle animation tree", () => {
    const settings = readFileSync("src/components/multicam/SettingsTab.tsx", "utf8");
    expect(settings).toContain('const [privacyMounted,setPrivacyMounted]=useState(false)');
    expect(settings).toContain('onClick={()=>{setPrivacyMounted(true);setPrivacy(true);}}');
    expect(settings).toContain('{privacyMounted && <AnimatePresence>{privacy&&<motion.div');
    expect(settings).toContain('exit={{opacity:0}}');
    expect(settings).toContain('aria-modal="true" aria-label={t.privacy}');
    expect(settings).toContain('onClick={()=>setPrivacy(false)}');
  });
});
