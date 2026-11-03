import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MulticamStoreProvider, createMulticamStore, useMulticamStore } from "./multicam-store";

function ThemeProbe() {
  const theme = useMulticamStore(s => s.theme);
  const language = useMulticamStore(s => s.language);
  const set = useMulticamStore(s => s.set);
  const addMarker = useMulticamStore(s => s.addMarker);
  return <div>
    <output data-testid="theme">{theme}</output>
    <output data-testid="language">{language}</output>
    <button onClick={() => set({ theme: theme === "dark" ? "light" : "dark" })}>Switch theme</button>
    <button onClick={() => set({ language: "en" })}>Switch language</button>
    <button onClick={() => set({ selectedLut: "Cinematic" })}>Change LUT</button>
    <button onClick={() => addMarker()}>Add marker</button>
  </div>;
}

describe("lightweight appearance preferences", () => {
  it("hydrates small dark appearance on the very first store snapshot", () => {
    window.localStorage.setItem("multicam-pov-ui-prefs-native", JSON.stringify({
      theme: "dark", language: "kk", hardwareAcceleration: false,
    }));
    const first = createMulticamStore().getSnapshot();
    expect(first.theme).toBe("dark");
    expect(first.language).toBe("kk");
    expect(first.hardwareAcceleration).toBe(false);
  });

  it("ignores malformed or oversized appearance preferences without breaking startup", () => {
    window.localStorage.setItem("multicam-pov-ui-prefs-native", "{bad");
    expect(createMulticamStore().getSnapshot().theme).toBe("light");
    window.localStorage.setItem("multicam-pov-ui-prefs-native", "x".repeat(2500));
    expect(createMulticamStore().getSnapshot().theme).toBe("light");
  });

  beforeEach(() => window.localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

  it("saves theme and language without serializing the project on every tap", async () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(<MulticamStoreProvider><ThemeProbe /></MulticamStoreProvider>);
    fireEvent.click(screen.getByText("Switch theme"));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    fireEvent.click(screen.getByText("Switch language"));
    expect(screen.getByTestId("language")).toHaveTextContent("en");
    await waitFor(() => expect(writes).toHaveBeenCalledWith(
      "multicam-pov-ui-prefs-native", expect.stringContaining('"theme":"dark"')
    ));
    expect(writes.mock.calls.filter(args => args[0] === "multicam-pov-state-native")).toHaveLength(0);
  });

  it("stays responsive to 40 rapid theme toggles without writing bulky project storage", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(<MulticamStoreProvider><ThemeProbe /></MulticamStoreProvider>);
    for (let i = 0; i < 40; i++) {
      fireEvent.click(screen.getByText("Switch theme"));
    }
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(writes.mock.calls.filter(args => args[0] === "multicam-pov-state-native")).toHaveLength(0);
    expect(writes.mock.calls.filter(args => args[0] === "multicam-pov-ui-prefs-native").length).toBeGreaterThan(0);
  });

  it("retains legacy project serialization when project data actually changes", async () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(<MulticamStoreProvider><ThemeProbe /></MulticamStoreProvider>);
    fireEvent.click(screen.getByText("Change LUT"));
    await waitFor(() => expect(writes.mock.calls.some(args => args[0] === "multicam-pov-state-native")).toBe(true));
  });

  it("batches multiple editor changes into one safe project write", async () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(<MulticamStoreProvider><ThemeProbe /></MulticamStoreProvider>);
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByText("Add marker"));
    expect(writes.mock.calls.filter(([key]) => key === "multicam-pov-state-native")).toHaveLength(0);
    await waitFor(() => expect(writes.mock.calls.filter(([key]) => key === "multicam-pov-state-native")).toHaveLength(1));
    const saved = JSON.parse(window.localStorage.getItem("multicam-pov-state-native") ?? "{}");
    expect(saved.markers).toHaveLength(6);
  });
  it("flushes pending project changes when Android hides the activity", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(<MulticamStoreProvider><ThemeProbe /></MulticamStoreProvider>);
    fireEvent.click(screen.getByText("Add marker"));
    window.dispatchEvent(new Event("pagehide"));
    expect(writes.mock.calls.filter(([key]) => key === "multicam-pov-state-native")).toHaveLength(1);
  });

  it("prefers the new stored theme over legacy appearance data", async () => {
    window.localStorage.setItem("multicam-pov-state-native", JSON.stringify({ theme: "light", selectedLut: "Neutral" }));
    window.localStorage.setItem("multicam-pov-ui-prefs-native", JSON.stringify({ theme: "dark", language: "en" }));
    render(<MulticamStoreProvider><ThemeProbe /></MulticamStoreProvider>);
    await waitFor(() => {
      expect(screen.getByTestId("theme")).toHaveTextContent("dark");
      expect(screen.getByTestId("language")).toHaveTextContent("en");
    });
  });
});
