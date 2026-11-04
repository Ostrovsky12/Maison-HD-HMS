import { Check } from "lucide-react";

export type DogodaStep = 1 | 2 | 3 | 4;
const LABELS: Record<DogodaStep, string> = { 1: "Дати й гості", 2: "Будиночок", 3: "Контакти", 4: "Підтвердження" };

/** Sequential progress for the DOGODA booking journey. Only completed steps are clickable (back navigation). */
export function DogodaSteps({ step, onGo }: { step: DogodaStep; onGo: (s: DogodaStep) => void }) {
  return (
    <ol className="flex items-center gap-1.5 md:gap-3 text-xs md:text-sm" aria-label="Етапи бронювання" data-testid="nav-steps">
      {([1, 2, 3, 4] as DogodaStep[]).map((s) => {
        const done = s < step, cur = s === step;
        return (
          <li key={s} className="flex items-center gap-1.5 md:gap-3 min-w-0">
            <button type="button" disabled={!done} onClick={() => onGo(s)} aria-current={cur ? "step" : undefined} data-testid={`button-step-${s}`}
              className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border dg-line ${cur ? "dg-surface" : ""} ${done ? "hover:underline" : ""} disabled:cursor-default`}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] shrink-0"
                style={{ background: cur || done ? "var(--dg-button)" : "transparent", border: cur || done ? "none" : "1px solid var(--dg-muted)" }}>
                {done ? <Check className="w-3.5 h-3.5" /> : s}
              </span>
              <span className={cur ? "" : "hidden sm:inline dg-muted"}>{LABELS[s]}</span>
            </button>
            {s < 4 && <span aria-hidden className="w-3 md:w-8 h-px" style={{ background: "var(--dg-muted)" }} />}
          </li>
        );
      })}
    </ol>
  );
}
