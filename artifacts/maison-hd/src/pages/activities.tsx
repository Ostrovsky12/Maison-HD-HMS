import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../components/layout/app-layout';
import {
  Bike, Waves, Star, Calendar, BarChart2, Plus, X, Clock,
  Users, CheckCircle, RefreshCw, Search, ArrowRight, AlertTriangle,
  Package, Zap, CreditCard, Heart, Palette, Trophy, Fish, ChevronDown,
  ChevronRight, MapPin, User, Phone, Flame, Circle
} from 'lucide-react';

const BASE = '/api';
const getToken = () => localStorage.getItem('hms_token') || '';
const apiFetch = (url: string, opts: RequestInit = {}) =>
  fetch(`${BASE}${url}`, { ...opts, headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });

// ─── UTILS ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${color} flex-shrink-0`}><Icon className="w-4 h-4" /></div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-gray-900 leading-tight">{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

const CONDITION_LABELS: Record<string, string> = {
  excellent: 'Відмінний', good: 'Добрий', fair: 'Задовільний',
  poor: 'Поганий', under_repair: 'На ремонті', retired: 'Списаний'
};
const CONDITION_COLORS: Record<string, string> = {
  excellent: 'bg-green-100 text-green-700', good: 'bg-blue-100 text-blue-700',
  fair: 'bg-amber-100 text-amber-700', poor: 'bg-red-100 text-red-700',
  under_repair: 'bg-orange-100 text-orange-700', retired: 'bg-gray-100 text-gray-500'
};
const CATEGORY_LABELS: Record<string, string> = {
  water: 'Водні', sport: 'Спортивні', creative: 'Творчі',
  kids: 'Дитячі', wellness: 'Wellness', tour: 'Тури'
};
const SESSION_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600'
};
const SESSION_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Заплановано', in_progress: 'Іде зараз',
  completed: 'Завершено', cancelled: 'Скасовано'
};

