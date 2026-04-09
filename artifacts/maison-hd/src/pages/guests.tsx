import { useState, useEffect, useRef } from "react";
import {
  Search, Plus, Mail, Phone, Loader2, Star, Users,
  Globe, Shield, ArrowRight, X, Edit2, UserPlus,
  Calendar, FileText, ChevronDown, Download, MapPin,
  Moon, CreditCard, Clock, BadgeCheck,
} from "lucide-react";
import {
  useListGuests, useGetGuest, useCreateGuest, useUpdateGuest,
  getListGuestsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { format, differenceInYears } from "date-fns";
import { uk } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const tok = () => localStorage.getItem("hms_token") || "";

const fmtUAH = (n: number) =>
  new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | null | undefined) =>
  d ? format(new Date(d), "d MMM yyyy", { locale: uk }) : "—";

const fmtShortDate = (d: string | null | undefined) =>
  d ? format(new Date(d), "d MMM", { locale: uk }) : "—";

const LOYALTY: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  bronze:   { label: "Бронза",   bg: "bg-amber-50",   text: "text-amber-700",  ring: "ring-amber-200" },
  silver:   { label: "Срібло",   bg: "bg-slate-50",   text: "text-slate-600",  ring: "ring-slate-200" },
  gold:     { label: "Золото",   bg: "bg-yellow-50",  text: "text-yellow-700", ring: "ring-yellow-200" },
  platinum: { label: "Платина",  bg: "bg-violet-50",  text: "text-violet-700", ring: "ring-violet-200" },
};

