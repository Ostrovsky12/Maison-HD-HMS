/**
 * MAISON HD — Command Palette
 * Cmd+K / Ctrl+K → global search + quick actions + keyboard navigation
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard, CalendarDays, KeyRound, Users, BarChart3, Settings,
  MessageSquare, Sparkles, Brain, Zap, Grid3X3, CreditCard, Tag,
  ArrowRight, Building, Search, Clock, Crown,
} from "lucide-react";

interface Action {
  id: string;
  label: string;
  sub?: string;
  icon: any;
  group: string;
  shortcut?: string;
  path?: string;
  action?: () => void;
}

const NAV_ACTIONS: Omit<Action, "group">[] = [
  { id: "dashboard",   label: "Головна",          icon: LayoutDashboard, path: "/dashboard",   shortcut: "G H" },
  { id: "bookings",    label: "Бронювання",        icon: CalendarDays,    path: "/bookings",    shortcut: "G B" },
  { id: "units",       label: "Номери",            icon: KeyRound,        path: "/units",       shortcut: "G U" },
  { id: "chess",       label: "Шахматка",          icon: Grid3X3,         path: "/chess",       shortcut: "G C" },
  { id: "guests",      label: "Гості",             icon: Users,           path: "/guests",      shortcut: "G G" },
  { id: "inbox",       label: "Inbox",             icon: MessageSquare,   path: "/inbox" },
  { id: "analytics",   label: "Аналітика",         icon: BarChart3,       path: "/analytics" },
  { id: "ai-hub",      label: "AI Hub",            icon: Brain,           path: "/ai-hub" },
  { id: "automation",  label: "AI Автоматизація",  icon: Zap,             path: "/automation" },
  { id: "housekeeping",label: "Прибирання",        icon: Sparkles,        path: "/housekeeping" },
  { id: "settings",    label: "Налаштування",      icon: Settings,        path: "/settings" },
  { id: "subscription",label: "Підписка",          icon: CreditCard,      path: "/subscription" },
  { id: "pricing",     label: "Тарифи та модулі",  icon: Tag,             path: "/pricing" },
  { id: "admin",       label: "Super Admin",       icon: Crown,           path: "/admin" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";

  const actions: Action[] = NAV_ACTIONS.map(a => ({ ...a, group: "Навігація" }));

  const filtered = query
    ? actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()) || a.sub?.toLowerCase().includes(query.toLowerCase()))
    : actions.slice(0, 8);

  const go = useCallback((path?: string, action?: () => void) => {
    if (path) navigate(`~${BASE}${path}`);
    if (action) action();
    onClose();
    setQuery("");
  }, [navigate, BASE, onClose]);

  useEffect(() => { if (open) { setQuery(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(v => Math.min(v + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActive(v => Math.max(v - 1, 0)); }
      if (e.key === "Enter" && filtered[active]) { go(filtered[active].path, filtered[active].action); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, filtered, active, go, onClose]);

  useEffect(() => { setActive(0); }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200"
        onClick={e => e.stopPropagation()}
        style={{ animation: "cmdIn 0.12s ease-out" }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Пошук сторінок та дій..."
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
          />
          <kbd className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Нічого не знайдено</div>
          ) : (
            <div>
              {!query && (
                <div className="px-4 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Швидка навігація</span>
                </div>
              )}
              {filtered.map((a, i) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    onClick={() => go(a.path, a.action)}
                    onMouseEnter={() => setActive(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === active ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${i === active ? "bg-indigo-100" : "bg-gray-100"}`}>
                      <Icon className={`w-3.5 h-3.5 ${i === active ? "text-indigo-600" : "text-gray-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${i === active ? "text-indigo-700" : "text-gray-700"}`}>{a.label}</div>
                      {a.sub && <div className="text-xs text-gray-400 truncate">{a.sub}</div>}
                    </div>
                    {a.shortcut && (
                      <div className="flex gap-1 shrink-0">
                        {a.shortcut.split(" ").map(k => (
                          <kbd key={k} className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-mono">{k}</kbd>
                        ))}
                      </div>
                    )}
                    {i === active && !a.shortcut && <ArrowRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-4 bg-gray-50/60">
          {[["↑↓", "навігація"], ["↵", "відкрити"], ["ESC", "закрити"]].map(([k, l]) => (
            <div key={k} className="flex items-center gap-1.5">
              <kbd className="text-[10px] bg-white border border-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-mono shadow-sm">{k}</kbd>
              <span className="text-[11px] text-gray-400">{l}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <Building className="w-3 h-3 text-indigo-400" />
            <span className="text-[11px] text-indigo-400 font-medium">Maison HD</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cmdIn { from { opacity:0; transform:scale(0.96) translateY(-8px); } to { opacity:1; transform:scale(1) translateY(0); } }
      `}</style>
    </div>
  );
}

/** Hook: registers Cmd+K / Ctrl+K globally */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(v => !v); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return { open, setOpen };
}
