import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AndroidFreezeNotice } from "@/components/multicam/AndroidFreezeNotice";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  copyReport: vi.fn(),
  pulse: vi.fn(),
  clear: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    isPluginAvailable: () => true,
  },
}));
vi.mock("@/lib/ui-freeze-bridge", () => ({ uiFreeze: mocks }));
vi.mock("@/lib/freeze-action-trace", () => ({ traceUiAction: mocks.trace }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

async function showReport() {
  vi.useFakeTimers();
  mocks.read.mockResolvedValue({ report: "WebView bridge heartbeat missing while Android main responsive", recordedAt: 5 });
  mocks.pulse.mockResolvedValue(undefined);
  mocks.clear.mockResolvedValue(undefined);
  const ui = render(<AndroidFreezeNotice />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1850);
  });
  expect(screen.getByText(/Обнаружено зависание Android-интерфейса/)).toBeTruthy();
  return ui;
}

describe("Android freeze report remains usable after WebView stall", () => {
  it("uses Android clipboard asynchronously and does not remove original report", async () => {
    mocks.copyReport.mockResolvedValue(undefined);
    await showReport();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Скопировать отчёт" }));
      await Promise.resolve();
    });
    expect(mocks.copyReport).toHaveBeenCalledOnce();
    expect(mocks.copyReport).toHaveBeenCalledWith({
      report: "WebView bridge heartbeat missing while Android main responsive",
    });
    expect(screen.getByRole("button", { name: "Скопировано" })).toBeTruthy();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("preserves report text and an accessible manual copy path when clipboard fails", async () => {
    mocks.copyReport.mockRejectedValue(new Error("clipboard not available"));
    await showReport();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Скопировать отчёт" }));
      await Promise.resolve();
    });
    expect(screen.getByRole("alert").textContent).toContain("Не удалось скопировать отчёт");
    const manual = screen.getByRole("textbox", { name: "Текст отчёта для копирования" }) as HTMLTextAreaElement;
    expect(manual.readOnly).toBe(true);
    expect(manual.value).toContain("WebView bridge heartbeat missing");
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});
