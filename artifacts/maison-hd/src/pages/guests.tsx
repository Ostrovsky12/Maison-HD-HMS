import { useState, useEffect, useRef } from "react";
import {
  Search, Plus, Mail, Phone, Loader2, Star, Users,
  MapPin, Globe, Shield, ArrowRight, X,
} from "lucide-react";
import { useListGuests, useGetGuest } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtUAH = (n: number) =>
  new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

const LOYALTY: Record<string, { label: string; bg: string; text: string; stars: number; ring: string }> = {
  bronze:   { label: "Бронза",   bg: "bg-amber-50",   text: "text-amber-700",  stars: 1, ring: "ring-amber-200" },
  silver:   { label: "Срібло",   bg: "bg-slate-50",   text: "text-slate-600",  stars: 2, ring: "ring-slate-200" },
  gold:     { label: "Золото",   bg: "bg-yellow-50",  text: "text-yellow-700", stars: 3, ring: "ring-yellow-200" },
  platinum: { label: "Платина",  bg: "bg-violet-50",  text: "text-violet-700", stars: 4, ring: "ring-violet-200" },
};

const AVATAR_GRADIENTS = [
  "from-indigo-400 to-violet-500",
  "from-rose-400 to-pink-500",
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-sky-400 to-blue-500",
  "from-fuchsia-400 to-purple-500",
];

function avatarGrad(id: number) { return AVATAR_GRADIENTS[id % AVATAR_GRADIENTS.length]; }

