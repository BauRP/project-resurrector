import { useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, X } from "lucide-react";
import { useT, type TipKey } from "@/lib/i18n";

/** Press-and-hold (>500ms) detection. Short taps still call onTap. */
export function useLongPress(onLong: () => void, onTap?: () => void) {
  const timer = useRef<number | null>(null); const fired = useRef(false);
  const clear = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: () => { fired.current = false; clear(); timer.current = window.setTimeout(() => { fired.current = true; navigator.vibrate?.(15); onLong(); }, 500); },
    onPointerUp: () => { const wasLong = fired.current; clear(); if (!wasLong) onTap?.(); },
    onPointerLeave: clear, onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

export function LongPressLabel({ tipKey, onOpen, children }: { tipKey: TipKey; onOpen: (k: TipKey) => void; children: ReactNode }) {
  const handlers = useLongPress(() => onOpen(tipKey));
  return <span {...handlers} className="inline-flex cursor-help select-none items-center gap-1 [touch-action:manipulation]">{children}</span>;
}

export function ProTipPopover({ tipKey, onClose }: { tipKey: TipKey | null; onClose: () => void }) {
  const { tip, t } = useT();
  return <AnimatePresence>{tipKey && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[55] flex items-end justify-center p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:items-center" onClick={onClose}>
    <motion.div role="dialog" initial={{ y: 20, scale: .96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ type: "spring", damping: 24, stiffness: 340 }} onClick={(e) => e.stopPropagation()} className="glass-panel w-full max-w-sm rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold"><Info className="size-4 text-tracking" />{tip(tipKey)[0]}</h3><button aria-label={t("close")} onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></button></div>
      <p className="text-sm leading-relaxed text-muted-foreground">{tip(tipKey)[1]}</p>
    </motion.div>
  </motion.div>}</AnimatePresence>;
}
