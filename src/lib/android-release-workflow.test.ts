import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

const workflow=readFileSync(".github/workflows/android_build.yml","utf8");

describe("Android release signing and CI safeguards",()=>{
 it("never generates a temporary Android signing key",()=>{
  expect(workflow).toContain("Load persistent Android release keystore");
  expect(workflow).not.toContain("keytool -genkeypair");
  expect(workflow).toContain("ANDROID_KEYSTORE_BASE64");
  expect(workflow).toContain("ANDROID_KEYSTORE_PASSWORD");
  expect(workflow).toContain("ANDROID_KEY_ALIAS");
  expect(workflow).toContain("ANDROID_KEY_PASSWORD");
 });
 it("keeps unsigned builds as CI artifacts and gates GitHub Releases on persistent signing",()=>{
  expect(workflow).toContain('echo "persistent=false" >> "$GITHUB_OUTPUT"');
  expect(workflow).toContain('echo "persistent=true" >> "$GITHUB_OUTPUT"');
  expect(workflow).toContain('if: steps.signing.outputs.persistent == \'true\'');
  expect(workflow).toContain('if: steps.signing.outputs.persistent != \'true\'');
  expect(workflow).toContain('apksigner" verify --verbose');
  expect(workflow).toContain('jarsigner -verify');
 });
 it("avoids rebuilding Android for documentation-only edits and cancels superseded branch builds",()=>{
  expect(workflow).toContain('paths-ignore:');
  expect(workflow).toContain('"**.md"');
  expect(workflow).toContain('"docs/**"');
  expect(workflow).toContain("group: android-build-${{ github.ref }}");
  expect(workflow).toContain("cancel-in-progress: true");
 });
});
