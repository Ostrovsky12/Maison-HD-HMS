import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Package, Plus, Pencil, Trash2, Star, StarOff, Loader2, Search,
  Tag, Clock, Users, ChevronDown, X, Check, Sparkles, Heart,
  Briefcase, Leaf, Zap, CalendarDays, TrendingUp, GripVertical,
  Eye, EyeOff, Gift,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "");
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(`${API}/api/packages${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });

const fmtMoney = (n: any) => parseFloat(n || 0).toLocaleString("uk-UA") + " ₴";
const fmtDate = (d: string) => d ? new Date(d + "T12:00").toLocaleDateString("uk-UA", { day: "2-digit", month: "short" }) : "";

type Pkg = {
  id: number; name: string; description?: string; category: string;
  price: string; originalPrice?: string; durationNights: number;
  maxGuests: number; inclusions: string[]; imageUrl?: string;
  validFrom?: string; validTo?: string; isFeatured: boolean;
  isActive: boolean; sortOrder: number; tags: string[]; notes?: string;
};

const CATEGORIES: { value: string; label: string; icon: any; color: string }[] = [
  { value: "romantic",  label: "Романтичний", icon: Heart,      color: "bg-rose-100 text-rose-700" },
  { value: "family",    label: "Сімейний",    icon: Users,      color: "bg-sky-100 text-sky-700" },
  { value: "business",  label: "Бізнес",      icon: Briefcase,  color: "bg-slate-100 text-slate-700" },
  { value: "wellness",  label: "Велнес",      icon: Leaf,       color: "bg-emerald-100 text-emerald-700" },
  { value: "adventure", label: "Пригоди",     icon: Zap,        color: "bg-orange-100 text-orange-700" },
  { value: "seasonal",  label: "Сезонний",    icon: CalendarDays,color: "bg-amber-100 text-amber-700" },
  { value: "honeymoon", label: "Медовий місяць",icon: Sparkles,  color: "bg-pink-100 text-pink-700" },
  { value: "group",     label: "Груповий",    icon: Users,      color: "bg-violet-100 text-violet-700" },
  { value: "custom",    label: "Власний",     icon: Gift,       color: "bg-gray-100 text-gray-700" },
];

const catInfo = (cat: string) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[CATEGORIES.length - 1];

const COMMON_INCLUSIONS = [
  "Сніданок включено", "Вечеря включена", "Обід включений",
  "Шампанське при заселенні", "Квіти в номері", "Фрукти та солодощі",
  "Романтичне оформлення", "Спа-процедура (60 хв)", "Масаж (30 хв)",
  "Прокат велосипедів", "Трансфер з/до аеропорту", "Безкоштовне пізнє виселення",
  "Рання реєстрація", "Вітальний подарунок", "Екскурсія",
  "Доступ до лазні/сауни", "Нічний перекус", "Пляшка вина",
];

const EMPTY: Omit<Pkg, "id" | "sortOrder" | "isActive"> = {
  name: "", description: "", category: "custom",
  price: "", originalPrice: "", durationNights: 1,
  maxGuests: 2, inclusions: [], imageUrl: "",
  validFrom: "", validTo: "", isFeatured: false,
  tags: [], notes: "",
};

export default function PackagesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [editing, setEditing] = useState<Pkg | typeof EMPTY | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [inclusion, setInclusion] = useState("");

  const { data: packages = [], isLoading } = useQuery<Pkg[]>({
    queryKey: ["packages"],
    queryFn: async () => {
      const r = await apiFetch("/all");
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiFetch("/", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["packages"] }); setEditing(null); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/${id}`, { method: "PATCH", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["packages"] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["packages"] }),
  });

  const toggleFeatured = (pkg: Pkg) => updateMut.mutate({ id: pkg.id, data: { isFeatured: !pkg.isFeatured } });
  const toggleActive = (pkg: Pkg) => updateMut.mutate({ id: pkg.id, data: { isActive: !pkg.isActive } });

  const openNew = () => { setEditing({ ...EMPTY }); setIsNew(true); };
  const openEdit = (pkg: Pkg) => { setEditing({ ...pkg }); setIsNew(false); };

  const handleSave = () => {
    if (!editing || !editing.name || !editing.price) return;
    const payload = {
      name: editing.name, description: editing.description,
      category: editing.category, price: editing.price,
      originalPrice: editing.originalPrice || null,
      durationNights: editing.durationNights, maxGuests: editing.maxGuests,
      inclusions: editing.inclusions, imageUrl: editing.imageUrl || null,
      validFrom: editing.validFrom || null, validTo: editing.validTo || null,
      isFeatured: editing.isFeatured, tags: editing.tags, notes: editing.notes,
    };
    if (isNew) createMut.mutate(payload);
    else updateMut.mutate({ id: (editing as Pkg).id, data: payload });
  };

  const addInclusion = (item: string) => {
    if (!editing || !item.trim()) return;
    if (!editing.inclusions.includes(item.trim()))
      setEditing({ ...editing, inclusions: [...editing.inclusions, item.trim()] });
    setInclusion("");
  };

  const removeInclusion = (i: number) => {
    if (!editing) return;
    setEditing({ ...editing, inclusions: editing.inclusions.filter((_, idx) => idx !== i) });
  };

  const filtered = packages.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const discount = (pkg: Pkg) => {
    if (!pkg.originalPrice) return null;
    const orig = parseFloat(pkg.originalPrice);
    const curr = parseFloat(pkg.price);
    if (!orig || orig <= curr) return null;
    return Math.round((1 - curr / orig) * 100);
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
                <Gift className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Пакетні пропозиції</h1>
            </div>
            <p className="text-sm text-gray-500">Конструктор готельних пакетів · тематичні програми · спеціальні пропозиції</p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Новий пакет
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Пошук пакетів..."
              className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm w-full bg-white"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCatFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${catFilter === "all" ? "bg-violet-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              Всі
            </button>
            {CATEGORIES.map(c => {
              const Icon = c.icon;
              return (
                <button key={c.value} onClick={() => setCatFilter(c.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors ${catFilter === c.value ? "bg-violet-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  <Icon className="w-3 h-3" />{c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Всього пакетів</p>
            <p className="text-2xl font-bold text-gray-900">{packages.length}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Активних</p>
            <p className="text-2xl font-bold text-emerald-600">{packages.filter(p => p.isActive).length}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Рекомендованих</p>
            <p className="text-2xl font-bold text-amber-600">{packages.filter(p => p.isFeatured).length}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Середня ціна</p>
            <p className="text-2xl font-bold text-violet-600">
              {packages.length ? fmtMoney(packages.reduce((s, p) => s + parseFloat(p.price || "0"), 0) / packages.length) : "—"}
            </p>
          </div>
        </div>

        {/* ── Package Grid ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white border border-dashed border-gray-200 rounded-2xl">
            <Gift className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium text-lg mb-1">{packages.length === 0 ? "Пакетів ще немає" : "Нічого не знайдено"}</p>
            <p className="text-gray-400 text-sm mb-4">{packages.length === 0 ? "Створіть перший тематичний пакет для гостей" : "Спробуйте інший пошук або фільтр"}</p>
            {packages.length === 0 && (
              <button onClick={openNew} className="px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors">
                <Plus className="w-4 h-4 inline mr-1.5" />Створити перший пакет
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(pkg => {
              const cat = catInfo(pkg.category);
              const CatIcon = cat.icon;
              const disc = discount(pkg);
              return (
                <div
                  key={pkg.id}
                  className={`bg-white border rounded-2xl shadow-sm overflow-hidden group transition-all hover:shadow-md ${!pkg.isActive ? "opacity-60" : ""}`}
                >
                  {/* Card Header */}
                  <div className="relative bg-gradient-to-br from-violet-50 to-violet-100/30 px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cat.color}`}>
                          <CatIcon className="w-3 h-3" />{cat.label}
                        </span>
                        {pkg.isFeatured && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                            <Star className="w-3 h-3 fill-amber-500" />Featured
                          </span>
                        )}
                        {!pkg.isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Неактивний</span>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => toggleFeatured(pkg)} title={pkg.isFeatured ? "Прибрати з рекомендованих" : "Додати до рекомендованих"}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-500">
                          {pkg.isFeatured ? <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> : <StarOff className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => toggleActive(pkg)} title={pkg.isActive ? "Деактивувати" : "Активувати"}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                          {pkg.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => openEdit(pkg)}
                          className="p-1.5 rounded-lg hover:bg-violet-50 text-gray-400 hover:text-violet-600">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => confirm(`Видалити пакет "${pkg.name}"?`) && deleteMut.mutate(pkg.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <h3 className="font-semibold text-gray-900 mt-2 text-base">{pkg.name}</h3>
                    {pkg.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{pkg.description}</p>}
                  </div>

                  {/* Card Body */}
                  <div className="px-4 py-3 space-y-3">
                    {/* Price */}
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-violet-700">{fmtMoney(pkg.price)}</span>
                      {pkg.originalPrice && parseFloat(pkg.originalPrice) > parseFloat(pkg.price) && (
                        <span className="text-sm text-gray-400 line-through">{fmtMoney(pkg.originalPrice)}</span>
                      )}
                      {disc && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-semibold">-{disc}%</span>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{pkg.durationNights} ніч</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />до {pkg.maxGuests} ос.</span>
                      {(pkg.validFrom || pkg.validTo) && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {pkg.validFrom ? fmtDate(pkg.validFrom) : "∞"} – {pkg.validTo ? fmtDate(pkg.validTo) : "∞"}
                        </span>
                      )}
                    </div>

                    {/* Inclusions */}
                    {pkg.inclusions.length > 0 && (
                      <div className="space-y-1">
                        {pkg.inclusions.slice(0, 4).map((inc, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />{inc}
                          </div>
                        ))}
                        {pkg.inclusions.length > 4 && (
                          <p className="text-xs text-violet-500 font-medium">+{pkg.inclusions.length - 4} ще...</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Create/Edit Modal ── */}
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
                    {isNew ? <Plus className="w-4 h-4 text-white" /> : <Pencil className="w-4 h-4 text-white" />}
                  </div>
                  <h2 className="font-semibold text-gray-900">{isNew ? "Новий пакет" : "Редагувати пакет"}</h2>
                </div>
                <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5 space-y-5">
                {/* Name + Category */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Назва пакету *</label>
                    <input
                      value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                      placeholder="Романтичний уїкенд"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Категорія</label>
                    <select
                      value={editing.category}
                      onChange={e => setEditing({ ...editing, category: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                    >
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Ночей</label>
                    <input
                      type="number" min={1} value={editing.durationNights}
                      onChange={e => setEditing({ ...editing, durationNights: Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Опис</label>
                  <textarea
                    value={editing.description || ""} rows={2}
                    onChange={e => setEditing({ ...editing, description: e.target.value })}
                    placeholder="Короткий опис пакету для гостей..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none"
                  />
                </div>

                {/* Pricing */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Ціна (₴) *</label>
                    <input
                      type="number" value={editing.price}
                      onChange={e => setEditing({ ...editing, price: e.target.value })}
                      placeholder="5900"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Стара ціна (₴)</label>
                    <input
                      type="number" value={editing.originalPrice || ""}
                      onChange={e => setEditing({ ...editing, originalPrice: e.target.value })}
                      placeholder="7900"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Макс. гостей</label>
                    <input
                      type="number" min={1} value={editing.maxGuests}
                      onChange={e => setEditing({ ...editing, maxGuests: Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>

                {/* Validity */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Дійсний з</label>
                    <input
                      type="date" value={editing.validFrom || ""}
                      onChange={e => setEditing({ ...editing, validFrom: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Дійсний до</label>
                    <input
                      type="date" value={editing.validTo || ""}
                      onChange={e => setEditing({ ...editing, validTo: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>

                {/* Inclusions */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-2 block">Що включено</label>
                  {editing.inclusions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {editing.inclusions.map((inc, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-violet-50 border border-violet-200 text-violet-700 text-xs px-2.5 py-1 rounded-full">
                          <Check className="w-3 h-3 text-emerald-500" />{inc}
                          <button onClick={() => removeInclusion(i)} className="ml-0.5 text-violet-400 hover:text-red-500">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mb-2">
                    <input
                      value={inclusion}
                      onChange={e => setInclusion(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addInclusion(inclusion)}
                      placeholder="Додати послугу..."
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => addInclusion(inclusion)}
                      className="px-3 py-2 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-xl text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Quick-add buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_INCLUSIONS.filter(i => !editing.inclusions.includes(i)).slice(0, 12).map(item => (
                      <button key={item} onClick={() => addInclusion(item)}
                        className="text-xs px-2.5 py-1 bg-gray-50 hover:bg-violet-50 border border-gray-200 hover:border-violet-200 text-gray-600 hover:text-violet-700 rounded-full transition-colors">
                        + {item}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Featured toggle */}
                <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Рекомендований пакет</p>
                      <p className="text-xs text-gray-500">Буде виділений на сайті та в системі</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditing({ ...editing, isFeatured: !editing.isFeatured })}
                    className={`w-10 h-6 rounded-full transition-colors ${editing.isFeatured ? "bg-amber-500" : "bg-gray-200"}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${editing.isFeatured ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Внутрішні нотатки</label>
                  <textarea
                    value={editing.notes || ""} rows={2}
                    onChange={e => setEditing({ ...editing, notes: e.target.value })}
                    placeholder="Тільки для персоналу..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between sticky bottom-0 bg-white rounded-b-2xl">
                {!editing.name || !editing.price ? (
                  <p className="text-xs text-amber-600">Вкажіть назву та ціну</p>
                ) : <span />}
                <div className="flex gap-3">
                  <button onClick={() => setEditing(null)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50">
                    Скасувати
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={createMut.isPending || updateMut.isPending || !editing.name || !editing.price}
                    className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                  >
                    {(createMut.isPending || updateMut.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {isNew ? "Створити пакет" : "Зберегти зміни"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
