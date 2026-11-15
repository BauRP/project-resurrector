import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EDITOR_ACTIVE_INPUT_EVENTS, isEditorActiveInput } from "./editor-active-input";

describe("Android Editor active interaction takes priority over background video codec", () => {
  it("detects touch scrolling, dragging and wheel changes, not only gesture start", () => {
    for (const type of ["pointerdown", "wheel", "keydown", "touchstart", "touchmove"]) {
      expect(EDITOR_ACTIVE_INPUT_EVENTS).toContain(type);
      expect(isEditorActiveInput(new Event(type))).toBe(true);
    }
    expect(EDITOR_ACTIVE_INPUT_EVENTS).toContain("pointermove");
  });

  it("does not abort a background proxy for ordinary mouse hovering", () => {
    const hover = new Event("pointermove") as PointerEvent;
    Object.defineProperties(hover, {
      buttons: { value: 0 },
      pointerType: { value: "mouse" },
    });
    expect(isEditorActiveInput(hover)).toBe(false);
  });

  it("aborts optional decoder work while a mouse drag or touch drag is ongoing", () => {
    const mouseDrag = new Event("pointermove") as PointerEvent;
    Object.defineProperties(mouseDrag, {
      buttons: { value: 1 },
      pointerType: { value: "mouse" },
    });
    expect(isEditorActiveInput(mouseDrag)).toBe(true);
    const touchDrag = new Event("pointermove") as PointerEvent;
    Object.defineProperties(touchDrag, {
      buttons: { value: 0 },
      pointerType: { value: "touch" },
    });
    expect(isEditorActiveInput(touchDrag)).toBe(true);
  });

  it("uses the same gesture classification before and during optional media work", () => {
    const idle = readFileSync("src/lib/editor-quiet-input.ts", "utf8");
    const worker = readFileSync("src/lib/editor-cooperative-work.ts", "utf8");
    for (const source of [idle, worker]) {
      expect(source).toContain("EDITOR_ACTIVE_INPUT_EVENTS");
      expect(source).toContain("isEditorActiveInput(event)");
    }
    expect(worker).toContain("attempt.abort()");
    expect(idle).toContain("lastInput = Date.now()");
  });
});
