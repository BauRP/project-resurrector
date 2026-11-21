import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static regression checks for the native checkpoint contract. These verify
// wiring and failure handling; runtime/HAL behavior still needs Android tests.
const dir="android/app/src/main/java/app/lovable/multicampov/";
const service=readFileSync(dir+"CameraAuditService.java","utf8");
const plugin=readFileSync(dir+"CameraAuditPlugin.java","utf8");
const codec=readFileSync(dir+"CameraAuditCodecStage.java","utf8");
const plan=readFileSync(dir+"CameraAuditPlanStage.java","utf8");
describe("first-run native camera audit cost and evidence",()=>{
  it("polls a tiny atomic status sidecar, keeping full passport on demand",()=>{
    expect(service).toContain("AtomicFile statusFile = new AtomicFile(");
    expect(service).toContain("public static JSONObject readStatus(Context context)");
    expect(service).toContain('private static final String STATUS_FILE_NAME');
    expect(service).toContain('cached.optLong("passportModifiedMs", -1) != passport.lastModified()');
    expect(service).toContain('cached.optLong("passportBytes", -1) != passport.length()');
    expect(service).toContain("return statusOnly(read(context))");
    expect(service).toContain("persistStatus(context, value, canonical)");
    expect(plugin).toContain("CameraAuditService.readStatus(getContext())");
    expect(plugin).toContain('result.put("audit", CameraAuditService.read(getContext()))');
    expect(plugin).toContain('summary.put("cameras", new org.json.JSONObject())');
  });
  it("preserves valid passports above 1 MiB without unbounded memory use",()=>{
    expect(service).toContain("MAX_PASSPORT_BYTES = 8 * 1024 * 1024");
    expect(service).toContain("ByteArrayOutputStream buffer");
    expect(service).toContain("if (buffer.size() > MAX_PASSPORT_BYTES - n) return blank()");
    expect(service).toContain('throw new IOException("camera-passport-size-limit")');
    expect(service).not.toContain("byte[] data = new byte[1024 * 1024]");
  });
  it("resumes a distinct per-camera planned test stage without recording",()=>{
    expect(service).toContain("CameraAuditPlanStage.run(this)");
    expect(service).toContain('"complete".equals(saved.optString("planState"))');
    expect(service).toContain('saved.put("planState", "pending")');
    expect(plugin).toContain('summary.put("planCandidateCount"');
    expect(plan).toContain("CameraAuditResourceGuard.pauseReason(context)");
    expect(plan).toContain("CameraAuditService.persist(context, passport)");
    expect(plan).toMatch(/item\.put\("status",\s*"not-run"\)/);
    expect(plan).toMatch(/item\.put\("verifiedRecording",\s*false\)/);
    expect(plan).not.toContain("openCamera(");
    expect(plan).not.toContain("new MediaRecorder(");
  });
  it("plans declared common capture resolutions across several frame rates",()=>{
    expect(plan).toContain("ranked.sort((a,b) -> Integer.compare(candidatePriority(a),candidatePriority(b)))");
    expect(plan).toContain("return rank < 3 ? fps*3+rank : 20+fps");
    expect(plan).toContain("MAX_PLANS_PER_CAMERA");
    expect(plan).toContain('"declared-compatible".equals(check.optString("status"))');
  });
  it("captures additional declared focus and sensor evidence",()=>{
    for(const key of ["afMaxRegionsDeclared","aeMaxRegionsDeclared","awbMaxRegionsDeclared",
      "pixelArraySizeDeclared","sensorPhysicalSizeMmDeclared","capabilitiesDeclared"])
      expect(service).toContain('item.put("'+key+'"');
  });
  it("does not turn Camera2 declarations into proven recorded files",()=>{
    expect(service).toContain('item.put("verifiedRecording", false)');
    expect(service).toContain('mode.put("verifiedVideoRecording", false)');
    expect(service).toContain('item.put("videoModeCandidatesTruncated", videoSizesTruncated)');
    expect(codec).toContain('check.put("recordedAndVerified", false)');
    expect(codec).toContain('entry.put("declaredOnly", true)');
    expect(codec).not.toContain('new MediaRecorder(');
  });
  it("caches codec capability queries across all candidates and cameras",()=>{
    expect(codec).toContain("EncoderCatalog catalog = collectEncoderCapabilities(codecs)");
    expect(codec).toContain("JSONArray checks = scanCamera(camera, catalog)");
    expect(codec).toContain("final List<EncoderProfile> profiles = new ArrayList<>()");
    expect(codec).toContain("boolean unknown = catalog.unknown");
    expect(codec).toContain("result.unknown = true");
  });
  it("prioritizes declared common video sizes and deduplicates vendor entries",()=>{
    expect(codec).toContain("Set<String> seen = new HashSet<>()");
    expect(codec).toContain('seen.add(width + "x" + height)');
    expect(codec).toContain('candidates.sort((a,b) -> Integer.compare(modePriority(a), modePriority(b)))');
    expect(codec).toContain("MAX_SIZES_PER_CAMERA");
    expect(codec).toContain("small == 1080 && large == 1920");
    expect(codec).toContain("small == 2160 && large == 3840");
    expect(codec).toContain("small == 720 && large == 1280");
  });
});
