import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export function HelpOverlay({ entry, open, onClose }: {
  entry: [string, string]; open: boolean; onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>{open && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[200] flex items-center justify-center bg-background p-6">
      <motion.div role="dialog" aria-modal initial={{ scale: .92, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .95 }} transition={{ type: "spring", stiffness: 420, damping: 30 }} onClick={(e) => e.stopPropagation()} className="glass-panel w-full max-w-xs rounded-2xl p-4 text-start text-xs">
        <div className="mb-2 flex items-center justify-between gap-2"><b className="text-sm">{entry[0]}</b><button aria-label="Закрыть" onClick={onClose}><X className="size-4" /></button></div>
        <p className="leading-relaxed text-muted-foreground">{entry[1]}</p>
      </motion.div>
    </motion.div>}</AnimatePresence>,
    document.body,
  );
}
