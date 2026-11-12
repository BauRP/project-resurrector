import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MulticamStoreProvider } from "@/lib/multicam-store";
import { CameraWorkspace } from "./CameraWorkspace";

const mocks = vi.hoisted(() => ({
  status: vi.fn<() => Promise<{ state: string }>>(),
}));
vi.mock("@/lib/native", () => ({ isNative: () => true }));
vi.mock("@/lib/native-capture", () => ({
  nativeCapture: { status: mocks.status },
  nativeRecorderOwnsCamera: (state: string) => ["starting","previewing","recording","paused","stopping"].includes(state),
}));
vi.mock("./CameraTab", () => ({
  CameraTab: ({ onOpenNativeMode }: { onOpenNativeMode?: () => void }) =>
    <div><span>Камера пока выключена</span>
      <button type="button" onClick={onOpenNativeMode}>Перейти в Camera2</button></div>,
}));
vi.mock("./NativeRecordingPanel", () => ({
  NativeRecordingPanel: () => <div>Нативная панель</div>,
}));

beforeEach(() => {
  localStorage.clear();
  mocks.status.mockReset().mockResolvedValue({state:"idle"});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("native bridge must not freeze the initial camera screen", () => {
  it("renders with an Android binder status request that would never resolve", async () => {
    mocks.status.mockImplementation(() => new Promise(() => undefined));
    render(<MulticamStoreProvider><CameraWorkspace /></MulticamStoreProvider>);
    expect(await screen.findByText("Камера пока выключена", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(mocks.status).toHaveBeenCalledTimes(1);
  });
  it("preserves Camera2 ownership restoration and checks status before returning to WebView", async () => {
    render(<MulticamStoreProvider><CameraWorkspace /></MulticamStoreProvider>);
    expect(mocks.status).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole("button", { name: "Перейти в Camera2" }, { timeout: 4000 }));
    await waitFor(() => expect(screen.getByText("Нативная панель")).toBeInTheDocument());
    expect(mocks.status).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Обычная" }));
    await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Камера пока выключена", {}, { timeout: 4000 })).toBeInTheDocument();
  });
});
