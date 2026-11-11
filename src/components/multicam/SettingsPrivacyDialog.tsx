import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activateAccessibleDialog } from "@/lib/accessible-dialog";

export function SettingsPrivacyDialog({ open, title, legalTitle, closeLabel, language, onClose }: {
  open: boolean; title: string; legalTitle: string; closeLabel: string;
  language: string; onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  // A lazy-imported dialog does not exist during SettingsTab's first effect.
  // Install the original accessible focus trap after the portal has mounted.
  useEffect(() => {
    if (!open || !dialog.current) return;
    return activateAccessibleDialog(dialog.current, onClose);
  }, [open, onClose]);
  return <AnimatePresence>{open&&<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="privacy-fold-overlay fixed inset-x-0 top-[calc(3.6rem+env(safe-area-inset-top))] bottom-[var(--nav-h)] z-30 flex flex-col overflow-hidden bg-background"><header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-4"><div><p className="text-[10px] uppercase tracking-[.18em] text-muted-foreground">{legalTitle}</p><h2 className="text-xl font-semibold">{title}</h2></div><Button size="icon" variant="ghost" aria-label={closeLabel} onClick={onClose}><X/></Button></header><div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto overscroll-contain px-6 py-10"><div className="settings-privacy-empty min-h-[65dvh] rounded-xl border border-border p-6 text-center">
    <ShieldCheck aria-hidden="true" className="mx-auto mb-4 size-8 text-primary" />
    <p className="text-sm font-semibold text-foreground">{language==="ru" ? "Текст политики конфиденциальности пока не добавлен в эту сборку." : language==="kk" ? "Құпиялылық саясатының мәтіні бұл нұсқаға әлі қосылмаған." : "The Privacy Policy text has not been included in this build yet."}</p>
    <p className="mt-3 text-xs text-muted-foreground">{language==="ru" ? "Это не ошибка загрузки и не зависание приложения. Закройте окно кнопкой вверху, чтобы вернуться в настройки." : language==="kk" ? "Бұл жүктеу қатесі емес. Параметрлерге оралу үшін жоғарғы батырмамен терезені жабыңыз." : "This is not a loading error. Use the close button above to return to Settings."}</p>
   </div></div></motion.div>}</AnimatePresence>;
}
