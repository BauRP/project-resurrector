import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MulticamStoreProvider } from "@/lib/multicam-store";
import { SettingsTab } from "./SettingsTab";

const fakes = vi.hoisted(() => ({
  cacheBytes: vi.fn<() => Promise<number>>(),
  clearPreviewCache: vi.fn<() => Promise<number>>(),
  diagnose: vi.fn<() => Promise<{ latency: number; bandwidth: number; online: boolean }>>(),
}));
vi.mock("@/lib/media-cache", () => ({
  cacheBytes: fakes.cacheBytes,
  clearPreviewCache: fakes.clearPreviewCache,
}));
vi.mock("./useMesh", () => ({ useMeshPeers: () => [] }));
vi.mock("@/lib/mesh", () => ({
  mesh: { diagnose: fakes.diagnose, localId: "LOCAL-TEST", peers: new Map() },
}));
vi.mock("./Help", () => ({ HelpDot: () => null }));

function view() {
  return render(<MulticamStoreProvider><SettingsTab /></MulticamStoreProvider>);
}
beforeEach(() => {
  localStorage.clear();
  fakes.cacheBytes.mockReset().mockResolvedValue(2 * 1048576);
  fakes.clearPreviewCache.mockReset().mockResolvedValue(0);
  fakes.diagnose.mockReset().mockResolvedValue({ latency: 9, bandwidth: 0, online: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("settings actions remain interactive", () => {
  it("does not scan IndexedDB on entry or on a theme tap", () => {
    view();
    expect(fakes.cacheBytes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Тёмная" }));
    expect(screen.getByRole("radio", { name: "Тёмная" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Светлая" }));
    expect(screen.getByRole("radio", { name: "Светлая" })).toHaveAttribute("aria-checked", "true");
    expect(fakes.cacheBytes).not.toHaveBeenCalled();
  });
  it("requires confirmation to clear previews without touching original files", async () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: /Очистить кэш/i }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Оригинальные видео");
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(fakes.clearPreviewCache).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Очистить кэш/i }));
    fireEvent.click(screen.getByRole("alertdialog").querySelector("button:last-child")!);
    await waitFor(() => expect(fakes.clearPreviewCache).toHaveBeenCalledTimes(1));
  });
  it("prevents a cache measure and a clear from running simultaneously", async () => {
    let finish!: (value: number) => void;
    fakes.cacheBytes.mockImplementation(() => new Promise<number>(resolve => { finish = resolve; }));
    view();
    fireEvent.click(screen.getByRole("button", { name: /Измерить размер/i }));
    expect(fakes.cacheBytes).toHaveBeenCalledTimes(1);
    const clearButton = screen.getByRole("button", { name: /Очистить кэш/i });
    expect(clearButton).toBeDisabled();
    finish(1048576);
    await waitFor(() => expect(clearButton).not.toBeDisabled());
    expect(screen.getByText(/1.00 MB/)).toBeInTheDocument();
  });
  it("shows a real privacy empty-state and keeps the close button usable", async () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Политика конфиденциальности" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Текст политики конфиденциальности пока не добавлен");
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "Светлая" })).toBeInTheDocument();
  });

  it("reports one failed network check instead of retrying immediately", async () => {
    fakes.diagnose.mockRejectedValue(new Error("no peers"));
    view();
    fireEvent.click(screen.getByRole("button", { name: "Тест" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Нет ответа"));
    expect(fakes.diagnose).toHaveBeenCalledTimes(1);
  });
});
