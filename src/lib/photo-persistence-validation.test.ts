import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {isUsableEncodedPhoto as usable} from "./photo-persistence-validation";

describe("safe storage for real photo encodings",()=>{
 it("accepts JPEG and legitimate old-WebView PNG fallback",()=>{
  for(const type of ["image/jpeg","image/png","image/webp"])
   expect(usable(new Blob([new Uint8Array(2048)],{type}))).toBe(true);
 });
 it("rejects empty, truncated, non-image and script-bearing file data",()=>{
  expect(usable(null)).toBe(false);
  expect(usable(undefined)).toBe(false);
  expect(usable(new Blob([], {type:"image/jpeg"}))).toBe(false);
  expect(usable(new Blob([new Uint8Array(100)],{type:"image/jpeg"}))).toBe(false);
  expect(usable(new Blob([new Uint8Array(1024)],{type:"video/mp4"}))).toBe(false);
  expect(usable(new Blob([new Uint8Array(1024)],{type:"image/svg+xml"}))).toBe(false);
  expect(usable(new Blob([new Uint8Array(1024)]))).toBe(false);
 });
 it("prevents IndexedDB access and false photo-saved message on invalid encoding",()=>{
  const source=readFileSync("src/components/multicam/CameraPro.tsx","utf8");
  expect(source).toContain("if (!isUsableEncodedPhoto(blob))");
  expect(source.indexOf("if (!isUsableEncodedPhoto(blob))"))
    .toBeLessThan(source.indexOf('indexedDB.open("multicam-pov-photos", 1)'));
  expect(source).toContain("return Promise.reject(new Error");
 });
});
