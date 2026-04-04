import { useState, useEffect, useRef } from "react";
import {
  Search, Plus, Mail, Phone, Loader2, Star, Users,
  Globe, Shield, ArrowRight, X, Edit2, UserPlus,
  Calendar, FileText, ChevronDown,
} from "lucide-react";
import {
  useListGuests, useGetGuest, useCreateGuest, useUpdateGuest,
  getListGuestsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtUAH = (n: number) =>
  new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

const LOYALTY: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  bronze:   { label: "Бронза",   bg: "bg-amber-50",   text: "text-amber-700",  ring: "ring-amber-200" },
  silver:   { label: "Срібло",   bg: "bg-slate-50",   text: "text-slate-600",  ring: "ring-slate-200" },
  gold:     { label: "Золото",   bg: "bg-yellow-50",  text: "text-yellow-700", ring: "ring-yellow-200" },
  platinum: { label: "Платина",  bg: "bg-violet-50",  text: "text-violet-700", ring: "ring-violet-200" },
};

const AVATAR_GRADIENTS = [
  "from-indigo-400 to-violet-500", "from-rose-400 to-pink-500",
  "from-emerald-400 to-teal-500",  "from-amber-400 to-orange-500",
  "from-sky-400 to-blue-500",      "from-fuchsia-400 to-purple-500",
];
const avatarGrad = (id: number) => AVATAR_GRADIENTS[id % AVATAR_GRADIENTS.length];

