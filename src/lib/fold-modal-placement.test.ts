import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
describe("real fold-safe pairing and QR dialogs",()=>{
 it("uses measured fold workspace rather than a hardcoded model breakpoint",()=>{
  const modal=readFileSync("src/components/multicam/ConnectModal.tsx","utf8");
  const css=readFileSync("src/styles.css","utf8");
  expect(modal).toContain("connect-fold-modal fixed inset-0");
  expect(css).toContain('[data-fold-workspace="pane"] .connect-fold-modal');
  expect(css).toContain("left: var(--fold-work-left, 0px)");
  expect(css).toContain("top: var(--fold-work-top, 0px)");
  expect(css).toContain("height: var(--fold-work-height, 100dvh)");
  expect(css).toContain("width: min(var(--fold-work-width, 100%), 100%)");
  expect(css).toContain("overflow-wrap: anywhere;");
 });
});