// ─── RENTAL TAB ─────────────────────────────────────────────────────────────
function RentalTab() {
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [availFilter, setAvailFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showRentForm, setShowRentForm] = useState<any>(null);
  const [showReturn, setShowReturn] = useState<any>(null);
  const [rentForm, setRentForm] = useState({ guest_name: '', guest_phone: '', duration_hours: 2, notes: '' });
  const [returnForm, setReturnForm] = useState({ damage_notes: '', damage_charge: 0, deposit_returned: true });
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'inventory' | 'maintenance' | 'history'>('inventory');
  const [allRentals, setAllRentals] = useState<any[]>([]);
  const [updatingItem, setUpdatingItem] = useState<number | null>(null);
  const [showConditionEdit, setShowConditionEdit] = useState<any>(null);
  const [conditionForm, setConditionForm] = useState({ condition: 'good', notes: '' });
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '', icon: '🚲', color: '#6366f1', rental_unit: 'hour', deposit_required: false, deposit_amount: 0 });
  const [showNewItem, setShowNewItem] = useState(false);
  const [itemForm, setItemForm] = useState({ category_id: '', name: '', serial_number: '', condition: 'good', price_per_hour: '', price_per_half_day: '', price_per_day: '', size_info: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, iRes, rRes, allRRes] = await Promise.all([
      apiFetch('/activities/equipment/categories').then(r => r.json()),
      apiFetch('/activities/equipment/items').then(r => r.json()),
      apiFetch('/activities/equipment/rentals?active=true').then(r => r.json()),
      apiFetch('/activities/equipment/rentals').then(r => r.json()),
    ]);
    setCategories(cRes.categories || []);
    setItems(iRes.items || []);
    setRentals(rRes.rentals || []);
    setAllRentals(allRRes.rentals || []);
    setLoading(false);
  }, []);

  const updateCondition = async (itemId: number, condition: string, notes: string) => {
    setUpdatingItem(itemId);
    await apiFetch(`/activities/equipment/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ condition, notes, is_available: condition !== 'under_repair' && condition !== 'retired' }),
    });
    setUpdatingItem(null);
    setShowConditionEdit(null);
    load();
  };

  useEffect(() => { load(); }, [load]);

  const filteredItems = items.filter((i: any) => {
    if (selectedCat && i.category_id !== selectedCat) return false;
    if (availFilter === 'available' && !i.is_available) return false;
    if (availFilter === 'rented' && i.is_available) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openRentForm = (item: any) => {
    setShowRentForm(item);
    const pricePerHour = item.price_per_hour || 0;
    setRentForm({ guest_name: '', guest_phone: '', duration_hours: 2, notes: '' });
  };

  const saveRent = async () => {
    if (!rentForm.guest_name || !showRentForm) return;
    setSaving(true);
    const cat = categories.find((c: any) => c.id === showRentForm.category_id);
    const pricePerHour = showRentForm.price_per_hour || 0;
    const price = pricePerHour * rentForm.duration_hours;
    const deposit = cat?.deposit_required ? cat.deposit_amount : 0;
    await apiFetch('/activities/equipment/rentals', {
      method: 'POST',
      body: JSON.stringify({
        item_id: showRentForm.id,
        guest_name: rentForm.guest_name,
        guest_phone: rentForm.guest_phone,
        duration_hours: rentForm.duration_hours,
        price_charged: price,
        deposit_taken: deposit,
        notes: rentForm.notes
      })
    });
    setSaving(false);
    setShowRentForm(null);
    load();
  };

  const saveReturn = async () => {
    if (!showReturn) return;
    setSaving(true);
    await apiFetch(`/activities/equipment/rentals/${showReturn.id}/return`, {
      method: 'PATCH',
      body: JSON.stringify(returnForm)
    });
    setSaving(false);
    setShowReturn(null);
    load();
  };

  const calcPrice = (item: any, hours: number) => {
    if (!item.price_per_hour) return item.price_per_day || 0;
    return item.price_per_hour * hours;
  };

  const getRemainingMins = (rental: any) => {
    const end = new Date(rental.end_time);
    const now = new Date();
    return Math.floor((end.getTime() - now.getTime()) / 60000);
  };

  const createCategory = async () => {
    if (!catForm.name) return;
    setSaving(true);
    await apiFetch('/activities/equipment/categories', { method: 'POST', body: JSON.stringify({ ...catForm, deposit_amount: Number(catForm.deposit_amount) }) });
    setSaving(false);
    setShowNewCategory(false);
    setCatForm({ name: '', description: '', icon: '🚲', color: '#6366f1', rental_unit: 'hour', deposit_required: false, deposit_amount: 0 });
    load();
  };

  const createItem = async () => {
    if (!itemForm.name || !itemForm.category_id) return;
    setSaving(true);
    await apiFetch('/activities/equipment/items', {
      method: 'POST',
      body: JSON.stringify({
        ...itemForm,
        category_id: Number(itemForm.category_id),
        price_per_hour: itemForm.price_per_hour ? Number(itemForm.price_per_hour) : null,
        price_per_half_day: itemForm.price_per_half_day ? Number(itemForm.price_per_half_day) : null,
        price_per_day: itemForm.price_per_day ? Number(itemForm.price_per_day) : null,
      })
    });
    setSaving(false);
    setShowNewItem(false);
    setItemForm({ category_id: '', name: '', serial_number: '', condition: 'good', price_per_hour: '', price_per_half_day: '', price_per_day: '', size_info: '', notes: '' });
    load();
  };

  return (
    <div>
      {/* Active rentals bar */}
      {rentals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">Активні оренди ({rentals.length})</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {rentals.map((r: any) => {
              const minsLeft = getRemainingMins(r);
              const isOverdue = minsLeft < 0;
              return (
                <div key={r.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${isOverdue ? 'bg-red-50 border-red-300' : 'bg-white border-amber-200'}`}>
                  <span>{r.category_icon}</span>
                  <div>
                    <div className="font-medium text-gray-800">{r.item_name}</div>
                    <div className="text-gray-500">{r.guest_name}</div>
                  </div>
                  <div className={`font-bold ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                    {isOverdue ? `+${Math.abs(minsLeft)}хв` : `${minsLeft}хв`}
                  </div>
                  <button onClick={() => { setShowReturn(r); setReturnForm({ damage_notes: '', damage_charge: 0, deposit_returned: true }); }}
                    className="bg-green-600 text-white px-2 py-0.5 rounded-lg hover:bg-green-700 font-medium">
                    Повернути
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View mode toggle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          {([['inventory','📦 Інвентар'],['maintenance','🔧 Обслуговування'],['history','📋 Історія']] as [string,string][]).map(([v,l]) => (
            <button key={v} onClick={() => setViewMode(v as any)} className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${viewMode === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => setShowNewCategory(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 text-indigo-600 text-xs font-medium rounded-lg hover:bg-indigo-50">
          <Plus className="w-3.5 h-3.5" /> Категорія
        </button>
        <button onClick={() => { setShowNewItem(true); setItemForm(f => ({ ...f, category_id: categories.length > 0 ? String(categories[0].id) : '' })); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">
          <Plus className="w-3.5 h-3.5" /> Інвентар
        </button>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg bg-white"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      {/* ── MAINTENANCE VIEW ── */}
      {viewMode === 'maintenance' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[['excellent','Відмінний','bg-green-100 text-green-700'],['good','Добрий','bg-blue-100 text-blue-700'],['fair','Задовільний','bg-amber-100 text-amber-700'],['poor','Поганий','bg-red-100 text-red-700']].map(([c,l,cls]) => {
              const count = items.filter((i: any) => i.condition === c).length;
              return <div key={c} className="bg-white border border-gray-200 rounded-xl p-2.5 text-center"><div className={`text-lg font-bold`}>{count}</div><div className={`text-xs px-2 py-0.5 rounded-full ${cls} mt-0.5`}>{l}</div></div>;
            })}
          </div>

          {(['under_repair','poor','fair','good','excellent'] as const).map(cond => {
            const condItems = items.filter((i: any) => i.condition === cond);
            if (condItems.length === 0) return null;
            return (
              <div key={cond} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className={`px-3 py-2 text-xs font-semibold flex items-center gap-2 border-b border-gray-100 ${CONDITION_COLORS[cond] || 'bg-gray-50 text-gray-600'}`}>
                  {cond === 'under_repair' && '🔧'} {cond === 'poor' && '⚠️'} {cond === 'fair' && '⚡'} {cond === 'good' && '✓'} {cond === 'excellent' && '⭐'}
                  {CONDITION_LABELS[cond] || cond} ({condItems.length})
                </div>
                <div className="divide-y divide-gray-50">
                  {condItems.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="text-xl">{item.category_icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{item.name}</div>
                        <div className="text-xs text-gray-400">{item.category_name} {item.serial_number ? `· ${item.serial_number}` : ''}</div>
                        {item.notes && <div className="text-xs text-amber-600 mt-0.5 truncate">{item.notes}</div>}
                        {item.last_maintenance_at && <div className="text-xs text-gray-300 mt-0.5">Обслуговування: {new Date(item.last_maintenance_at).toLocaleDateString('uk-UA')}</div>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {cond === 'under_repair' && (
                          <button onClick={() => { setShowConditionEdit(item); setConditionForm({ condition: 'good', notes: '' }); }}
                            disabled={updatingItem === item.id}
                            className="text-xs bg-green-50 border border-green-300 text-green-700 px-2 py-1 rounded-lg hover:bg-green-100 disabled:opacity-50">
                            Готово
                          </button>
                        )}
                        <button onClick={() => { setShowConditionEdit(item); setConditionForm({ condition: item.condition, notes: item.notes || '' }); }}
                          className="text-xs bg-gray-50 border border-gray-200 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">
                          Змінити
                        </button>
                        {cond !== 'under_repair' && item.is_available && (
                          <button onClick={() => updateCondition(item.id, 'under_repair', 'На ремонті')}
                            disabled={updatingItem === item.id}
                            className="text-xs bg-orange-50 border border-orange-300 text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 disabled:opacity-50">
                            На ремонт
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── HISTORY VIEW ── */}
      {viewMode === 'history' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-sm font-medium text-gray-700">{allRentals.length} оренд всього</div>
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full inline-block" />Прострочено</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full inline-block" />Повернено</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-full inline-block" />Активно</span>
            </div>
          </div>
          {allRentals.length === 0 ? <div className="text-center py-10 text-gray-400">Оренд ще не було</div> : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="divide-y divide-gray-50">
                {[...allRentals].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((r: any) => {
                  const statusColor = r.status === 'returned' ? 'text-green-600' : r.status === 'overdue' ? 'text-red-600' : r.status === 'active' ? 'text-amber-600' : 'text-gray-400';
                  const statusLabel = { returned: 'Повернено', overdue: 'Прострочено', active: 'Активно', cancelled: 'Скасовано' }[r.status as string] || r.status;
                  const hasDamage = r.damage_charge && Number(r.damage_charge) > 0;
                  return (
                    <div key={r.id} className="px-3 py-2.5 flex items-start gap-3">
                      <span className="text-xl flex-shrink-0">{r.category_icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">{r.item_name}</span>
                          <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                          {hasDamage && <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full">Пошкодження: {Number(r.damage_charge).toLocaleString('uk-UA')} ₴</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {r.guest_name} {r.guest_phone && `· ${r.guest_phone}`}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(r.start_time).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {' → '}
                          {new Date(r.end_time).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {r.damage_notes && <div className="text-xs text-red-500 mt-0.5">{r.damage_notes}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-gray-800">{Number(r.price_charged).toLocaleString('uk-UA')} ₴</div>
                        {Number(r.deposit_taken) > 0 && <div className="text-xs text-gray-400">Деп: {Number(r.deposit_taken).toLocaleString('uk-UA')} ₴</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INVENTORY VIEW ── */}
      {viewMode === 'inventory' && (<>
        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Пошук інвентарю..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white" />
          </div>
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            {[['all','Весь'],['available','Вільний'],['rented','В оренді']].map(([v,l]) => (
              <button key={v} onClick={() => setAvailFilter(v)} className={`px-3 py-1.5 rounded-md font-medium transition-colors ${availFilter === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
            ))}
          </div>
        </div>

        {/* Category filter tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setSelectedCat(null)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!selectedCat ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            Всі ({items.length})
          </button>
          {categories.map((c: any) => (
            <button key={c.id} onClick={() => setSelectedCat(c.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${selectedCat === c.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {c.icon} {c.name} <span className="opacity-70">({c.available_items}/{c.total_items})</span>
            </button>
          ))}
        </div>

        {loading ? <div className="text-center py-12 text-gray-400">Завантаження...</div> : categories.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-gray-200 rounded-2xl">
            <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium mb-1">Немає категорій обладнання</p>
            <p className="text-sm text-gray-400 mb-4">Спочатку додайте категорії (велосипеди, SUP-борди, рибальське спорядження тощо), потім — конкретні одиниці інвентарю</p>
            <button onClick={() => setShowNewCategory(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> Додати першу категорію
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-white border border-dashed border-gray-200 rounded-2xl">
            <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 mb-3">Інвентарю немає — додайте одиниці</p>
            <button onClick={() => { setShowNewItem(true); setItemForm(f => ({ ...f, category_id: categories.length > 0 ? String(categories[0].id) : '' })); }} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> Додати інвентар
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredItems.map((item: any) => {
              const activeRental = rentals.find((r: any) => r.item_id === item.id);
              const isAvail = item.is_available && !activeRental;
              return (
                <div key={item.id} className={`bg-white border rounded-xl p-3 transition-all ${!isAvail ? 'opacity-70 border-gray-200' : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{item.category_icon}</span>
                      <div>
                        <div className="font-medium text-sm text-gray-900 leading-tight">{item.name}</div>
                        {item.serial_number && <div className="text-xs text-gray-400">{item.serial_number}</div>}
                      </div>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${isAvail ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>

                  {item.size_info && <div className="text-xs text-gray-500 mb-2">{item.size_info}</div>}

                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${CONDITION_COLORS[item.condition] || 'bg-gray-100 text-gray-600'}`}>{CONDITION_LABELS[item.condition] || item.condition}</span>
                  </div>

                  <div className="text-xs text-gray-600 mb-2 space-y-0.5">
                    {item.price_per_hour && <div className="flex justify-between"><span>За годину:</span><span className="font-medium">{Number(item.price_per_hour).toLocaleString('uk-UA')} ₴</span></div>}
                    {item.price_per_half_day && <div className="flex justify-between"><span>Пів-дня:</span><span className="font-medium">{Number(item.price_per_half_day).toLocaleString('uk-UA')} ₴</span></div>}
                    {item.price_per_day && <div className="flex justify-between"><span>День:</span><span className="font-medium">{Number(item.price_per_day).toLocaleString('uk-UA')} ₴</span></div>}
                  </div>

                  {activeRental ? (
                    <div className="bg-amber-50 rounded-lg px-2 py-1.5 text-xs">
                      <div className="font-medium text-amber-800">{activeRental.guest_name}</div>
                      <div className="text-amber-600">Повернення: {new Date(activeRental.end_time).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  ) : isAvail ? (
                    <button onClick={() => openRentForm(item)} className="w-full bg-indigo-600 text-white py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700 mt-1">
                      Видати в оренду
                    </button>
                  ) : (
                    <div className="text-xs text-center text-gray-400 py-1">Недоступно</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </>)}

      {/* Rent form modal */}
      {showRentForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">Оренда: {showRentForm.name}</h3>
                <div className="text-xs text-gray-500">{showRentForm.category_icon} {showRentForm.category_name}</div>
              </div>
              <button onClick={() => setShowRentForm(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <input type="text" placeholder="Ім'я гостя *" value={rentForm.guest_name} onChange={e => setRentForm(f => ({ ...f, guest_name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <input type="tel" placeholder="Телефон" value={rentForm.guest_phone} onChange={e => setRentForm(f => ({ ...f, guest_phone: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Тривалість оренди (год)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 6, 8].map(h => (
                    <button key={h} onClick={() => setRentForm(f => ({ ...f, duration_hours: h }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${rentForm.duration_hours === h ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'}`}>
                      {h}г
                    </button>
                  ))}
                </div>
              </div>
              <textarea placeholder="Примітки" value={rentForm.notes} onChange={e => setRentForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
              <div className="bg-indigo-50 rounded-xl p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Вартість оренди:</span>
                  <span className="font-bold text-indigo-700">{calcPrice(showRentForm, rentForm.duration_hours).toLocaleString('uk-UA')} ₴</span>
                </div>
                {showRentForm.deposit_required && (
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-500">Депозит (повернеться):</span>
                    <span className="font-medium text-amber-600">{Number(showRentForm.deposit_amount || 0).toLocaleString('uk-UA')} ₴</span>
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-1">Повернення до: {new Date(Date.now() + rentForm.duration_hours * 3600000).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowRentForm(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={saveRent} disabled={!rentForm.guest_name || saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Збереження...' : 'Видати'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return modal */}
      {showReturn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">Повернення: {showReturn.item_name}</h3>
                <div className="text-xs text-gray-500">Орендар: {showReturn.guest_name}</div>
              </div>
              <button onClick={() => setShowReturn(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <textarea placeholder="Примітки щодо пошкоджень (якщо є)" value={returnForm.damage_notes} onChange={e => setReturnForm(f => ({ ...f, damage_notes: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
              {returnForm.damage_notes && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Сума за пошкодження (₴)</label>
                  <input type="number" min={0} value={returnForm.damage_charge} onChange={e => setReturnForm(f => ({ ...f, damage_charge: parseFloat(e.target.value) || 0 }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
              )}
              {Number(showReturn.deposit_taken) > 0 && (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={returnForm.deposit_returned} onChange={e => setReturnForm(f => ({ ...f, deposit_returned: e.target.checked }))} className="rounded" />
                  Депозит повернено ({Number(showReturn.deposit_taken).toLocaleString('uk-UA')} ₴)
                </label>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowReturn(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={saveReturn} disabled={saving} className="flex-1 bg-green-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Збереження...' : '✓ Прийнято'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Condition Edit Modal */}
      {showConditionEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">Стан: {showConditionEdit.name}</h3>
                <div className="text-xs text-gray-500">{showConditionEdit.category_icon} {showConditionEdit.category_name}</div>
              </div>
              <button onClick={() => setShowConditionEdit(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-2 block font-medium">Стан обладнання</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['excellent','good','fair','poor','under_repair','retired'] as const).map(c => (
                    <button key={c} onClick={() => setConditionForm(f => ({ ...f, condition: c }))}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors text-left ${conditionForm.condition === c ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <span className={`${CONDITION_COLORS[c] || 'text-gray-600'} text-xs px-1.5 py-0.5 rounded-full`}>{CONDITION_LABELS[c] || c}</span>
                    </button>
                  ))}
                </div>
              </div>
              <textarea placeholder="Нотатки (необхідний ремонт, пошкодження...)" value={conditionForm.notes} onChange={e => setConditionForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
              {conditionForm.condition === 'under_repair' && (
                <div className="bg-orange-50 rounded-xl p-3 text-xs text-orange-700">
                  Обладнання буде автоматично помічено як недоступне
                </div>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowConditionEdit(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={() => updateCondition(showConditionEdit.id, conditionForm.condition, conditionForm.notes)}
                disabled={updatingItem === showConditionEdit.id}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {updatingItem === showConditionEdit.id ? 'Збереження...' : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Category Modal */}
      {showNewCategory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">Нова категорія обладнання</h3>
              <button onClick={() => setShowNewCategory(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <input type="text" placeholder="Назва категорії *" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" autoFocus />
              <textarea placeholder="Опис" value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Іконка</label>
                  <input type="text" value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Колір</label>
                  <input type="color" value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))} className="w-full border border-gray-200 rounded-xl h-[38px] px-2 py-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Одиниця оренди</label>
                  <select value={catForm.rental_unit} onChange={e => setCatForm(f => ({ ...f, rental_unit: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white">
                    <option value="hour">Година</option>
                    <option value="half_day">Пів-дня</option>
                    <option value="day">День</option>
                    <option value="session">Сесія</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={catForm.deposit_required} onChange={e => setCatForm(f => ({ ...f, deposit_required: e.target.checked }))} className="rounded" />
                Потрібна застава
                {catForm.deposit_required && (
                  <input type="number" min={0} placeholder="Сума" value={catForm.deposit_amount} onChange={e => setCatForm(f => ({ ...f, deposit_amount: Number(e.target.value) }))} className="ml-2 w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm" />
                )}
              </label>
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowNewCategory(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={createCategory} disabled={!catForm.name || saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Збереження...' : 'Створити категорію'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Item Modal */}
      {showNewItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl my-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">Новий інвентар</h3>
              <button onClick={() => setShowNewItem(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Категорія *</label>
                <select value={itemForm.category_id} onChange={e => setItemForm(f => ({ ...f, category_id: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                  <option value="">Оберіть категорію</option>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <input type="text" placeholder="Назва *" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="Серійний № / інв. №" value={itemForm.serial_number} onChange={e => setItemForm(f => ({ ...f, serial_number: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <select value={itemForm.condition} onChange={e => setItemForm(f => ({ ...f, condition: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                  <option value="excellent">Відмінний</option>
                  <option value="good">Добрий</option>
                  <option value="fair">Задовільний</option>
                  <option value="poor">Поганий</option>
                </select>
              </div>
              <input type="text" placeholder="Розмір / параметри (напр. 26&quot;, S/M)" value={itemForm.size_info} onChange={e => setItemForm(f => ({ ...f, size_info: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Ціна/год (₴)</label>
                  <input type="number" min={0} value={itemForm.price_per_hour} onChange={e => setItemForm(f => ({ ...f, price_per_hour: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Пів-дня (₴)</label>
                  <input type="number" min={0} value={itemForm.price_per_half_day} onChange={e => setItemForm(f => ({ ...f, price_per_half_day: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">День (₴)</label>
                  <input type="number" min={0} value={itemForm.price_per_day} onChange={e => setItemForm(f => ({ ...f, price_per_day: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <textarea placeholder="Примітки" value={itemForm.notes} onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowNewItem(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={createItem} disabled={!itemForm.name || !itemForm.category_id || saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Збереження...' : 'Додати інвентар'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ACTIVITIES TAB ───────────────────────────────────────────────────────────
function ActivitiesTab() {
  const [types, setTypes] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [catFilter, setCatFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showBook, setShowBook] = useState<any>(null);
  const [bookForm, setBookForm] = useState({ guest_name: '', guest_phone: '', participant_count: 1, notes: '', special_requirements: '' });
  const [saving, setSaving] = useState(false);
  const [showNewSession, setShowNewSession] = useState<any>(null);
  const [sessionForm, setSessionForm] = useState({ session_date: new Date().toISOString().split('T')[0], start_time: '10:00', instructor_name: '', max_participants: '', notes: '' });
  const [showNewType, setShowNewType] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: '', description: '', category: 'sport', icon: '🏃', color: '#6366f1', difficulty: 'all_ages', duration_min: 60, max_participants: 10, price_per_person: 0, location: '', instructor_required: false, equipment_included: true });

  const today = new Date().toISOString().split('T')[0];
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const load = useCallback(async () => {
    setLoading(true);
    const [tRes, sRes] = await Promise.all([
      apiFetch('/activities/types').then(r => r.json()),
      apiFetch(`/activities/sessions?date_from=${today}&date_to=${weekLater}`).then(r => r.json()),
    ]);
    setTypes(tRes.types || []);
    setSessions(sRes.sessions || []);
    setLoading(false);
  }, [today, weekLater]);

  useEffect(() => { load(); }, [load]);

  const filteredTypes = catFilter === 'all' ? types : types.filter((t: any) => t.category === catFilter);
  const categories = [...new Set(types.map((t: any) => t.category))];

  const getTypeSessions = (typeId: number) => sessions.filter((s: any) => s.activity_type_id === typeId);

  const book = async () => {
    if (!bookForm.guest_name || !showBook) return;
    setSaving(true);
    await apiFetch(`/activities/sessions/${showBook.id}/book`, {
      method: 'POST',
      body: JSON.stringify({ ...bookForm })
    });
    setSaving(false);
    setShowBook(null);
    load();
  };

  const addSession = async () => {
    if (!showNewSession || !sessionForm.session_date || !sessionForm.start_time) return;
    setSaving(true);
    await apiFetch('/activities/sessions', {
      method: 'POST',
      body: JSON.stringify({
        activity_type_id: showNewSession.id,
        ...sessionForm,
        max_participants: sessionForm.max_participants ? parseInt(sessionForm.max_participants) : showNewSession.max_participants
      })
    });
    setSaving(false);
    setShowNewSession(null);
    load();
  };

  const getDifficultyLabel = (d: string) => ({ beginner: 'Для початківців', intermediate: 'Середній', advanced: 'Досвідчені', all_ages: 'Для всіх' }[d] || d);

  const changeSessionStatus = async (sessionId: number, status: string) => {
    await apiFetch(`/activities/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  };

  const createType = async () => {
    if (!typeForm.name) return;
    setSaving(true);
    await apiFetch('/activities/types', { method: 'POST', body: JSON.stringify({ ...typeForm, duration_min: Number(typeForm.duration_min), max_participants: Number(typeForm.max_participants), price_per_person: Number(typeForm.price_per_person) }) });
    setSaving(false);
    setShowNewType(false);
    setTypeForm({ name: '', description: '', category: 'sport', icon: '🏃', color: '#6366f1', difficulty: 'all_ages', duration_min: 60, max_participants: 10, price_per_person: 0, location: '', instructor_required: false, equipment_included: true });
    load();
  };

  return (
    <div>
      {/* Category filter */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {[['all','Всі'], ...categories.map(c => [c, CATEGORY_LABELS[c] || c])].map(([v, l]) => (
          <button key={v} onClick={() => setCatFilter(v)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${catFilter === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>{l}</button>
        ))}
        <button onClick={() => setShowNewType(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">
          <Plus className="w-3.5 h-3.5" /> Новий тип
        </button>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg bg-white"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Завантаження...</div> : (
        <div className="space-y-4">
          {filteredTypes.length === 0 && (
            <div className="text-center py-16 bg-white border border-dashed border-gray-200 rounded-2xl">
              <Star className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium mb-1">Немає типів активностей</p>
              <p className="text-sm text-gray-400 mb-4">Створіть перший тип активності — SUP, велосипеди, теніс, майстер-класи тощо</p>
              <button onClick={() => setShowNewType(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
                <Plus className="w-4 h-4" /> Створити тип активності
              </button>
            </div>
          )}
          {filteredTypes.map((type: any) => {
            const typeSessions = getTypeSessions(type.id);
            const todaySessions = typeSessions.filter((s: any) => s.session_date === today);
            return (
              <div key={type.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: type.color + '20' }}>
                    {type.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{type.name}</h3>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{CATEGORY_LABELS[type.category] || type.category}</span>
                      <span className="text-xs text-gray-400">{getDifficultyLabel(type.difficulty)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{type.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-gray-500">
                      <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{type.duration_min} хв</span>
                      <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />до {type.max_participants} ос.</span>
                      {type.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{type.location}</span>}
                      {type.equipment_included && <span className="text-green-600">✓ Інвентар включено</span>}
                      {type.instructor_required && <span className="text-blue-600">↳ Потрібен інструктор</span>}
                    </div>
                    <div className="font-bold text-indigo-600 mt-1">{Number(type.price_per_person).toLocaleString('uk-UA')} ₴/ос.</div>
                  </div>
                  <button onClick={() => { setShowNewSession(type); setSessionForm({ session_date: today, start_time: '10:00', instructor_name: '', max_participants: '', notes: '' }); }}
                    className="flex-shrink-0 flex items-center gap-1 text-xs border border-indigo-200 text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50">
                    <Plus className="w-3.5 h-3.5" /> Сесія
                  </button>
                </div>

                {typeSessions.length > 0 && (
                  <div className="border-t bg-gray-50 px-4 py-3">
                    <div className="text-xs font-medium text-gray-500 mb-2">Найближчі сесії</div>
                    <div className="space-y-1.5">
                      {typeSessions.slice(0, 3).map((s: any) => {
                        const spotsLeft = (s.max_participants || 10) - s.current_participants;
                        const isFull = spotsLeft <= 0;
                        return (
                          <div key={s.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-2.5 py-2 border border-gray-100">
                            <div className="flex items-center gap-2 text-xs min-w-0">
                              <span className={`px-1.5 py-0.5 rounded-full ${SESSION_STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-600'}`}>{SESSION_STATUS_LABELS[s.status] || s.status}</span>
                              <span className="text-gray-700 font-medium">{new Date(s.session_date + 'T12:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })} · {String(s.start_time).substring(0,5)}</span>
                              {s.instructor_name && <span className="text-gray-500 hidden sm:block">{s.instructor_name}</span>}
                              <span className={`flex items-center gap-0.5 ${isFull ? 'text-red-500' : spotsLeft <= 2 ? 'text-amber-500' : 'text-green-600'}`}>
                                <Users className="w-3 h-3" />{s.current_participants}/{s.max_participants}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!isFull && s.status === 'scheduled' && (
                                <button onClick={() => { setShowBook(s); setBookForm({ guest_name: '', guest_phone: '', participant_count: 1, notes: '', special_requirements: '' }); }}
                                  className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg hover:bg-indigo-700 font-medium">
                                  Записати
                                </button>
                              )}
                              {s.status === 'scheduled' && (
                                <button onClick={() => changeSessionStatus(s.id, 'in_progress')} className="text-xs border border-green-200 text-green-700 px-2 py-1 rounded-lg hover:bg-green-50">Почати</button>
                              )}
                              {s.status === 'in_progress' && (
                                <button onClick={() => changeSessionStatus(s.id, 'completed')} className="text-xs border border-gray-200 text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50">Завершити</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Book session modal */}
      {showBook && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">Запис: {showBook.activity_name}</h3>
                <div className="text-xs text-gray-500">
                  {new Date(showBook.session_date + 'T12:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} · {String(showBook.start_time).substring(0,5)} · вільно {(showBook.max_participants || 10) - showBook.current_participants} місць
                </div>
              </div>
              <button onClick={() => setShowBook(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <input type="text" placeholder="Ім'я гостя *" value={bookForm.guest_name} onChange={e => setBookForm(f => ({ ...f, guest_name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <input type="tel" placeholder="Телефон" value={bookForm.guest_phone} onChange={e => setBookForm(f => ({ ...f, guest_phone: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Кількість учасників</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setBookForm(f => ({ ...f, participant_count: Math.max(1, f.participant_count - 1) }))} className="w-8 h-8 border border-gray-200 rounded-lg flex items-center justify-center text-gray-600 hover:border-red-300">−</button>
                  <span className="font-bold text-lg text-gray-900">{bookForm.participant_count}</span>
                  <button onClick={() => setBookForm(f => ({ ...f, participant_count: f.participant_count + 1 }))} className="w-8 h-8 border border-gray-200 rounded-lg flex items-center justify-center text-gray-600 hover:border-green-300">+</button>
                  <span className="text-xs text-gray-500">= {(Number(showBook.price_per_person) * bookForm.participant_count).toLocaleString('uk-UA')} ₴</span>
                </div>
              </div>
              <input type="text" placeholder="Особливі побажання/алергії" value={bookForm.special_requirements} onChange={e => setBookForm(f => ({ ...f, special_requirements: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <textarea placeholder="Примітки" value={bookForm.notes} onChange={e => setBookForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowBook(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={book} disabled={!bookForm.guest_name || saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Збереження...' : `Записати (${bookForm.participant_count} ос.)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add session modal */}
      {showNewSession && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">Нова сесія: {showNewSession.name}</h3>
              <button onClick={() => setShowNewSession(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Дата *</label>
                  <input type="date" value={sessionForm.session_date} onChange={e => setSessionForm(f => ({ ...f, session_date: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Час початку *</label>
                  <input type="time" value={sessionForm.start_time} onChange={e => setSessionForm(f => ({ ...f, start_time: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <input type="text" placeholder="Інструктор / аніматор" value={sessionForm.instructor_name} onChange={e => setSessionForm(f => ({ ...f, instructor_name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Макс. учасників (за замовч. {showNewSession.max_participants})</label>
                <input type="number" min={1} placeholder={String(showNewSession.max_participants)} value={sessionForm.max_participants} onChange={e => setSessionForm(f => ({ ...f, max_participants: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <textarea placeholder="Примітки" value={sessionForm.notes} onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowNewSession(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={addSession} disabled={saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Збереження...' : 'Створити сесію'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New activity type modal */}
      {showNewType && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">Новий тип активності</h3>
              <button onClick={() => setShowNewType(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <input type="text" placeholder="Назва *" value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" autoFocus />
              <textarea placeholder="Опис" value={typeForm.description} onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Категорія</label>
                  <select value={typeForm.category} onChange={e => setTypeForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                    <option value="water">🌊 Водні</option>
                    <option value="sport">⚽ Спортивні</option>
                    <option value="creative">🎨 Творчі</option>
                    <option value="kids">🧒 Дитячі</option>
                    <option value="wellness">🧘 Wellness</option>
                    <option value="tour">🗺️ Тури</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Рівень складності</label>
                  <select value={typeForm.difficulty} onChange={e => setTypeForm(f => ({ ...f, difficulty: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                    <option value="all_ages">Для всіх</option>
                    <option value="beginner">Для початківців</option>
                    <option value="intermediate">Середній</option>
                    <option value="advanced">Досвідчені</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Тривалість (хв)</label>
                  <input type="number" min={15} value={typeForm.duration_min} onChange={e => setTypeForm(f => ({ ...f, duration_min: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Макс. учасників</label>
                  <input type="number" min={1} value={typeForm.max_participants} onChange={e => setTypeForm(f => ({ ...f, max_participants: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Ціна/особа (₴)</label>
                  <input type="number" min={0} value={typeForm.price_per_person} onChange={e => setTypeForm(f => ({ ...f, price_per_person: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Іконка</label>
                  <input type="text" value={typeForm.icon} onChange={e => setTypeForm(f => ({ ...f, icon: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="🏃" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Колір</label>
                  <input type="color" value={typeForm.color} onChange={e => setTypeForm(f => ({ ...f, color: e.target.value }))} className="w-full border border-gray-200 rounded-xl h-[38px] px-2 py-1" />
                </div>
              </div>
              <input type="text" placeholder="Локація (напр. Пляж № 2, Корт № 1)" value={typeForm.location} onChange={e => setTypeForm(f => ({ ...f, location: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={typeForm.instructor_required} onChange={e => setTypeForm(f => ({ ...f, instructor_required: e.target.checked }))} className="rounded" />
                  Потрібен інструктор
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={typeForm.equipment_included} onChange={e => setTypeForm(f => ({ ...f, equipment_included: e.target.checked }))} className="rounded" />
                  Інвентар включено
                </label>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowNewType(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={createType} disabled={!typeForm.name || saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Збереження...' : 'Створити тип'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SCHEDULE TAB ─────────────────────────────────────────────────────────────
function ScheduleTab() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sessionDetail, setSessionDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/activities/sessions?date_from=${dateFrom}&date_to=${dateTo}`);
    const d = await r.json();
    setSessions(d.sessions || []);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = async (sessionId: number) => {
    if (expanded === sessionId) { setExpanded(null); setSessionDetail(null); return; }
    setExpanded(sessionId);
    setLoadingDetail(true);
    const r = await apiFetch(`/activities/sessions/${sessionId}`);
    const d = await r.json();
    setSessionDetail(d);
    setLoadingDetail(false);
  };

  // Group sessions by date
  const byDate: Record<string, any[]> = {};
  sessions.forEach((s: any) => {
    if (!byDate[s.session_date]) byDate[s.session_date] = [];
    byDate[s.session_date].push(s);
  });

  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>з</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white" />
          <span>до</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white" />
        </div>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg bg-white"><RefreshCw className="w-3.5 h-3.5" /></button>
        <div className="text-xs text-gray-400 ml-auto">{sessions.length} сесій</div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Завантаження...</div> : Object.keys(byDate).length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <div className="text-gray-400">Сесій у вибраному діапазоні немає</div>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byDate).sort().map(([date, daySessions]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`text-xs font-semibold px-2.5 py-1 rounded-full ${date === today ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {date === today ? 'Сьогодні' : new Date(date + 'T12:00').toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400">{daySessions.length} сесій · {daySessions.reduce((s: number, x: any) => s + x.current_participants, 0)} учасників</span>
              </div>
              <div className="space-y-2">
                {(daySessions as any[]).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))).map((session: any) => {
                  const spotsLeft = (session.max_participants || 10) - session.current_participants;
                  const isFull = spotsLeft <= 0;
                  const isExpanded = expanded === session.id;
                  return (
                    <div key={session.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => loadDetail(session.id)}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: session.color + '20' }}>
                          {session.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-gray-900">{session.activity_name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${SESSION_STATUS_COLORS[session.status] || 'bg-gray-100'}`}>{SESSION_STATUS_LABELS[session.status] || session.status}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{String(session.start_time).substring(0,5)}–{String(session.end_time).substring(0,5)}</span>
                            {session.instructor_name && <span className="flex items-center gap-0.5"><User className="w-3 h-3" />{session.instructor_name}</span>}
                            {session.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{session.location}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className={`text-xs font-medium flex items-center gap-0.5 ${isFull ? 'text-red-500' : spotsLeft <= 2 ? 'text-amber-500' : 'text-green-600'}`}>
                            <Users className="w-3 h-3" />{session.current_participants}/{session.max_participants}
                          </div>
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t bg-gray-50 p-3">
                          {loadingDetail ? <div className="text-xs text-gray-400 text-center py-2">Завантаження...</div> : sessionDetail?.bookings?.length > 0 ? (
                            <div>
                              <div className="text-xs font-medium text-gray-500 mb-2">Записані учасники ({sessionDetail.bookings.length} броней)</div>
                              <div className="space-y-1">
                                {sessionDetail.bookings.map((b: any) => (
                                  <div key={b.id} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5 border border-gray-100 text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-gray-800">{b.guest_name}</span>
                                      {b.guest_phone && <span className="text-gray-400 flex items-center gap-0.5"><Phone className="w-3 h-3" />{b.guest_phone}</span>}
                                      <span className="text-gray-500">×{b.participant_count}</span>
                                    </div>
                                    <span className="font-medium text-indigo-600">{Number(b.price_charged).toLocaleString('uk-UA')} ₴</span>
                                  </div>
                                ))}
                              </div>
                              <div className="text-xs text-right text-gray-600 font-medium mt-2">
                                Дохід: {sessionDetail.bookings.reduce((s: number, b: any) => s + Number(b.price_charged), 0).toLocaleString('uk-UA')} ₴
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 text-center py-2">Записів немає</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ANALYTICS TAB ────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await apiFetch(`/activities/analytics?period=${period}`);
      const d = await r.json();
      setData(d);
      setLoading(false);
    })();
  }, [period]);

  const totalRentalRevenue = (data?.rentalByCategory || []).reduce((s: number, c: any) => s + Number(c.revenue), 0);
  const totalActivityRevenue = (data?.activityByType || []).reduce((s: number, t: any) => s + Number(t.revenue), 0);
  const totalRevenue = totalRentalRevenue + totalActivityRevenue;
  const maxRevenue = Math.max(...(data?.dailyRevenue || []).map((d: any) => Number(d.rental_revenue) + Number(d.activity_revenue)), 1);
  const maxCatRevenue = Math.max(...(data?.rentalByCategory || []).map((c: any) => Number(c.revenue)), 1);
  const maxActRevenue = Math.max(...(data?.activityByType || []).map((t: any) => Number(t.revenue)), 1);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-gray-900">Аналітика оренди та активностей</h3>
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          {[[7,'7 днів'],[14,'14 днів'],[30,'30 днів']].map(([v,l]) => (
            <button key={v} onClick={() => setPeriod(Number(v))} className={`px-3 py-1.5 rounded-md font-medium transition-colors ${period === Number(v) ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Завантаження...</div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Загальний дохід', value: totalRevenue.toLocaleString('uk-UA') + ' ₴', icon: CreditCard, color: 'bg-indigo-100 text-indigo-700' },
              { label: 'Оренда інвентарю', value: totalRentalRevenue.toLocaleString('uk-UA') + ' ₴', icon: Package, color: 'bg-blue-100 text-blue-700' },
              { label: 'Активності', value: totalActivityRevenue.toLocaleString('uk-UA') + ' ₴', icon: Star, color: 'bg-amber-100 text-amber-700' },
              { label: 'Видів оренди', value: (data?.rentalByCategory || []).length + (data?.activityByType || []).length, icon: Trophy, color: 'bg-green-100 text-green-700' },
            ].map(card => <StatCard key={card.label} {...card} />)}
          </div>

          {/* Daily chart */}
          {(data?.dailyRevenue || []).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-medium text-gray-800 mb-4 text-sm">Дохід по днях (оренда + активності)</h4>
              <div className="flex items-end gap-1 h-28">
                {(data.dailyRevenue as any[]).map((d: any) => {
                  const total = Number(d.rental_revenue) + Number(d.activity_revenue);
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="text-xs text-gray-400">{total > 0 ? (total/1000).toFixed(1)+'k' : ''}</div>
                      <div className="w-full flex flex-col rounded-t overflow-hidden" style={{ height: `${Math.max(4, (total / maxRevenue) * 100)}px` }}>
                        <div className="w-full bg-amber-400" style={{ height: `${Number(d.activity_revenue) / Math.max(total, 1) * 100}%` }} />
                        <div className="w-full bg-indigo-500 flex-1" />
                      </div>
                      <div className="text-xs text-gray-400">{new Date(d.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'numeric' })}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-indigo-500 rounded-sm inline-block" />Оренда</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-amber-400 rounded-sm inline-block" />Активності</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Rental by category */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-medium text-gray-800 mb-3 text-sm">Оренда за категоріями</h4>
              {(data?.rentalByCategory || []).length === 0 ? <div className="text-xs text-gray-400 text-center py-4">Даних немає</div> : (
                (data.rentalByCategory as any[]).map((c: any) => (
                  <div key={c.category} className="mb-2.5">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-700 flex items-center gap-1">{c.icon} {c.category}</span>
                      <span className="font-medium text-gray-900">{Number(c.revenue).toLocaleString('uk-UA')} ₴ · {c.rental_count} рен.</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(Number(c.revenue) / maxCatRevenue) * 100}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Activity by type */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-medium text-gray-800 mb-3 text-sm">Активності за типом</h4>
              {(data?.activityByType || []).length === 0 ? <div className="text-xs text-gray-400 text-center py-4">Даних немає</div> : (
                (data.activityByType as any[]).map((t: any) => (
                  <div key={t.name} className="mb-2.5">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-700 flex items-center gap-1">{t.icon} {t.name}</span>
                      <span className="font-medium text-gray-900">{Number(t.revenue).toLocaleString('uk-UA')} ₴ · {t.total_participants} ос.</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(Number(t.revenue) / maxActRevenue) * 100}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top rented items */}
          {(data?.topItems || []).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-medium text-gray-800 mb-3 text-sm">Топ популярних позицій оренди</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(data.topItems as any[]).map((item: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <span>{item.icon}</span>
                      <span className="text-xs text-gray-500">#{idx + 1}</span>
                    </div>
                    <div className="text-xs font-medium text-gray-800 leading-tight">{item.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.rental_count}× · {Number(item.revenue).toLocaleString('uk-UA')} ₴</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function ActivitiesPage() {
  const [stats, setStats] = useState<any>({});
  const [tab, setTab] = useState<'rentals' | 'activities' | 'schedule' | 'analytics'>('rentals');

  useEffect(() => {
    (async () => {
      try { const r = await apiFetch('/activities/stats'); setStats(await r.json()); } catch {}
    })();
  }, [tab]);

  const tabs = [
    { id: 'rentals', label: 'Оренда інвентарю', icon: Package },
    { id: 'activities', label: 'Активності', icon: Star },
    { id: 'schedule', label: 'Розклад', icon: Calendar },
    { id: 'analytics', label: 'Аналітика', icon: BarChart2 },
  ];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bike className="w-5 h-5 text-indigo-600" /> Оренди та Активності
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Велосипеди, SUP-борди, катамарани, риболовля, теніс, майстер-класи та дитячі програми</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-5">
          <StatCard label="Позицій інвентарю" value={stats.total_items || 0} icon={Package} color="bg-blue-100 text-blue-700" />
          <StatCard label="Вільних" value={stats.available_items || 0} icon={CheckCircle} color="bg-green-100 text-green-700" />
          <StatCard label="Активних оренд" value={stats.active_rentals || 0} icon={Zap} color="bg-amber-100 text-amber-700" />
          <StatCard label="Потреб. уваги" value={stats.needs_attention || 0} icon={AlertTriangle} color="bg-red-100 text-red-700" />
          <StatCard label="Сесій сьогодні" value={stats.today_sessions || 0} icon={Calendar} color="bg-indigo-100 text-indigo-700" />
          <StatCard label="Учасників сьогодні" value={stats.today_participants || 0} icon={Users} color="bg-purple-100 text-purple-700" />
          <StatCard label="Іде зараз" value={stats.sessions_in_progress || 0} icon={Flame} color="bg-orange-100 text-orange-700" />
          <StatCard label="Дохід сьогодні" value={(Number(stats.today_total_revenue || 0)).toLocaleString('uk-UA') + ' ₴'} icon={CreditCard} color="bg-teal-100 text-teal-700" />
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-xl mb-5 overflow-x-auto scrollbar-hide">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${tab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'rentals' && <RentalTab />}
        {tab === 'activities' && <ActivitiesTab />}
        {tab === 'schedule' && <ScheduleTab />}
        {tab === 'analytics' && <AnalyticsTab />}
      </div>
    </AppLayout>
  );
}