function LoyaltyChip({ level }: { level?: string | null }) {
  if (!level) return null;
  const l = LOYALTY[level] || LOYALTY.bronze;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${l.bg} ${l.text} ${l.ring}`}>
      <Star className="w-2.5 h-2.5 fill-current" /> {l.label}
    </span>
  );
}

// ── Create / Edit Dialog ──────────────────────────────────────────────────────
function GuestFormDialog({
  open, guest, onClose, onSuccess,
}: { open: boolean; guest?: any; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const createM = useCreateGuest();
  const updateM = useUpdateGuest();
  const isEdit  = !!guest;

  const [form, setForm] = useState({
    firstName: "", lastName: "", middleName: "",
    phone: "", email: "", dateOfBirth: "",
    nationality: "", documentNumber: "", notes: "",
    isVip: false, loyaltyLevel: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        firstName:      guest?.firstName      || "",
        lastName:       guest?.lastName       || "",
        middleName:     guest?.middleName     || "",
        phone:          guest?.phone          || "",
        email:          guest?.email          || "",
        dateOfBirth:    guest?.dateOfBirth    || "",
        nationality:    guest?.nationality    || "",
        documentNumber: guest?.documentNumber || "",
        notes:          guest?.notes          || "",
        isVip:          guest?.isVip          || false,
        loyaltyLevel:   guest?.loyaltyLevel   || "",
      });
    }
  }, [open, guest]);

  if (!open) return null;

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast({ title: "Вкажіть ім'я та прізвище", variant: "destructive" });
      return;
    }
    const data: any = {
      firstName:      form.firstName.trim(),
      lastName:       form.lastName.trim(),
      phone:          form.phone.trim() || undefined,
      email:          form.email.trim() || undefined,
      dateOfBirth:    form.dateOfBirth || undefined,
      nationality:    form.nationality.trim() || undefined,
      documentNumber: form.documentNumber.trim() || undefined,
      notes:          form.notes.trim() || undefined,
      isVip:          form.isVip,
      loyaltyLevel:   form.loyaltyLevel || undefined,
    };
    if (form.middleName.trim()) data.middleName = form.middleName.trim();

    if (isEdit) {
      updateM.mutate({ guestId: guest.id, data }, {
        onSuccess: () => { toast({ title: "✓ Гостя оновлено" }); onSuccess(); },
        onError:   (e: any) => toast({ title: e?.message || "Помилка", variant: "destructive" }),
      });
    } else {
      createM.mutate({ data }, {
        onSuccess: () => { toast({ title: "✓ Гостя додано" }); onSuccess(); },
        onError:   (e: any) => toast({ title: e?.message || "Помилка", variant: "destructive" }),
      });
    }
  };

  const isPending = createM.isPending || updateM.isPending;

  const inputCls = "w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder-gray-300";
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-sm">{isEdit ? "Редагувати гостя" : "Новий гість"}</h2>
              <p className="text-xs text-gray-400">{isEdit ? `Гість #${guest.id}` : "Заповніть дані гостя"}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Прізвище *</label>
              <input className={inputCls} value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Іваненко" />
            </div>
            <div>
              <label className={labelCls}>Ім'я *</label>
              <input className={inputCls} value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="Олексій" />
            </div>
          </div>

          <div>
            <label className={labelCls}>По батькові</label>
            <input className={inputCls} value={form.middleName} onChange={e => set("middleName", e.target.value)} placeholder="Миколайович" />
          </div>

          {/* Contacts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Телефон</label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                <input className={`${inputCls} pl-8`} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+380..." />
              </div>
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                <input type="email" className={`${inputCls} pl-8`} value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@..." />
              </div>
            </div>
          </div>

          {/* Personal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Дата народження</label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                <input type="date" className={`${inputCls} pl-8`} value={form.dateOfBirth} onChange={e => set("dateOfBirth", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Громадянство</label>
              <div className="relative">
                <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                <input className={`${inputCls} pl-8`} value={form.nationality} onChange={e => set("nationality", e.target.value)} placeholder="Україна" />
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Документ (паспорт / ID)</label>
            <div className="relative">
              <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
              <input className={`${inputCls} pl-8`} value={form.documentNumber} onChange={e => set("documentNumber", e.target.value)} placeholder="АА 123456" />
            </div>
          </div>

          {/* Loyalty + VIP */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className={labelCls}>Рівень лояльності</label>
              <div className="relative">
                <select
                  value={form.loyaltyLevel}
                  onChange={e => set("loyaltyLevel", e.target.value)}
                  className="w-full h-9 pl-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 appearance-none cursor-pointer"
                >
                  <option value="">Без рівня</option>
                  <option value="bronze">🥉 Бронза</option>
                  <option value="silver">🥈 Срібло</option>
                  <option value="gold">🥇 Золото</option>
                  <option value="platinum">💎 Платина</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => set("isVip", !form.isVip)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${form.isVip ? "bg-amber-400" : "bg-gray-200"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isVip ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
                <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-amber-500" /> VIP
                </span>
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Нотатки</label>
            <textarea
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder-gray-300 resize-none"
              rows={2}
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Алергія, побажання, особливості..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="flex-1 h-9 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
            Скасувати
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isEdit ? "Зберегти" : "Додати гостя"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Guest Profile Drawer ──────────────────────────────────────────────────────
function GuestDrawer({
  guestId, open, onClose, onEdit,
}: { guestId: number | null; open: boolean; onClose: () => void; onEdit: (g: any) => void }) {
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
          <div className="flex items-center gap-2 absolute top-4 right-4">
            {!isLoading && guest && (
              <button
                onClick={() => onEdit(guest)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                title="Редагувати"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>

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
              <div className="flex-1 min-w-0 pr-16">
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
                {[
                  { icon: Phone, label: "Тел.", value: guest.phone, href: `tel:${guest.phone}` },
                  { icon: Mail,  label: "Email", value: guest.email, href: `mailto:${guest.email}` },
                  { icon: Globe, label: "Країна", value: (guest as any).nationality },
                  { icon: Star,  label: "День нар.", value: guest.dateOfBirth
                    ? format(new Date(guest.dateOfBirth), "d MMMM yyyy", { locale: uk }) : null },
                  { icon: FileText, label: "Документ", value: (guest as any).documentNumber },
                ].filter(r => r.value).map((row, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <row.icon className="w-4 h-4 text-gray-300 shrink-0" />
                    <span className="text-xs text-gray-400 w-16">{row.label}</span>
                    {row.href ? (
                      <a href={row.href} className="text-sm text-indigo-600 hover:underline truncate">{row.value}</a>
                    ) : (
                      <span className="text-sm text-gray-800">{row.value}</span>
                    )}
                  </div>
                ))}
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
                    {(guest as any).bookings.slice(0, 8).map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                        <div>
                          <div className="font-medium text-gray-800">{b.unitName || `Юніт #${b.unitId}`}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {format(new Date(b.checkIn), "d MMM", { locale: uk })} – {format(new Date(b.checkOut), "d MMM yyyy", { locale: uk })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-emerald-600">{fmtUAH(b.totalAmount)}</div>
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                            b.status === "checked_in"  ? "bg-blue-50 text-blue-600" :
                            b.status === "confirmed"   ? "bg-emerald-50 text-emerald-600" :
                            b.status === "cancelled"   ? "bg-red-50 text-red-500" :
                            "bg-gray-100 text-gray-500"
                          }`}>{
                            b.status === "checked_in"  ? "Проживає" :
                            b.status === "confirmed"   ? "Підтверджено" :
                            b.status === "checked_out" ? "Виїхав" :
                            b.status === "cancelled"   ? "Скасовано" : b.status
                          }</span>
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
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm truncate">
              {guest.lastName} {guest.firstName}
            </span>
            <LoyaltyChip level={guest.loyaltyLevel} />
            {guest.isVip && <Shield className="w-3 h-3 text-amber-500 shrink-0" />}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
            {guest.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{guest.phone}</span>}
            {guest.email && <span className="truncate max-w-[160px]">{guest.email}</span>}
          </div>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          {guest.totalBookings !== undefined && (
            <div className="font-semibold text-gray-900 text-sm">{guest.totalBookings} бр.</div>
          )}
          {guest.totalRevenue !== undefined && guest.totalRevenue > 0 && (
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
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch]         = useState("");
  const [filterLoyalty, setFilterLoyalty] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeIdx, setActiveIdx]   = useState(-1);
  const [formOpen, setFormOpen]     = useState(false);
  const [editGuest, setEditGuest]   = useState<any>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: resp, isLoading } = useListGuests({});
  const guests = resp?.guests || [];

  const filtered = guests.filter(g => {
    const matchSearch = !search ||
      `${g.firstName} ${g.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      g.email?.toLowerCase().includes(search.toLowerCase()) ||
      g.phone?.includes(search);
    const matchLoyalty = !filterLoyalty || g.loyaltyLevel === filterLoyalty;
    return matchSearch && matchLoyalty;
  });

  const openGuest = (id: number, idx: number) => {
    setSelectedId(id); setActiveIdx(idx); setDrawerOpen(true);
  };

  const handleEdit = (g: any) => {
    setEditGuest(g); setFormOpen(true);
  };

  const handleSuccess = () => {
    qc.invalidateQueries({ queryKey: getListGuestsQueryKey() });
    setFormOpen(false); setEditGuest(null);
  };

  // Keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const inInput = ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName || "");
      if (!inInput) {
        if (e.key === "/")         { e.preventDefault(); searchRef.current?.focus(); return; }
        if (e.key === "n")         { e.preventDefault(); setEditGuest(null); setFormOpen(true); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
        if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
        if (e.key === "Enter" && activeIdx >= 0) openGuest(filtered[activeIdx].id, activeIdx);
      }
      if (inInput && e.key === "Escape") { (e.target as HTMLElement).blur(); setSearch(""); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [filtered, activeIdx]);

  const vipCount = guests.filter(g => g.isVip).length;

  return (
    <AppLayout>
      <div className="h-full flex flex-col min-h-0">

        {/* Toolbar */}
        <div className="px-6 pt-5 pb-4 bg-white border-b border-gray-100 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 font-display">База гостей</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {guests.length} гостей · {vipCount} VIP
              </p>
            </div>
            <button
              onClick={() => { setEditGuest(null); setFormOpen(true); }}
              className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-500/25 transition-colors"
            >
              <Plus className="w-4 h-4" /> Новий гість
              <kbd className="ml-1 text-[10px] bg-indigo-500/50 px-1 py-0.5 rounded font-mono hidden sm:inline">N</kbd>
            </button>
          </div>

          <div className="flex gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Пошук за ім'ям, email, телефоном..."
                className="w-full h-9 pl-9 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* Loyalty filter */}
            <select
              value={filterLoyalty}
              onChange={e => setFilterLoyalty(e.target.value)}
              className="h-9 pl-2.5 pr-7 text-xs border border-gray-200 rounded-xl bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="">Всі</option>
              <option value="bronze">Бронза</option>
              <option value="silver">Срібло</option>
              <option value="gold">Золото</option>
              <option value="platinum">Платина</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Users className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400">Гостей не знайдено</p>
              {search && <button onClick={() => setSearch("")} className="text-xs text-indigo-500 hover:underline">Скинути</button>}
              {!search && (
                <button
                  onClick={() => { setEditGuest(null); setFormOpen(true); }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Додати першого гостя
                </button>
              )}
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
          {[["N","новий"],["/ ","пошук"],["↑↓","навігація"],["↵","профіль"],["ESC","закрити"]].map(([k,l]) => (
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
        onEdit={handleEdit}
      />

      <GuestFormDialog
        open={formOpen}
        guest={editGuest}
        onClose={() => { setFormOpen(false); setEditGuest(null); }}
        onSuccess={handleSuccess}
      />
    </AppLayout>
  );
}
