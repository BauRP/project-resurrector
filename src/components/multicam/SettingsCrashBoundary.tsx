import { Component, type ReactNode } from "react";

/** If the Settings tree itself throws (including a failed native module), keep
 * the persistent app header and bottom navigation mounted and usable. This
 * catches JavaScript render failures, not a blocked Android UI thread. */
export class SettingsCrashBoundary extends Component<
  { children: ReactNode; onExit: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return <section className="settings-error-state mx-3 my-4 space-y-3 p-4 text-sm" role="alert">
      <h2 className="font-semibold">Не удалось открыть настройки</h2>
      <p className="text-muted-foreground">
        Один из элементов настроек завершился с ошибкой. Можно повторить попытку
        или вернуться к камере. Остальные разделы приложения сохранены.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="connect-pill" onClick={() => this.setState({ failed: false })}>
          Повторить
        </button>
        <button type="button" className="rounded-xl border border-border bg-secondary px-3 py-2"
          onClick={this.props.onExit}>Камера</button>
      </div>
    </section>;
  }
}