const SOURCE_LABELS: Record<string, string> = {
  direct: "Прямий",
  booking_com: "Booking.com",
  online: "Онлайн",
  airbnb: "Airbnb",
  phone: "Телефон",
  walkin: "Без броні",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending:     { label: "Очікує",       cls: "bg-amber-50 text-amber-600" },
  confirmed:   { label: "Підтверджено", cls: "bg-emerald-50 text-emerald-600" },
  checked_in:  { label: "Проживає",     cls: "bg-blue-50 text-blue-600" },
  checked_out: { label: "Виїхав",       cls: "bg-gray-100 text-gray-500" },
  cancelled:   { label: "Скасовано",    cls: "bg-red-50 text-red-500" },
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
    phone: "", email: "", birthDate: "",
    nationality: "", passportNumber: "", notes: "",
    loyaltyLevel: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        firstName:      guest?.firstName      || "",
        lastName:       guest?.lastName       || "",
        middleName:     guest?.middleName     || "",
        phone:          guest?.phone          || "",
        email:          guest?.email          || "",
        birthDate:      guest?.birthDate      || guest?.dateOfBirth || "",
        nationality:    guest?.nationality    || "",
        passportNumber: guest?.passportNumber || guest?.documentNumber || "",
        notes:          guest?.notes          || "",
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
      birthDate:      form.birthDate || undefined,
      nationality:    form.nationality.trim() || undefined,
      passportNumber: form.passportNumber.trim() || undefined,
      notes:          form.notes.trim() || undefined,
      loyaltyLevel:   form.loyaltyLevel || undefined,
    };
    if (form.middleName.trim()) data.middleName = form.middleName.trim();

    if (isEdit) {
      updateM.mutate({ guestId: guest.id, data }, {
        onSuccess: () => { toast({ title: "Гостя оновлено" }); onSuccess(); },
        onError:   (e: any) => toast({ title: e?.message || "Помилка", variant: "destructive" }),
      });
    } else {
      createM.mutate({ data }, {
        onSuccess: () => { toast({ title: "Гостя додано" }); onSuccess(); },
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

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Дата народження</label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                <input type="date" className={`${inputCls} pl-8`} value={form.birthDate} onChange={e => set("birthDate", e.target.value)} />
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
              <input className={`${inputCls} pl-8`} value={form.passportNumber} onChange={e => set("passportNumber", e.target.value)} placeholder="АА 123456" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Рівень лояльності</label>
            <div className="relative">
              <select
                value={form.loyaltyLevel}
                onChange={e => set("loyaltyLevel", e.target.value)}
                className="w-full h-9 pl-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 appearance-none cursor-pointer"
              >
                <option value="">Без рівня</option>
                <option value="bronze">Бронза</option>
                <option value="silver">Срібло</option>
                <option value="gold">Золото</option>
                <option value="platinum">Платина</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
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

  const bookings: any[] = (guest as any)?.bookings || [];
  const totalBookings = (guest as any)?.totalBookings ?? bookings.filter((b: any) => b.status !== "cancelled").length;
  const totalRevenue  = (guest as any)?.totalRevenue  ?? 0;
  const totalNights   = (guest as any)?.totalNightsCalc ?? guest?.totalNights ?? 0;

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      <div className={`fixed top-0 right-0 h-screen w-[460px] max-w-full z-50 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>

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
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <LoyaltyChip level={guest.loyaltyLevel} />
                  {guest.phone && (
                    <a href={`tel:${guest.phone}`} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                      <Phone className="w-3 h-3" />{guest.phone}
                    </a>
                  )}
                </div>
                {guest.birthDate && (
                  <p className="text-xs text-gray-400 mt-1">
                    {fmtDate(guest.birthDate)} · {differenceInYears(new Date(), new Date(guest.birthDate))} років
                  </p>
                )}
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
                  { icon: BadgeCheck, label: "Відвідувань", value: totalBookings, cls: "text-indigo-600" },
                  { icon: Moon,       label: "Ночей",       value: totalNights,   cls: "text-violet-600" },
                  { icon: CreditCard, label: "LTV",         value: totalRevenue > 0 ? fmtUAH(totalRevenue) : "—", cls: "text-emerald-600" },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.cls}`} />
                    <div className="font-bold text-gray-900 text-base">{s.value}</div>
                    <div className="text-[11px] text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Contacts & Personal Info */}
              <div className="space-y-0 bg-gray-50 rounded-xl overflow-hidden">
                {[
                  { icon: Phone,    label: "Телефон",   value: guest.phone,        href: `tel:${guest.phone}` },
                  { icon: Mail,     label: "Email",     value: guest.email,        href: `mailto:${guest.email}` },
                  { icon: Calendar, label: "Народився", value: guest.birthDate
                    ? `${fmtDate(guest.birthDate)} (${differenceInYears(new Date(), new Date(guest.birthDate))} р.)` : null },
                  { icon: Globe,    label: "Країна",    value: (guest as any).nationality },
                  { icon: FileText, label: "Документ",  value: (guest as any).passportNumber || (guest as any).documentNumber },
                  { icon: Clock,    label: "Останній візит", value: guest.lastVisit ? fmtDate(guest.lastVisit as any) : null },
                ].filter(r => r.value).map((row, i, arr) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${i < arr.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <row.icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-400 w-24 shrink-0">{row.label}</span>
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

              {/* Stay History */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Історія перебування ({bookings.length})
                </p>
                {bookings.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-400">Бронювань не знайдено</div>
                ) : (
                  <div className="space-y-2">
                    {bookings.map((b: any) => {
                      const st = STATUS_LABELS[b.status] || { label: b.status, cls: "bg-gray-100 text-gray-500" };
                      return (
                        <div key={b.id} className="border border-gray-100 rounded-xl p-3 bg-white hover:border-gray-200 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {/* Property + Unit */}
                              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                {b.propertyName && (
                                  <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                    <MapPin className="w-2.5 h-2.5" />{b.propertyName}
                                  </span>
                                )}
                                {b.propertyName && b.unitName && <span className="text-gray-200">·</span>}
                                {b.unitName && (
                                  <span className="text-xs font-semibold text-gray-700">{b.unitName}</span>
                                )}
                              </div>
                              {/* Dates */}
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>{fmtShortDate(b.checkIn)} – {fmtDate(b.checkOut)}</span>
                                {b.nights > 0 && (
                                  <span className="flex items-center gap-0.5 text-gray-400">
                                    <Moon className="w-2.5 h-2.5" />{b.nights} н.
                                  </span>
                                )}
                                {b.guestsCount > 1 && (
                                  <span className="flex items-center gap-0.5 text-gray-400">
                                    <Users className="w-2.5 h-2.5" />{b.guestsCount}
                                  </span>
                                )}
                              </div>
                              {/* Source */}
                              {b.source && (
                                <div className="text-[11px] text-gray-400 mt-0.5">
                                  {SOURCE_LABELS[b.source] || b.source}
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-semibold text-gray-900 text-sm">{fmtUAH(b.totalAmount)}</div>
                              {b.paidAmount > 0 && b.paidAmount < b.totalAmount && (
                                <div className="text-[11px] text-amber-600">Оплачено: {fmtUAH(b.paidAmount)}</div>
                              )}
                              <span className={`text-[11px] px-1.5 py-0.5 rounded-full mt-0.5 inline-block ${st.cls}`}>{st.label}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Guest Row (Table View) ─────────────────────────────────────────────────────
function GuestRow({ guest, onClick, isSelected }: { guest: any; onClick: () => void; isSelected: boolean }) {
  const initials = `${guest.firstName?.[0] || ""}${guest.lastName?.[0] || ""}`.toUpperCase();
  const grad = avatarGrad(guest.id);
  const age = guest.birthDate
    ? differenceInYears(new Date(), new Date(guest.birthDate))
    : null;

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer transition-colors hover:bg-indigo-50/40 ${isSelected ? "bg-indigo-50" : ""}`}
    >
      {/* Name + Avatar */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-xs shrink-0`}>
            {initials}
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-sm">
              {guest.lastName} {guest.firstName}
              {guest.middleName && ` ${guest.middleName}`}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <LoyaltyChip level={guest.loyaltyLevel} />
              {guest.isVip && <Shield className="w-3 h-3 text-amber-500" />}
            </div>
          </div>
        </div>
      </td>
      {/* Birth date + age */}
      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
        {guest.birthDate ? (
          <span className="text-gray-700">{fmtDate(guest.birthDate)}<span className="text-gray-400 ml-1 text-xs">({age} р.)</span></span>
        ) : <span className="text-gray-300">—</span>}
      </td>
      {/* Phone */}
      <td className="px-4 py-3 text-sm hidden sm:table-cell">
        {guest.phone ? (
          <a href={`tel:${guest.phone}`} onClick={e => e.stopPropagation()} className="text-indigo-600 hover:underline flex items-center gap-1">
            <Phone className="w-3 h-3" />{guest.phone}
          </a>
        ) : <span className="text-gray-300">—</span>}
      </td>
      {/* Email */}
      <td className="px-4 py-3 text-sm hidden lg:table-cell">
        {guest.email ? (
          <a href={`mailto:${guest.email}`} onClick={e => e.stopPropagation()} className="text-indigo-600 hover:underline truncate max-w-[160px] block">
            {guest.email}
          </a>
        ) : <span className="text-gray-300">—</span>}
      </td>
      {/* Visits */}
      <td className="px-4 py-3 text-center">
        <span className="inline-block min-w-[28px] py-0.5 text-center bg-indigo-50 text-indigo-700 font-bold text-sm rounded-lg">
          {guest.bookingCount ?? 0}
        </span>
      </td>
      {/* Total spent */}
      <td className="px-4 py-3 text-right hidden sm:table-cell">
        {guest.ltv > 0 ? (
          <span className="font-semibold text-emerald-600 text-sm">{fmtUAH(guest.ltv || 0)}</span>
        ) : <span className="text-gray-300">—</span>}
      </td>
      {/* Last visit */}
      <td className="px-4 py-3 text-sm text-gray-500 hidden xl:table-cell">
        {guest.lastVisit ? fmtShortDate(guest.lastVisit as any) : <span className="text-gray-300">—</span>}
      </td>
      <td className="pr-3">
        <ArrowRight className="w-4 h-4 text-gray-200 group-hover:text-indigo-400" />
      </td>
    </tr>
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
  const [exporting, setExporting]   = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: resp, isLoading } = useListGuests({});
  const guests = resp?.guests || [];

  const filtered = guests.filter(g => {
    const fullName = `${g.lastName} ${g.firstName} ${(g as any).middleName || ""}`.toLowerCase();
    const matchSearch = !search ||
      fullName.includes(search.toLowerCase()) ||
      g.email?.toLowerCase().includes(search.toLowerCase()) ||
      g.phone?.includes(search);
    const matchLoyalty = !filterLoyalty || g.loyaltyLevel === filterLoyalty;
    return matchSearch && matchLoyalty;
  });

  const openGuest = (id: number, idx: number) => {
    setSelectedId(id); setActiveIdx(idx); setDrawerOpen(true);
  };

  const handleEdit = (g: any) => { setEditGuest(g); setFormOpen(true); };

  const handleSuccess = () => {
    qc.invalidateQueries({ queryKey: getListGuestsQueryKey() });
    setFormOpen(false); setEditGuest(null);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/guests/export", {
        headers: { "Authorization": `Bearer ${tok()}` },
      });
      if (!res.ok) throw new Error("Помилка вигрузки");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `guests_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Вигрузка готова — ${filtered.length} гостей` });
    } catch (e: any) {
      toast({ title: e.message || "Помилка", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // Keyboard navigation
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

  const totalVisits = guests.reduce((acc, g) => acc + (g.bookingCount ?? 0), 0);
  const totalLtv    = guests.reduce((acc, g) => acc + (Number(g.ltv) || 0), 0);

  return (
    <AppLayout>
      <div className="h-full flex flex-col min-h-0">

        {/* Toolbar */}
        <div className="px-6 pt-5 pb-4 bg-white border-b border-gray-100 shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900 font-display">База гостей</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {guests.length} гостей · {totalVisits} відвідувань · LTV {fmtUAH(totalLtv)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                disabled={exporting || guests.length === 0}
                className="h-9 px-4 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Вигрузити CSV
              </button>
              <button
                onClick={() => { setEditGuest(null); setFormOpen(true); }}
                className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-500/25 transition-colors"
              >
                <Plus className="w-4 h-4" /> Новий гість
                <kbd className="ml-1 text-[10px] bg-indigo-500/50 px-1 py-0.5 rounded font-mono hidden sm:inline">N</kbd>
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Пошук за ПІБ, email, телефоном..."
                className="w-full h-9 pl-9 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
            <div className="relative">
              <select
                value={filterLoyalty}
                onChange={e => setFilterLoyalty(e.target.value)}
                className="h-9 pl-2.5 pr-7 text-xs border border-gray-200 rounded-xl bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer appearance-none"
              >
                <option value="">Всі рівні</option>
                <option value="bronze">Бронза</option>
                <option value="silver">Срібло</option>
                <option value="gold">Золото</option>
                <option value="platinum">Платина</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Users className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400">{search ? "Гостей не знайдено" : "База гостей порожня"}</p>
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
            <table className="w-full min-w-[600px]">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100">
                <tr className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left">ПІБ</th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell">Дата народження</th>
                  <th className="px-4 py-2.5 text-left hidden sm:table-cell">Телефон</th>
                  <th className="px-4 py-2.5 text-left hidden lg:table-cell">Email</th>
                  <th className="px-4 py-2.5 text-center">Відвід.</th>
                  <th className="px-4 py-2.5 text-right hidden sm:table-cell">LTV</th>
                  <th className="px-4 py-2.5 text-left hidden xl:table-cell">Ост. візит</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((g, i) => (
                  <GuestRow
                    key={g.id}
                    guest={g}
                    isSelected={i === activeIdx && drawerOpen && selectedId === g.id}
                    onClick={() => openGuest(g.id, i)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Shortcuts bar */}
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