function LoyaltyChip({ level }: { level?: string | null }) {
  if (!level) return null;
  const l = LOYALTY[level] || LOYALTY.bronze;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${l.bg} ${l.text} ${l.ring}`}>
      <Star className="w-2.5 h-2.5 fill-current" />
      {l.label}
    </span>
  );
}

// ── Guest Profile Drawer ──────────────────────────────────────────────────────
function GuestDrawer({ guestId, open, onClose }: { guestId: number | null; open: boolean; onClose: () => void }) {
  const { data: guest, isLoading } = useGetGuest(guestId ?? 0, { query: { enabled: open && guestId !== null } });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const initials = guest ? `${guest.firstName?.[0] || ""}${guest.lastName?.[0] || ""}`.toUpperCase() : "—";
  const grad = avatarGrad(guestId || 0);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      <div className={`fixed top-0 right-0 h-screen w-[420px] max-w-full z-50 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* Header */}
        <div className="relative px-5 pt-6 pb-5 border-b border-gray-100">
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
          {isLoading ? (
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          ) : guest ? (
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-xl shrink-0`}>
                {initials}
              </div>
              <div className="flex-1 min-w-0 pr-8">
                <h2 className="font-bold text-gray-900 text-base leading-tight">
                  {guest.lastName} {guest.firstName}
                  {(guest as any).middleName && ` ${(guest as any).middleName}`}
                </h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <LoyaltyChip level={guest.loyaltyLevel} />
                  {(guest as any).isVip && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                      <Shield className="w-2.5 h-2.5" /> VIP
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!isLoading && guest && (
            <div className="px-5 py-4 space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Бронювань", value: (guest as any).totalBookings ?? "—" },
                  { label: "Ночей",     value: (guest as any).totalNights ?? "—" },
                  { label: "LTV",       value: (guest as any).totalRevenue ? fmtUAH((guest as any).totalRevenue) : "—" },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="font-bold text-gray-900 text-base">{s.value}</div>
                    <div className="text-[11px] text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Contacts */}
              <div className="space-y-0">
                {guest.phone && (
                  <div className="flex items-center gap-3 py-2.5 border-b border-gray-50">
                    <Phone className="w-4 h-4 text-gray-300 shrink-0" />
                    <span className="text-xs text-gray-400 w-14">Тел.</span>
                    <a href={`tel:${guest.phone}`} className="text-sm text-indigo-600 hover:underline">{guest.phone}</a>
                  </div>
                )}
                {guest.email && (
                  <div className="flex items-center gap-3 py-2.5 border-b border-gray-50">
                    <Mail className="w-4 h-4 text-gray-300 shrink-0" />
                    <span className="text-xs text-gray-400 w-14">Email</span>
                    <a href={`mailto:${guest.email}`} className="text-sm text-indigo-600 hover:underline truncate">{guest.email}</a>
                  </div>
                )}
                {(guest as any).nationality && (
                  <div className="flex items-center gap-3 py-2.5 border-b border-gray-50">
                    <Globe className="w-4 h-4 text-gray-300 shrink-0" />
                    <span className="text-xs text-gray-400 w-14">Країна</span>
                    <span className="text-sm text-gray-800">{(guest as any).nationality}</span>
                  </div>
                )}
                {guest.dateOfBirth && (
                  <div className="flex items-center gap-3 py-2.5 border-b border-gray-50">
                    <Star className="w-4 h-4 text-gray-300 shrink-0" />
                    <span className="text-xs text-gray-400 w-14">День нар.</span>
                    <span className="text-sm text-gray-800">
                      {format(new Date(guest.dateOfBirth), "d MMMM yyyy", { locale: uk })}
                    </span>
                  </div>
                )}
              </div>

              {/* Notes */}
              {guest.notes && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-xs font-semibold text-amber-600 mb-1">Нотатки</p>
                  <p className="text-sm text-amber-800">{guest.notes}</p>
                </div>
              )}

              {/* Booking history */}
              {(guest as any).bookings?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                    Бронювання ({(guest as any).bookings.length})
                  </p>
                  <div className="space-y-2">
                    {(guest as any).bookings.slice(0, 5).map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                        <div>
                          <div className="font-medium text-gray-800">{b.unitName || `Юніт #${b.unitId}`}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {format(new Date(b.checkIn), "d MMM", { locale: uk })} – {format(new Date(b.checkOut), "d MMM yyyy", { locale: uk })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-emerald-600">{fmtUAH(b.totalAmount)}</div>
                          <span className="text-[11px] text-gray-400">{b.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Guest Card ────────────────────────────────────────────────────────────────
function GuestCard({ guest, onClick, isSelected }: { guest: any; onClick: () => void; isSelected: boolean }) {
  const initials = `${guest.firstName?.[0] || ""}${guest.lastName?.[0] || ""}`.toUpperCase();
  const grad = avatarGrad(guest.id);
  return (
    <div
      onClick={onClick}
      className={`group bg-white rounded-2xl border-2 p-4 cursor-pointer transition-all hover:shadow-sm ${
        isSelected ? "border-indigo-400 shadow-sm shadow-indigo-100/60" : "border-gray-200/80 hover:border-gray-300"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-gray-900 text-sm truncate">
              {guest.lastName} {guest.firstName}
            </span>
            <LoyaltyChip level={guest.loyaltyLevel} />
            {guest.isVip && <Shield className="w-3 h-3 text-amber-500 shrink-0" />}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {guest.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{guest.phone}</span>}
            {guest.email && <span className="truncate max-w-[140px]">{guest.email}</span>}
          </div>
        </div>

        {/* Stats */}
        <div className="text-right shrink-0 hidden sm:block">
          {guest.totalBookings !== undefined && (
            <div className="font-semibold text-gray-900 text-sm">{guest.totalBookings} бр.</div>
          )}
          {guest.totalRevenue !== undefined && (
            <div className="text-xs text-emerald-600 font-medium">{fmtUAH(guest.totalRevenue)}</div>
          )}
        </div>

        <ArrowRight className="w-4 h-4 text-gray-200 group-hover:text-indigo-400 transition-colors shrink-0 ml-1" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function GuestsPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: resp, isLoading } = useListGuests({});
  const guests = resp?.guests || [];

  const filtered = guests.filter(g =>
    !search ||
    `${g.firstName} ${g.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    g.email?.toLowerCase().includes(search.toLowerCase()) ||
    g.phone?.includes(search)
  );

  const openGuest = (id: number, idx: number) => {
    setSelectedId(id);
    setActiveIdx(idx);
    setDrawerOpen(true);
  };

  // Keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const inInput = ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName || "");
      if (!inInput) {
        if (e.key === "/")         { e.preventDefault(); searchRef.current?.focus(); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
        if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
        if (e.key === "Enter" && activeIdx >= 0) openGuest(filtered[activeIdx].id, activeIdx);
      }
      if (inInput && e.key === "Escape") { (e.target as HTMLElement).blur(); setSearch(""); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [filtered, activeIdx]);

  return (
    <AppLayout>
      <div className="h-full flex flex-col min-h-0">

        {/* Toolbar */}
        <div className="px-6 pt-5 pb-4 bg-white border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 font-display">База гостей</h1>
              <p className="text-xs text-gray-400 mt-0.5">{guests.length} гостей в базі</p>
            </div>
            <button className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-500/25 transition-colors">
              <Plus className="w-4 h-4" /> Новий гість
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Пошук за ім'ям, email, телефоном..."
              className="w-full h-9 pl-9 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 font-mono pointer-events-none">/</kbd>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <Users className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400">Гостей не знайдено</p>
              {search && <button onClick={() => setSearch("")} className="text-xs text-indigo-500 hover:underline">Скинути</button>}
            </div>
          ) : (
            <div className="space-y-2 max-w-3xl pb-8">
              {filtered.map((g, i) => (
                <GuestCard
                  key={g.id}
                  guest={g}
                  isSelected={i === activeIdx && drawerOpen && selectedId === g.id}
                  onClick={() => openGuest(g.id, i)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Shortcuts */}
        <div className="hidden md:flex items-center gap-4 px-6 py-2 border-t border-gray-100 bg-gray-50/50 shrink-0">
          {[["/ ","пошук"],["↑↓","навігація"],["↵","профіль"],["ESC","закрити"]].map(([k,l]) => (
            <div key={k} className="flex items-center gap-1">
              <kbd className="text-[10px] bg-white border border-gray-200 text-gray-400 px-1 py-0.5 rounded font-mono">{k}</kbd>
              <span className="text-[11px] text-gray-400">{l}</span>
            </div>
          ))}
        </div>
      </div>

      <GuestDrawer
        guestId={selectedId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </AppLayout>
  );
}
