import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../components/layout/app-layout';
import {
  UtensilsCrossed, ShoppingCart, Grid3x3, Calendar, BarChart2,
  Plus, X, ChefHat, Beer, Coffee, Star, Clock, Users, Wifi,
  CheckCircle, AlertTriangle, RefreshCw, Home, Truck, Sunrise,
  PartyPopper, Building2, CreditCard, Search, ChevronDown,
  Flame, Zap, ArrowRight, Circle, Edit2, Trash2, Phone,
  Hotel, Settings, Link2, Power, BedDouble, Receipt, CloudUpload,
  ChevronRight, Package, Loader2, Banknote, FileText, Tag
} from 'lucide-react';

const BASE = '/api';
const getToken = () => localStorage.getItem('hms_token') || '';
const apiFetch = (url: string, opts: RequestInit = {}) =>
  fetch(`${BASE}${url}`, { ...opts, headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });

// ─── TYPES ─────────────────────────────────────────────────────────────────
type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'paid' | 'cancelled';
type OrderType = 'dine_in' | 'room_service' | 'takeaway' | 'breakfast' | 'banquet' | 'corporate' | 'bar';
type TableStatus = 'free' | 'occupied' | 'reserved' | 'cleaning';
type ItemStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';

// ─── CONSTANTS ─────────────────────────────────────────────────────────────
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Нове', confirmed: 'Підтверджено', preparing: 'Готується',
  ready: 'Готово', served: 'Подано', paid: 'Оплачено', cancelled: 'Скасовано'
};
const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  new: 'bg-blue-100 text-blue-700', confirmed: 'bg-indigo-100 text-indigo-700',
  preparing: 'bg-amber-100 text-amber-700', ready: 'bg-green-100 text-green-700',
  served: 'bg-purple-100 text-purple-700', paid: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600'
};
const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  dine_in: 'Зал', room_service: 'Room Service', takeaway: 'Takeaway',
  breakfast: 'Сніданок', banquet: 'Банкет', corporate: 'Корпоратив', bar: 'Бар'
};
const ORDER_TYPE_ICONS: Record<OrderType, any> = {
  dine_in: UtensilsCrossed, room_service: Home, takeaway: Truck,
  breakfast: Sunrise, banquet: PartyPopper, corporate: Building2, bar: Beer
};
const TABLE_STATUS_COLORS: Record<TableStatus, string> = {
  free: 'bg-green-50 border-green-300 text-green-800',
  occupied: 'bg-red-50 border-red-300 text-red-800',
  reserved: 'bg-amber-50 border-amber-300 text-amber-800',
  cleaning: 'bg-gray-50 border-gray-300 text-gray-600'
};
const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  free: 'Вільний', occupied: 'Зайнятий', reserved: 'Заброньований', cleaning: 'Прибирання'
};
const NEXT_STATUS: Record<string, OrderStatus> = {
  new: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'served', served: 'paid'
};
const ITEM_STATUS_COLORS: Record<ItemStatus, string> = {
  pending: 'bg-gray-100 text-gray-600', preparing: 'bg-amber-100 text-amber-700',
  ready: 'bg-green-100 text-green-700', served: 'bg-purple-100 text-purple-600',
  cancelled: 'bg-red-100 text-red-600'
};

// ─── STAT CARD ──────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${color}`}><Icon className="w-4 h-4" /></div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-gray-900 leading-tight">{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── ORDERS TAB (POS) ───────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('active');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selected, setSelected] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [tables, setTables] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [menuCategories, setMenuCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [cart, setCart] = useState<any[]>([]);
  const [newOrderForm, setNewOrderForm] = useState({ order_type: 'dine_in', table_id: '', guest_name: '', guest_count: 2, notes: '', delivery_address: '' });
  const [saving, setSaving] = useState(false);
  const [addingItems, setAddingItems] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter === 'active') params.set('active', 'true');
    else params.set('date', new Date().toISOString().split('T')[0]);
    if (typeFilter !== 'all') params.set('order_type', typeFilter);
    const r = await apiFetch(`/restaurant/orders?${params}`);
    const d = await r.json();
    setOrders(d.orders || []);
    setLoading(false);
  }, [filter, typeFilter]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const selectOrder = async (o: any) => {
    setSelected(o);
    const r = await apiFetch(`/restaurant/orders/${o.id}`);
    const d = await r.json();
    setSelected(d.order);
    setOrderItems(d.items || []);
  };

  const advanceStatus = async (order: any) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    await apiFetch(`/restaurant/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
    loadOrders();
    if (selected?.id === order.id) selectOrder({ ...order, status: next });
  };

  const openNewOrder = async () => {
    const [tablesRes, menuRes, catsRes] = await Promise.all([
      apiFetch('/restaurant/tables').then(r => r.json()),
      apiFetch('/restaurant/menu/items?available=true').then(r => r.json()),
      apiFetch('/restaurant/menu/categories').then(r => r.json()),
    ]);
    setTables(tablesRes.tables || []);
    setMenuItems(menuRes.items || []);
    setMenuCategories(catsRes.categories || []);
    setCart([]);
    setSelectedCat(null);
    setShowNewOrder(true);
  };

  const addToCart = (item: any) => {
    setCart(prev => {
      const ex = prev.find(c => c.menu_item_id === item.id);
      if (ex) return prev.map(c => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, item_type: item.item_type, quantity: 1, notes: '' }];
    });
  };

  const saveNewOrder = async () => {
    if (!cart.length) return;
    setSaving(true);
    const tableId = newOrderForm.table_id ? parseInt(newOrderForm.table_id) : null;
    const orderRes = await apiFetch('/restaurant/orders', {
      method: 'POST',
      body: JSON.stringify({ ...newOrderForm, table_id: tableId, guest_count: parseInt(String(newOrderForm.guest_count)) })
    });
    const orderData = await orderRes.json();
    if (orderData.order) {
      await apiFetch(`/restaurant/orders/${orderData.order.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ items: cart.map(c => ({ menu_item_id: c.menu_item_id, quantity: c.quantity, notes: c.notes })) })
      });
    }
    setSaving(false);
    setShowNewOrder(false);
    loadOrders();
  };

  const filteredMenu = selectedCat ? menuItems.filter((i: any) => i.category_id === selectedCat) : menuItems;
  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const activeTypes = ['all', 'dine_in', 'room_service', 'breakfast', 'banquet', 'bar', 'corporate'];

  return (
    <div className="flex gap-4 h-full">
      {/* Left: order list */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            {[['active','Активні'],['today','Сьогодні']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1.5 rounded-md font-medium transition-colors ${filter === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
            ))}
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            {activeTypes.map(t => <option key={t} value={t}>{t === 'all' ? 'Усі типи' : ORDER_TYPE_LABELS[t as OrderType]}</option>)}
          </select>
          <button onClick={loadOrders} className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg bg-white"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={openNewOrder} className="ml-auto flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700">
            <Plus className="w-3.5 h-3.5" /> Нове замовлення
          </button>
        </div>

        {loading ? <div className="text-center py-12 text-gray-400">Завантаження...</div> : (
          <div className="space-y-2">
            {orders.length === 0 && <div className="text-center py-12 text-gray-400">Замовлень немає</div>}
            {orders.map((o: any) => {
              const TypeIcon = ORDER_TYPE_ICONS[o.order_type as OrderType] || UtensilsCrossed;
              return (
                <div key={o.id} onClick={() => selectOrder(o)}
                  className={`bg-white border rounded-xl p-3 cursor-pointer transition-all hover:shadow-sm ${selected?.id === o.id ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 bg-gray-50 rounded-lg"><TypeIcon className="w-3.5 h-3.5 text-gray-600" /></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm text-gray-900">#{o.id}</span>
                          {o.table_number && <span className="text-xs text-gray-500">Стіл {o.table_number}</span>}
                          {o.guest_name && <span className="text-xs text-gray-600 truncate">{o.guest_name}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ORDER_STATUS_COLORS[o.status as OrderStatus]}`}>{ORDER_STATUS_LABELS[o.status as OrderStatus]}</span>
                          <span className="text-xs text-gray-400">{ORDER_TYPE_LABELS[o.order_type as OrderType]}</span>
                          {o.guest_count > 1 && <span className="text-xs text-gray-400 flex items-center gap-0.5"><Users className="w-3 h-3" />{o.guest_count}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-semibold text-sm text-gray-900">{Number(o.total || 0).toLocaleString('uk-UA')} ₴</div>
                      <div className="text-xs text-gray-400">{new Date(o.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                  {o.notes && <div className="mt-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-0.5 truncate">{o.notes}</div>}
                  {NEXT_STATUS[o.status] && (
                    <div className="mt-2 flex justify-end">
                      <button onClick={e => { e.stopPropagation(); advanceStatus(o); }}
                        className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-700 font-medium">
                        {ORDER_STATUS_LABELS[NEXT_STATUS[o.status]]} <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: order detail */}
      {selected && (
        <div className="w-80 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b">
            <div>
              <div className="font-semibold text-gray-900">Замовлення #{selected.id}</div>
              <div className="text-xs text-gray-500">{ORDER_TYPE_LABELS[selected.order_type as OrderType]} · {ORDER_STATUS_LABELS[selected.status as OrderStatus]}</div>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {orderItems.length === 0 && <div className="text-xs text-gray-400 text-center py-4">Позицій немає</div>}
            {orderItems.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs text-gray-400 w-4 text-center">{item.quantity}×</span>
                  <div className="min-w-0">
                    <div className="text-sm text-gray-800 truncate">{item.name}</div>
                    {item.notes && <div className="text-xs text-gray-400 truncate">{item.notes}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${ITEM_STATUS_COLORS[item.status as ItemStatus]}`}>{item.status}</span>
                  <span className="text-xs font-medium text-gray-700">{Number(item.total_price).toLocaleString('uk-UA')} ₴</span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t bg-gray-50">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Підсумок</span><span>{Number(selected.subtotal || 0).toLocaleString('uk-UA')} ₴</span>
            </div>
            {Number(selected.service_charge) > 0 && (
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Сервісний збір 10%</span><span>{Number(selected.service_charge).toLocaleString('uk-UA')} ₴</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-gray-900 border-t pt-1 mt-1">
              <span>Разом</span><span>{Number(selected.total || 0).toLocaleString('uk-UA')} ₴</span>
            </div>
            {selected.guest_name && <div className="mt-1 text-xs text-gray-500">Гість: {selected.guest_name}</div>}
            {selected.notes && <div className="mt-1 text-xs text-amber-700 bg-amber-50 rounded px-2 py-0.5">{selected.notes}</div>}
          </div>
          {NEXT_STATUS[selected.status] && (
            <div className="p-3 border-t">
              <button onClick={() => advanceStatus(selected)}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
                <ArrowRight className="w-4 h-4" /> {ORDER_STATUS_LABELS[NEXT_STATUS[selected.status]]}
              </button>
            </div>
          )}
          {selected.status === 'paid' && (
            <div className="p-3 border-t text-center">
              <div className="text-green-600 text-sm font-medium flex items-center justify-center gap-1"><CheckCircle className="w-4 h-4" /> Оплачено</div>
              {selected.payment_method && <div className="text-xs text-gray-400 mt-0.5">{selected.payment_method}</div>}
            </div>
          )}
        </div>
      )}

      {/* New Order Modal */}
      {showNewOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-5xl mt-4 mb-4 flex overflow-hidden shadow-2xl">
            {/* Left: menu */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-gray-900">Додати позиції</h3>
                {/* Categories */}
                <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-hide">
                  <button onClick={() => setSelectedCat(null)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!selectedCat ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Всі</button>
                  {menuCategories.map((c: any) => (
                    <button key={c.id} onClick={() => setSelectedCat(c.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedCat === c.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {c.icon} {c.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2">
                {filteredMenu.map((item: any) => (
                  <button key={item.id} onClick={() => addToCart(item)}
                    className="text-left p-3 border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                    <div className="font-medium text-sm text-gray-900 leading-tight">{item.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.description}</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-semibold text-indigo-600 text-sm">{Number(item.price).toLocaleString('uk-UA')} ₴</span>
                      <span className="text-xs text-gray-400 flex items-center gap-0.5"><Clock className="w-3 h-3" />{item.prep_time_min}хв</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {/* Right: order form + cart */}
            <div className="w-72 border-l flex flex-col">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">Нове замовлення</h3>
                  <button onClick={() => setShowNewOrder(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
                <div className="space-y-2">
                  <select value={newOrderForm.order_type} onChange={e => setNewOrderForm(f => ({ ...f, order_type: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                    {Object.entries(ORDER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {newOrderForm.order_type === 'dine_in' && (
                    <select value={newOrderForm.table_id} onChange={e => setNewOrderForm(f => ({ ...f, table_id: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      <option value="">Вибрати стіл...</option>
                      {tables.filter((t: any) => t.status === 'free').map((t: any) => (
                        <option key={t.id} value={t.id}>Стіл {t.table_number} — {t.section} ({t.capacity} ос.)</option>
                      ))}
                    </select>
                  )}
                  <input type="text" placeholder="Ім'я гостя" value={newOrderForm.guest_name} onChange={e => setNewOrderForm(f => ({ ...f, guest_name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                  <input type="number" placeholder="Гостей" min={1} value={newOrderForm.guest_count} onChange={e => setNewOrderForm(f => ({ ...f, guest_count: parseInt(e.target.value) || 1 }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                  {['room_service','takeaway'].includes(newOrderForm.order_type) && (
                    <input type="text" placeholder="Адреса доставки / номер кімнати" value={newOrderForm.delivery_address} onChange={e => setNewOrderForm(f => ({ ...f, delivery_address: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                  )}
                  <textarea placeholder="Примітки" value={newOrderForm.notes} onChange={e => setNewOrderForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm resize-none" />
                </div>
              </div>
              {/* Cart */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {cart.length === 0 && <div className="text-center text-gray-400 text-sm py-6">Додайте позиції з меню</div>}
                {cart.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex items-center gap-1 border border-gray-200 rounded-lg">
                      <button onClick={() => setCart(prev => { const n = [...prev]; n[idx] = { ...n[idx], quantity: Math.max(1, n[idx].quantity - 1) }; return n; })} className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-red-600">−</button>
                      <span className="w-5 text-center text-xs font-medium">{item.quantity}</span>
                      <button onClick={() => setCart(prev => { const n = [...prev]; n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 }; return n; })} className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-green-600">+</button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-800 truncate">{item.name}</div>
                      <div className="text-xs text-indigo-600 font-medium">{(item.price * item.quantity).toLocaleString('uk-UA')} ₴</div>
                    </div>
                    <button onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t bg-gray-50">
                {cart.length > 0 && (
                  <div className="flex justify-between font-semibold text-gray-900 mb-3">
                    <span>Разом</span><span>{cartTotal.toLocaleString('uk-UA')} ₴</span>
                  </div>
                )}
                <button onClick={saveNewOrder} disabled={cart.length === 0 || saving}
                  className="w-full bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Збереження...' : `Створити замовлення (${cart.length} поз.)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KITCHEN DISPLAY TAB ─────────────────────────────────────────────────────
function KitchenTab() {
  const [kitchenItems, setKitchenItems] = useState<any[]>([]);
  const [barItems, setBarItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStation, setActiveStation] = useState<'all'|'kitchen'|'bar'>('all');
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const load = useCallback(async () => {
    const [kRes, bRes] = await Promise.all([
      apiFetch('/restaurant/kitchen?station=kitchen').then(r => r.json()),
      apiFetch('/restaurant/kitchen?station=bar').then(r => r.json()),
    ]);
    setKitchenItems(kRes.items || []);
    setBarItems(bRes.items || []);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const markReady = async (item: any) => {
    await apiFetch(`/restaurant/orders/${item.order_id}/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ready' }) });
    load();
  };

  const allItems = activeStation === 'all' ? [...kitchenItems, ...barItems]
    : activeStation === 'kitchen' ? kitchenItems : barItems;

  const urgentItems = allItems.filter((i: any) => i.minutes_waiting > 20);
  const normalItems = allItems.filter((i: any) => i.minutes_waiting <= 20);

  const ItemCard = ({ item }: { item: any }) => {
    const mins = Math.floor(item.minutes_waiting || 0);
    const isUrgent = mins > 20;
    return (
      <div className={`bg-white border-2 rounded-xl p-3 ${isUrgent ? 'border-red-300' : item.status === 'preparing' ? 'border-amber-300' : 'border-gray-200'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-gray-900 text-sm">{item.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-500">×{item.quantity}</span>
              {item.table_number && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Стіл {item.table_number}</span>}
              {item.order_type === 'room_service' && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Room Service</span>}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${item.station === 'bar' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{item.station === 'bar' ? 'Бар' : 'Кухня'}</span>
            </div>
            {item.order_notes && <div className="text-xs text-amber-600 mt-1 bg-amber-50 px-2 py-0.5 rounded truncate">{item.order_notes}</div>}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className={`text-xs font-bold flex items-center gap-0.5 ${isUrgent ? 'text-red-600' : mins > 10 ? 'text-amber-600' : 'text-gray-500'}`}>
              {isUrgent && <Flame className="w-3 h-3" />}
              {mins}хв
            </div>
            {item.status !== 'ready' && (
              <button onClick={() => markReady(item)} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700 font-medium">
                Готово
              </button>
            )}
            {item.status === 'ready' && <span className="text-xs text-green-600 font-medium flex items-center gap-0.5"><CheckCircle className="w-3 h-3" />Готово</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          {[['all','Всі'],['kitchen','Кухня'],['bar','Бар']].map(([v,l]) => (
            <button key={v} onClick={() => setActiveStation(v as any)} className={`px-3 py-1.5 rounded-md font-medium transition-colors ${activeStation === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
        <div className="text-xs text-gray-400">Оновлено: {lastUpdate.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg bg-white"><RefreshCw className="w-3.5 h-3.5" /></button>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-red-500" />Понад 20хв</span>
          <span className="flex items-center gap-1"><Circle className="w-3 h-3 text-amber-400" />Готується</span>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Завантаження...</div> : allItems.length === 0 ? (
        <div className="text-center py-16">
          <ChefHat className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <div className="text-gray-400">Активних замовлень немає</div>
        </div>
      ) : (
        <>
          {urgentItems.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2 text-red-600 font-medium text-sm"><Flame className="w-4 h-4" />Термінові ({urgentItems.length})</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {urgentItems.map((item: any) => <ItemCard key={item.id} item={item} />)}
              </div>
            </div>
          )}
          {normalItems.length > 0 && (
            <div>
              {urgentItems.length > 0 && <div className="text-sm font-medium text-gray-600 mb-2">В роботі ({normalItems.length})</div>}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {normalItems.map((item: any) => <ItemCard key={item.id} item={item} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── TABLES TAB ──────────────────────────────────────────────────────────────
const BLANK_TABLE_FORM = { table_number: '', section: 'Зал', capacity: '4', notes: '' };

function TablesTab() {
  const [tables, setTables] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [reservationDate, setReservationDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [showReservation, setShowNewReservation] = useState(false);
  const [showTableForm, setShowTableForm] = useState(false);
  const [editTable, setEditTable] = useState<any>(null);
  const [tableForm, setTableForm] = useState({ ...BLANK_TABLE_FORM });
  const [resvForm, setResvForm] = useState({ guest_name: '', guest_phone: '', guest_count: 2, reservation_date: new Date().toISOString().split('T')[0], reservation_time: '19:00', duration_min: 90, notes: '', deposit_amount: 0, table_id: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [tRes, rRes] = await Promise.all([
      apiFetch('/restaurant/tables').then(r => r.json()),
      apiFetch(`/restaurant/reservations?date=${reservationDate}`).then(r => r.json()),
    ]);
    setTables(tRes.tables || []);
    setReservations(rRes.reservations || []);
    setLoading(false);
  }, [reservationDate]);

  useEffect(() => { load(); }, [load]);

  const sections = [...new Set(tables.map((t: any) => t.section))];

  const openCreateTable = () => { setEditTable(null); setTableForm({ ...BLANK_TABLE_FORM }); setShowTableForm(true); };
  const openEditTable = (t: any) => { setEditTable(t); setTableForm({ table_number: t.table_number, section: t.section || 'Зал', capacity: String(t.capacity), notes: t.notes || '' }); setShowTableForm(true); };

  const saveTable = async () => {
    if (!tableForm.table_number) return;
    setSaving(true);
    const body = { table_number: tableForm.table_number, section: tableForm.section || 'Зал', capacity: parseInt(tableForm.capacity) || 4, notes: tableForm.notes || null };
    if (editTable) {
      await apiFetch(`/restaurant/tables/${editTable.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await apiFetch('/restaurant/tables', { method: 'POST', body: JSON.stringify(body) });
    }
    setSaving(false);
    setShowTableForm(false);
    load();
  };

  const deleteTable = async (t: any) => {
    if (!confirm(`Деактивувати стіл ${t.table_number}?`)) return;
    await apiFetch(`/restaurant/tables/${t.id}`, { method: 'DELETE' });
    load();
  };

  const saveReservation = async () => {
    if (!resvForm.guest_name) return;
    setSaving(true);
    await apiFetch('/restaurant/reservations', { method: 'POST', body: JSON.stringify({ ...resvForm, table_id: resvForm.table_id ? parseInt(resvForm.table_id) : null }) });
    setSaving(false);
    setShowNewReservation(false);
    load();
  };

  const cancelReservation = async (id: number) => {
    await apiFetch(`/restaurant/reservations/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Схема залу</span>
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg bg-white"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={openCreateTable} className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:border-gray-300">
            <Plus className="w-3.5 h-3.5" /> Новий стіл
          </button>
          <span className="text-xs text-gray-400">Резервації на:</span>
          <input type="date" value={reservationDate} onChange={e => setReservationDate(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
          <button onClick={() => setShowNewReservation(true)} className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700">
            <Plus className="w-3.5 h-3.5" /> Нова резервація
          </button>
        </div>
      </div>

      {loading ? <div className="text-center py-8 text-gray-400">Завантаження...</div> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Table floor plan */}
          <div className="lg:col-span-2 space-y-4">
            {sections.length === 0 && (
              <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
                <Grid3x3 className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Немає столів. Натисніть «Новий стіл» щоб додати.</p>
              </div>
            )}
            {sections.map(section => (
              <div key={section}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{section}</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {tables.filter((t: any) => t.section === section).map((table: any) => (
                    <div key={table.id} className={`border-2 rounded-xl p-3 relative group ${TABLE_STATUS_COLORS[table.status as TableStatus]}`}>
                      {/* Edit / Delete on hover */}
                      <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditTable(table)} className="p-1 bg-white/80 hover:bg-white rounded text-indigo-600 shadow-sm"><Edit2 className="w-3 h-3" /></button>
                        <button onClick={() => deleteTable(table)} className="p-1 bg-white/80 hover:bg-white rounded text-red-500 shadow-sm"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <div className="flex items-start justify-between pr-8">
                        <div>
                          <div className="font-semibold text-sm">Стіл {table.table_number}</div>
                          <div className="text-xs opacity-70 flex items-center gap-0.5 mt-0.5"><Users className="w-3 h-3" />{table.capacity}</div>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full mt-0.5 ${table.status === 'free' ? 'bg-green-500' : table.status === 'occupied' ? 'bg-red-500' : table.status === 'reserved' ? 'bg-amber-500' : 'bg-gray-400'}`} />
                      </div>
                      {table.status === 'occupied' && table.current_guest && (
                        <div className="mt-1.5 text-xs truncate opacity-80">{table.current_guest}</div>
                      )}
                      {table.status === 'reserved' && table.reservation_guest && (
                        <div className="mt-1.5 text-xs opacity-80">{table.reservation_guest} {table.reservation_time && `· ${String(table.reservation_time).substring(0,5)}`}</div>
                      )}
                      <div className="mt-1.5 text-xs font-medium">{TABLE_STATUS_LABELS[table.status as TableStatus]}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Reservations list */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Резервації на {new Date(reservationDate + 'T12:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
            </h3>
            {reservations.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
                <Calendar className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <div className="text-xs text-gray-400">Резервацій немає</div>
              </div>
            ) : (
              <div className="space-y-2">
                {reservations.map((r: any) => (
                  <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-gray-900">{r.guest_name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{String(r.reservation_time).substring(0,5)}</span>
                          <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{r.guest_count}</span>
                          {r.table_number && <span>Стіл {r.table_number}</span>}
                        </div>
                        {r.guest_phone && <div className="text-xs text-gray-400 flex items-center gap-0.5 mt-0.5"><Phone className="w-3 h-3" />{r.guest_phone}</div>}
                        {r.notes && <div className="text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-1 truncate">{r.notes}</div>}
                      </div>
                      <button onClick={() => cancelReservation(r.id)} className="text-gray-300 hover:text-red-500 flex-shrink-0"><X className="w-4 h-4" /></button>
                    </div>
                    {Number(r.deposit_amount) > 0 && (
                      <div className="mt-1.5 text-xs text-green-700 bg-green-50 rounded px-1.5 py-0.5">Депозит: {Number(r.deposit_amount).toLocaleString('uk-UA')} ₴</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit Table Modal */}
      {showTableForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowTableForm(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">{editTable ? `Редагувати стіл ${editTable.table_number}` : 'Новий стіл'}</h3>
              <button onClick={() => setShowTableForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Номер столу *</label>
                  <input type="text" placeholder="1, 2A, VIP..." value={tableForm.table_number} onChange={e => setTableForm(f => ({ ...f, table_number: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Місць</label>
                  <input type="number" min={1} value={tableForm.capacity} onChange={e => setTableForm(f => ({ ...f, capacity: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Зона / секція</label>
                <input type="text" placeholder="Зал, Тераса, VIP, Бар..." value={tableForm.section} onChange={e => setTableForm(f => ({ ...f, section: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Примітки</label>
                <input type="text" placeholder="Біля вікна, для сімей..." value={tableForm.notes} onChange={e => setTableForm(f => ({ ...f, notes: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowTableForm(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={saveTable} disabled={!tableForm.table_number || saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Збереження...' : editTable ? 'Зберегти' : 'Створити стіл'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Reservation Modal */}
      {showReservation && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowNewReservation(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">Нова резервація столу</h3>
              <button onClick={() => setShowNewReservation(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <input type="text" placeholder="Ім'я гостя *" value={resvForm.guest_name} onChange={e => setResvForm(f => ({ ...f, guest_name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <input type="tel" placeholder="Телефон" value={resvForm.guest_phone} onChange={e => setResvForm(f => ({ ...f, guest_phone: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={resvForm.reservation_date} onChange={e => setResvForm(f => ({ ...f, reservation_date: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <input type="time" value={resvForm.reservation_time} onChange={e => setResvForm(f => ({ ...f, reservation_time: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Гостей</label>
                  <input type="number" min={1} value={resvForm.guest_count} onChange={e => setResvForm(f => ({ ...f, guest_count: parseInt(e.target.value) || 1 }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Тривалість (хв)</label>
                  <select value={resvForm.duration_min} onChange={e => setResvForm(f => ({ ...f, duration_min: parseInt(e.target.value) }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                    {[60,90,120,150,180].map(v => <option key={v} value={v}>{v} хв</option>)}
                  </select>
                </div>
              </div>
              <select value={resvForm.table_id} onChange={e => setResvForm(f => ({ ...f, table_id: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">Стіл — без прив'язки</option>
                {tables.map((t: any) => <option key={t.id} value={t.id}>Стіл {t.table_number} — {t.section} ({t.capacity} ос.)</option>)}
              </select>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Депозит (₴)</label>
                <input type="number" min={0} value={resvForm.deposit_amount} onChange={e => setResvForm(f => ({ ...f, deposit_amount: parseInt(e.target.value) || 0 }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <textarea placeholder="Примітки (привід, побажання...)" value={resvForm.notes} onChange={e => setResvForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowNewReservation(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={saveReservation} disabled={!resvForm.guest_name || saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Збереження...' : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MENU TAB ─────────────────────────────────────────────────────────────────
const BLANK_ITEM = { name: '', description: '', price: '', cost_price: '', category_id: '', item_type: 'food', prep_time_min: 15, calories: '', is_available: true, is_featured: false, photo_url: '' };
const BLANK_CAT = { name: '', icon: '', description: '' };

function MenuItemModal({ item, categories, onClose, onSaved }: { item?: any; categories: any[]; onClose: () => void; onSaved: () => void }) {
  const ITEM_TYPE_OPTIONS = [['food','Їжа'],['drink','Напій'],['dessert','Десерт'],['alcohol','Алкоголь'],['tobacco','Тютюн/Кальян']];
  const [form, setForm] = useState(item ? {
    name: item.name || '', description: item.description || '', price: String(item.price || ''),
    cost_price: item.cost_price ? String(item.cost_price) : '', category_id: item.category_id ? String(item.category_id) : '',
    item_type: item.item_type || 'food', prep_time_min: item.prep_time_min ?? 15,
    calories: item.calories ? String(item.calories) : '', is_available: item.is_available !== false, is_featured: !!item.is_featured, photo_url: item.photo_url || '',
  } : { ...BLANK_ITEM });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = !!item;

  const handleSave = async () => {
    if (!form.name || !form.price) return;
    setSaving(true);
    const body = { ...form, price: parseFloat(form.price), cost_price: form.cost_price ? parseFloat(form.cost_price) : null, category_id: form.category_id ? parseInt(form.category_id) : null, calories: form.calories ? parseInt(form.calories) : null, photo_url: form.photo_url || null };
    if (isEdit) {
      await apiFetch(`/restaurant/menu/items/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await apiFetch('/restaurant/menu/items', { method: 'POST', body: JSON.stringify(body) });
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <h3 className="font-semibold text-gray-900">{isEdit ? `Редагувати: ${item.name}` : 'Нова позиція меню'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <input type="text" placeholder="Назва *" value={form.name} onChange={e => set('name', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <textarea placeholder="Опис (склад, особливості, алергени...)" value={form.description} onChange={e => set('description', e.target.value)} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ціна (₴) *</label>
              <input type="number" min={0} step={0.01} placeholder="0.00" value={form.price} onChange={e => set('price', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Собівартість (₴)</label>
              <input type="number" min={0} step={0.01} placeholder="0.00" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="">Категорія</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <select value={form.item_type} onChange={e => set('item_type', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              {ITEM_TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Час приготування (хв)</label>
              <input type="number" min={0} value={form.prep_time_min} onChange={e => set('prep_time_min', parseInt(e.target.value) || 0)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Калорії (ккал)</label>
              <input type="number" min={0} placeholder="—" value={form.calories} onChange={e => set('calories', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">URL фото (посилання на зображення)</label>
            <input type="url" placeholder="https://..." value={form.photo_url} onChange={e => set('photo_url', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            {form.photo_url && <img src={form.photo_url} alt="preview" className="mt-2 w-full h-28 object-cover rounded-lg border" onError={e => { (e.target as any).style.display='none'; }} />}
          </div>
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.is_featured} onChange={e => set('is_featured', e.target.checked)} className="rounded" />
              Топ-позиція ⭐
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.is_available} onChange={e => set('is_available', e.target.checked)} className="rounded" />
              Доступна зараз
            </label>
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t flex-shrink-0">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
          <button onClick={handleSave} disabled={!form.name || !form.price || saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Збереження...' : isEdit ? 'Зберегти зміни' : 'Додати позицію'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryModal({ category, onClose, onSaved }: { category?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(category ? { name: category.name || '', icon: category.icon || '', description: category.description || '' } : { ...BLANK_CAT });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = !!category;

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    if (isEdit) {
      await apiFetch(`/restaurant/menu/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify(form) });
    } else {
      await apiFetch('/restaurant/menu/categories', { method: 'POST', body: JSON.stringify(form) });
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-900">{isEdit ? 'Редагувати категорію' : 'Нова категорія'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Назва *</label>
              <input type="text" placeholder="Піца, Салати, Напої..." value={form.name} onChange={e => set('name', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Іконка (емодзі)</label>
              <input type="text" placeholder="🍕" value={form.icon} onChange={e => set('icon', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center text-lg" />
            </div>
          </div>
          <textarea placeholder="Опис категорії (необов'язково)" value={form.description} onChange={e => set('description', e.target.value)} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
        </div>
        <div className="flex gap-2 p-4 border-t">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
          <button onClick={handleSave} disabled={!form.name || saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Збереження...' : isEdit ? 'Зберегти' : 'Створити'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuTab() {
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [itemModal, setItemModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [catModal, setCatModal] = useState<{ open: boolean; cat?: any }>({ open: false });
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, iRes] = await Promise.all([
      apiFetch('/restaurant/menu/categories').then(r => r.json()),
      apiFetch('/restaurant/menu/items').then(r => r.json()),
    ]);
    setCategories(cRes.categories || []);
    setItems(iRes.items || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleAvailability = async (item: any) => {
    await apiFetch(`/restaurant/menu/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ is_available: !item.is_available }) });
    load();
  };

  const handleDeleteItem = async (item: any) => {
    await apiFetch(`/restaurant/menu/items/${item.id}`, { method: 'DELETE' });
    setDeleteItem(null);
    load();
  };

  const handleDeleteCategory = async (cat: any) => {
    await apiFetch(`/restaurant/menu/categories/${cat.id}`, { method: 'DELETE' });
    load();
  };

  const filtered = items.filter((i: any) =>
    (!selectedCat || i.category_id === selectedCat) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.description || '').toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {itemModal.open && <MenuItemModal item={itemModal.item} categories={categories} onClose={() => setItemModal({ open: false })} onSaved={load} />}
      {catModal.open && <CategoryModal category={catModal.cat} onClose={() => setCatModal({ open: false })} onSaved={load} />}
      {deleteItem && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl text-center space-y-4">
            <div className="text-4xl">🗑️</div>
            <p className="font-semibold text-gray-800">Видалити «{deleteItem.name}»?</p>
            <p className="text-xs text-gray-400">Позицію буде деактивовано (позначено як недоступну)</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteItem(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Ні</button>
              <button onClick={() => handleDeleteItem(deleteItem)} className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-red-700">Так, видалити</button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" placeholder="Пошук страви..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white" />
        </div>
        <button onClick={() => setShowCatMgr(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showCatMgr ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
          ⚙️ Категорії
        </button>
        <button onClick={() => setItemModal({ open: true })} className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700">
          <Plus className="w-3.5 h-3.5" /> Нова позиція
        </button>
      </div>

      {/* Category manager */}
      {showCatMgr && (
        <div className="mb-4 p-3 border border-indigo-100 bg-indigo-50/50 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">Управління категоріями</span>
            <button onClick={() => setCatModal({ open: true })} className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-700">
              <Plus className="w-3 h-3" />Нова
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c: any) => (
              <div key={c.id} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
                <span>{c.icon} {c.name}</span>
                <span className="text-gray-300">({c.item_count})</span>
                <button onClick={() => setCatModal({ open: true, cat: c })} className="text-indigo-400 hover:text-indigo-600 ml-0.5"><Edit2 className="w-3 h-3" /></button>
                <button onClick={() => handleDeleteCategory(c)} className="text-red-300 hover:text-red-500"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        <button onClick={() => setSelectedCat(null)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${!selectedCat ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
          Всі ({items.length})
        </button>
        {categories.map((c: any) => (
          <button key={c.id} onClick={() => setSelectedCat(c.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${selectedCat === c.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            {c.icon} {c.name} ({c.item_count})
          </button>
        ))}
      </div>

      {/* Items grid */}
      {loading ? <div className="text-center py-12 text-gray-400">Завантаження...</div> : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">🍽️</div>
          <p className="text-sm">Позицій не знайдено</p>
          <button onClick={() => setItemModal({ open: true })} className="mt-3 text-xs text-indigo-600 hover:underline">+ Додати страву</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item: any) => (
            <div key={item.id} className={`bg-white border rounded-xl overflow-hidden transition-all group hover:shadow-md ${!item.is_available ? 'opacity-60 border-gray-100' : 'border-gray-200'}`}>
              {item.photo_url && (
                <div className="h-28 bg-gray-100 overflow-hidden">
                  <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).parentElement!.style.display='none'; }} />
                </div>
              )}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">{item.name}</span>
                      {item.is_featured && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                    </div>
                    {item.description && <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</div>}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="font-semibold text-indigo-600">{Number(item.price).toLocaleString('uk-UA')} ₴</span>
                      {item.cost_price > 0 && <span className="text-xs text-gray-400">с/в: {Number(item.cost_price).toLocaleString('uk-UA')} ₴</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {item.category_name && <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{item.category_icon} {item.category_name}</span>}
                      <span className="text-xs text-gray-400 flex items-center gap-0.5"><Clock className="w-3 h-3" />{item.prep_time_min}хв</span>
                      {item.calories > 0 && <span className="text-xs text-gray-400">{item.calories} ккал</span>}
                    </div>
                  </div>
                  {/* Edit/Delete — visible on hover */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => setItemModal({ open: true, item })} className="p-1.5 hover:bg-indigo-100 rounded-lg text-indigo-500" title="Редагувати"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteItem(item)} className="p-1.5 hover:bg-red-100 rounded-lg text-red-400" title="Видалити"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                  <button onClick={() => toggleAvailability(item)} className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${item.is_available ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {item.is_available ? '✓ Доступне' : '✗ Недоступне'}
                  </button>
                  <button onClick={() => setItemModal({ open: true, item })} className="ml-auto text-xs text-indigo-500 hover:underline flex items-center gap-0.5">
                    <Edit2 className="w-3 h-3" />Редагувати
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ANALYTICS TAB ───────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await apiFetch(`/restaurant/analytics/revenue?period=${period}`);
      const d = await r.json();
      setData(d);
      setLoading(false);
    })();
  }, [period]);

  const totalRevenue = data?.daily?.reduce((s: number, d: any) => s + Number(d.revenue), 0) || 0;
  const totalOrders = data?.daily?.reduce((s: number, d: any) => s + Number(d.orders), 0) || 0;
  const avgCheck = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalTips = data?.daily?.reduce((s: number, d: any) => s + Number(d.tips), 0) || 0;
  const maxRevenue = Math.max(...(data?.daily?.map((d: any) => Number(d.revenue)) || [1]));
  const maxQty = Math.max(...(data?.topItems?.map((i: any) => Number(i.sold_qty)) || [1]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-gray-900">Аналітика ресторану</h3>
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          {[[7,'7 днів'],[14,'14 днів'],[30,'30 днів']].map(([v,l]) => (
            <button key={v} onClick={() => setPeriod(Number(v))} className={`px-3 py-1.5 rounded-md font-medium transition-colors ${period === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Завантаження...</div> : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Виручка', value: totalRevenue.toLocaleString('uk-UA') + ' ₴', icon: CreditCard, color: 'bg-green-100 text-green-700' },
              { label: 'Замовлень', value: totalOrders, icon: ShoppingCart, color: 'bg-blue-100 text-blue-700' },
              { label: 'Середній чек', value: avgCheck.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ₴', icon: BarChart2, color: 'bg-indigo-100 text-indigo-700' },
              { label: 'Чайові', value: totalTips.toLocaleString('uk-UA') + ' ₴', icon: Star, color: 'bg-amber-100 text-amber-700' },
            ].map(card => <StatCard key={card.label} {...card} />)}
          </div>

          {/* Daily revenue chart */}
          {data?.daily?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-medium text-gray-800 mb-4 text-sm">Виручка по днях</h4>
              <div className="flex items-end gap-1.5 h-32">
                {data.daily.map((d: any) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs text-gray-500 font-medium">{Number(d.revenue) > 0 ? (Number(d.revenue)/1000).toFixed(1)+'k' : ''}</div>
                    <div className="w-full bg-indigo-100 rounded-t-sm relative overflow-hidden" style={{ height: `${Math.max(4, (Number(d.revenue) / maxRevenue) * 100)}px` }}>
                      <div className="absolute inset-0 bg-indigo-500" />
                    </div>
                    <div className="text-xs text-gray-400">{new Date(d.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'numeric' })}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By order type */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-medium text-gray-800 mb-3 text-sm">За типом замовлення</h4>
              {(data?.byType || []).map((t: any) => {
                const maxT = Math.max(...(data?.byType || []).map((x: any) => Number(x.revenue)));
                return (
                  <div key={t.order_type} className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700">{ORDER_TYPE_LABELS[t.order_type as OrderType] || t.order_type}</span>
                      <span className="font-medium text-gray-900">{Number(t.revenue).toLocaleString('uk-UA')} ₴ · {t.orders} зам.</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(Number(t.revenue) / maxT) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Top items */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-medium text-gray-800 mb-3 text-sm">Топ страви / напої</h4>
              {(data?.topItems || []).slice(0, 8).map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 mb-1.5">
                  <div className="text-xs text-gray-400 w-4 text-right">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-800 truncate">{item.name}</div>
                    <div className="h-1 bg-gray-100 rounded-full mt-0.5 overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${(Number(item.sold_qty) / maxQty) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-xs font-medium text-gray-700 flex-shrink-0">{item.sold_qty}шт · {Number(item.revenue).toLocaleString('uk-UA')} ₴</div>
                </div>
              ))}
              {(!data?.topItems?.length) && <div className="text-xs text-gray-400 text-center py-4">Даних немає</div>}
            </div>
          </div>

          {/* Payment methods */}
          {data?.byPaymentMethod?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-medium text-gray-800 mb-3 text-sm">Способи оплати</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {data.byPaymentMethod.map((p: any) => (
                  <div key={p.payment_method} className="bg-gray-50 rounded-xl p-3">
                    <div className="text-sm font-semibold text-gray-900">{Number(p.revenue).toLocaleString('uk-UA')} ₴</div>
                    <div className="text-xs text-gray-500 mt-0.5">{p.payment_method || 'Не вказано'}</div>
                    <div className="text-xs text-gray-400">{p.orders} зам.</div>
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

// ─── ROOM CHARGES TAB ─────────────────────────────────────────────────────────
function RoomChargesTab() {
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [breakfastGuests, setBreakfastGuests] = useState<any[]>([]);
  const [chargeForm, setChargeForm] = useState({ amount: '', description: '', order_type: 'room_service' });
  const [chargeModal, setChargeModal] = useState(false);
  const [search, setSearch] = useState('');
  const [bfMode, setBfMode] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/restaurant/room-charges').then(r => r.json());
      setCharges(r.charges || []);
    } catch {} finally { setLoading(false); }
  };
  const loadBreakfast = async () => {
    try {
      const r = await apiFetch('/restaurant/breakfast-flags').then(r => r.json());
      setBreakfastGuests(r.guests || []);
    } catch {}
  };
  const loadOrders = async (bookingId: number) => {
    setOrdersLoading(true);
    try {
      const r = await apiFetch(`/restaurant/room-charges/${bookingId}/orders`).then(r => r.json());
      setOrders(r.orders || []);
    } catch {} finally { setOrdersLoading(false); }
  };
  const selectGuest = (g: any) => { setSelected(g); loadOrders(g.booking_id); };
  const addCharge = async () => {
    if (!chargeForm.amount || !selected) return;
    await apiFetch(`/restaurant/room-charges/${selected.booking_id}/charge`, {
      method: 'POST', body: JSON.stringify(chargeForm)
    });
    setChargeModal(false); setChargeForm({ amount: '', description: '', order_type: 'room_service' });
    await load(); await loadOrders(selected.booking_id);
    const c = charges.find(x => x.booking_id === selected.booking_id);
    if (c) setSelected(c);
  };

  useEffect(() => { load(); loadBreakfast(); }, []);

  const filtered = charges.filter(g =>
    !search || `${g.first_name} ${g.last_name} ${g.unit_name} ${g.reservation_number}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setBfMode(false)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!bfMode ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <BedDouble className="w-3.5 h-3.5 inline mr-1" />Рахунки до кімнати
          </button>
          <button onClick={() => setBfMode(true)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${bfMode ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Sunrise className="w-3.5 h-3.5 inline mr-1" />Сніданки
          </button>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук гостя..." className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg" />
        </div>
      </div>

      {bfMode ? (
        /* ── Breakfast Flags View ── */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Sunrise className="w-4 h-4 text-amber-600" />
            <span className="font-semibold text-gray-800">Сніданки на сьогодні</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Гість</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Кімната</th>
                <th className="px-4 py-2 text-center font-medium text-gray-500">Включено</th>
                <th className="px-4 py-2 text-center font-medium text-gray-500">Замовлень сьогодні</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {breakfastGuests.map((g: any) => (
                <tr key={g.booking_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{g.first_name} {g.last_name}</td>
                  <td className="px-4 py-2.5 text-gray-600">{g.unit_name || '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {g.breakfast_included ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />Включено
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">Без сніданку</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-sm font-semibold ${Number(g.breakfast_orders_today) > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                      {g.breakfast_orders_today || 0}
                    </span>
                  </td>
                </tr>
              ))}
              {breakfastGuests.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Немає проживаючих гостей</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Room Charges View ── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Guest list */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-800 text-sm">Проживаючі гості ({filtered.length})</span>
              <button onClick={load} className="text-gray-400 hover:text-gray-600 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
            </div>
            {loading ? (
              <div className="p-8 text-center"><Loader2 className="w-6 h-6 text-gray-300 animate-spin mx-auto" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Немає проживаючих гостей</div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
                {filtered.map((g: any) => (
                  <button key={g.booking_id} onClick={() => selectGuest(g)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selected?.booking_id === g.booking_id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-gray-800 text-sm">{g.first_name} {g.last_name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{g.unit_name || g.reservation_number}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-semibold text-gray-900">{Number(g.total_charged).toLocaleString('uk-UA')} ₴</div>
                        {Number(g.open_orders) > 0 && (
                          <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{g.open_orders} відкр.</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Guest detail */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-800">{selected.first_name} {selected.last_name}</div>
                    <div className="text-xs text-gray-500">{selected.unit_name} · #{selected.reservation_number}</div>
                  </div>
                  <button onClick={() => setChargeModal(true)} className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                    <Plus className="w-3.5 h-3.5" />Нарахування
                  </button>
                </div>

                {/* Summary bar */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-lg font-bold text-gray-900">{Number(selected.total_charged).toLocaleString('uk-UA')} ₴</div>
                    <div className="text-xs text-gray-500">Нараховано</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-green-700">{Number(selected.total_paid).toLocaleString('uk-UA')} ₴</div>
                    <div className="text-xs text-gray-500">Оплачено</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-red-600">{(Number(selected.total_charged) - Number(selected.total_paid)).toLocaleString('uk-UA')} ₴</div>
                    <div className="text-xs text-gray-500">До оплати</div>
                  </div>
                </div>

                {/* Orders list */}
                {ordersLoading ? (
                  <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" /></div>
                ) : (
                  <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-50">
                    {orders.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-sm">Немає замовлень на кімнату</div>
                    ) : orders.map((o: any) => (
                      <div key={o.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg ${ORDER_TYPE_ICONS[o.order_type as OrderType] ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
                            {(() => { const I = ORDER_TYPE_ICONS[o.order_type as OrderType]; return I ? <I className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />; })()}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-800">{ORDER_TYPE_LABELS[o.order_type as OrderType] || o.order_type}</div>
                            <div className="text-xs text-gray-400">{o.notes || '—'} · {new Date(o.created_at).toLocaleDateString('uk-UA')}</div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-semibold text-gray-900">{Number(o.total).toLocaleString('uk-UA')} ₴</div>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${ORDER_STATUS_COLORS[o.status as OrderStatus] || 'bg-gray-100 text-gray-500'}`}>
                            {ORDER_STATUS_LABELS[o.status as OrderStatus] || o.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Hotel className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Оберіть гостя зліва</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charge Modal */}
      {chargeModal && selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Нарахування на кімнату</h3>
              <button onClick={() => setChargeModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="text-sm text-gray-600 mb-4 p-2 bg-gray-50 rounded-lg">
              {selected.first_name} {selected.last_name} · {selected.unit_name || selected.reservation_number}
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Тип нарахування</label>
                <select value={chargeForm.order_type} onChange={e => setChargeForm(f => ({ ...f, order_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="room_service">Room Service</option>
                  <option value="breakfast">Сніданок</option>
                  <option value="banquet">Банкет</option>
                  <option value="bar">Бар</option>
                  <option value="dine_in">Ресторан</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Сума (₴)</label>
                <input type="number" value={chargeForm.amount} onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Опис</label>
                <input value={chargeForm.description} onChange={e => setChargeForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Опис нарахування..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setChargeModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm font-medium">Скасувати</button>
              <button onClick={addCharge} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">Нарахувати</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── POS INTEGRATION TAB ────────────────────────────────────────────────────
function PosIntegrationTab() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState({ api_url: '', api_key: '', location_id: '' });

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/restaurant/pos-config').then(r => r.json());
      setConfig(r);
      setActiveProvider(r.activeProvider);
      if (r.config) setConfigForm({ api_url: r.config.api_url || '', api_key: '', location_id: r.config.location_id || '' });
    } catch {} finally { setLoading(false); }
  };

  const runSync = async (action: string) => {
    setSyncing(true); setSyncResult(null);
    try {
      const r = await apiFetch('/restaurant/pos-sync', {
        method: 'POST', body: JSON.stringify({ provider: activeProvider || 'generic', action })
      }).then(r => r.json());
      setSyncResult(r);
    } catch (e: any) {
      setSyncResult({ success: false, message: e.message });
    } finally { setSyncing(false); }
  };

  useEffect(() => { load(); }, []);

  const providers: any[] = config?.providers || [];

  const PROVIDER_COLORS: Record<string, string> = {
    poster: 'from-orange-400 to-orange-600',
    iiko: 'from-blue-500 to-blue-700',
    rkeeper: 'from-red-500 to-red-700',
    generic: 'from-gray-500 to-gray-700',
  };

  if (loading) return <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300 mx-auto" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-white/10 rounded-xl"><Link2 className="w-5 h-5" /></div>
          <div>
            <h2 className="font-bold text-lg">POS Integration Layer</h2>
            <p className="text-slate-300 text-sm">Універсальний адаптер для підключення POS-системи</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: 'Room Charge', icon: Hotel, status: 'active' },
            { label: 'Breakfast Flag', icon: Sunrise, status: 'active' },
            { label: 'Guest Map', icon: Users, status: 'active' },
            { label: 'POS Sync', icon: CloudUpload, status: activeProvider ? 'active' : 'idle' },
          ].map((f, i) => (
            <div key={i} className="bg-white/10 rounded-xl p-3">
              <f.icon className="w-4 h-4 mx-auto mb-1 opacity-80" />
              <div className="text-xs font-medium">{f.label}</div>
              <div className={`text-xs mt-0.5 ${f.status === 'active' ? 'text-green-300' : 'text-slate-400'}`}>
                {f.status === 'active' ? '● Активний' : '○ Налаштувати'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Provider Selection */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Package className="w-4 h-4 text-gray-500" />Постачальники POS</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {providers.map((p: any) => (
            <button key={p.id} onClick={() => setActiveProvider(p.id === activeProvider ? null : p.id)}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${activeProvider === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              {activeProvider === p.id && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-white" />
                </div>
              )}
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${PROVIDER_COLORS[p.id] || 'from-gray-400 to-gray-600'} flex items-center justify-center mb-2`}>
                <Link2 className="w-4 h-4 text-white" />
              </div>
              <div className="font-medium text-gray-800 text-sm">{p.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{p.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Configuration (when a provider is selected) */}
      {activeProvider && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-500" />Конфігурація: {providers.find(p => p.id === activeProvider)?.name}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">API URL</label>
              <input value={configForm.api_url} onChange={e => setConfigForm(f => ({ ...f, api_url: e.target.value }))}
                placeholder="https://joinposter.com/api" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">API Key / Token</label>
              <input type="password" value={configForm.api_key} onChange={e => setConfigForm(f => ({ ...f, api_key: e.target.value }))}
                placeholder="••••••••••••" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Location / Spot ID</label>
              <input value={configForm.location_id} onChange={e => setConfigForm(f => ({ ...f, location_id: e.target.value }))}
                placeholder="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
            Зберегти конфігурацію
          </button>
        </div>
      )}

      {/* Sync Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <CloudUpload className="w-4 h-4 text-gray-500" />Синхронізація
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[
            { action: 'pull_orders', label: 'Завантажити замовлення', icon: ArrowRight },
            { action: 'push_menu', label: 'Вивантажити меню', icon: CloudUpload },
            { action: 'pull_menu', label: 'Завантажити меню', icon: ArrowRight },
            { action: 'sync_all', label: 'Повна синхронізація', icon: RefreshCw },
          ].map(a => (
            <button key={a.action} onClick={() => runSync(a.action)} disabled={syncing}
              className="flex items-center gap-1.5 justify-center px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <a.icon className="w-3.5 h-3.5" />}
              <span className="text-xs">{a.label}</span>
            </button>
          ))}
        </div>
        {syncResult && (
          <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${syncResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
            {syncResult.success ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <div>
              <div className="font-medium">{syncResult.success ? 'Успішно' : 'Помилка'}</div>
              <div>{syncResult.message}</div>
              {syncResult.syncedAt && <div className="text-xs mt-1 opacity-70">{new Date(syncResult.syncedAt).toLocaleString('uk-UA')}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Architecture Info */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />Архітектура інтеграції
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {[
            { title: 'POS Adapter Layer', items: ['Generic REST interface', 'Poster API module', 'iiko connector', 'Webhook receiver'] },
            { title: 'HMS Bridge', items: ['Room charge mapping', 'Guest identity sync', 'Breakfast flag push', 'Package inclusion check'] },
            { title: 'Revenue Layer', items: ['Order deduplication', 'Revenue reconciliation', 'Shift reports', 'Daily Z-report'] },
          ].map((col, i) => (
            <div key={i} className="bg-white rounded-lg p-3 border border-slate-200">
              <div className="font-medium text-slate-800 mb-2 text-xs uppercase tracking-wide">{col.title}</div>
              {col.items.map((item, j) => (
                <div key={j} className="flex items-center gap-1.5 text-slate-600 text-xs py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function RestaurantPage() {
  const [stats, setStats] = useState<any>({});
  const [tab, setTab] = useState<'orders' | 'kitchen' | 'tables' | 'menu' | 'analytics' | 'room-charges' | 'pos-sync'>('orders');

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch('/restaurant/stats');
        const d = await r.json();
        setStats(d);
      } catch {}
    })();
  }, [tab]);

  const tabs = [
    { id: 'orders', label: 'Замовлення', icon: ShoppingCart },
    { id: 'kitchen', label: 'Кухня / Бар', icon: ChefHat },
    { id: 'tables', label: 'Столики', icon: Grid3x3 },
    { id: 'menu', label: 'Меню', icon: UtensilsCrossed },
    { id: 'analytics', label: 'Аналітика', icon: BarChart2 },
    { id: 'room-charges', label: 'Рахунки / Кімнати', icon: Hotel },
    { id: 'pos-sync', label: 'POS Інтеграція', icon: Link2 },
  ];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-indigo-600" /> Ресторан & POS
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Управління замовленнями, столиками, меню та аналітика</p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-5">
          <StatCard label="Активні замовлення" value={stats.active_orders || 0} icon={ShoppingCart} color="bg-blue-100 text-blue-700" />
          <StatCard label="Нові" value={stats.new_orders || 0} icon={Zap} color="bg-amber-100 text-amber-700" />
          <StatCard label="Готуються" value={stats.preparing || 0} icon={Flame} color="bg-orange-100 text-orange-700" />
          <StatCard label="Готово до подачі" value={stats.ready_for_pickup || 0} icon={CheckCircle} color="bg-green-100 text-green-700" />
          <StatCard label="Room Service" value={stats.room_service_active || 0} icon={Home} color="bg-purple-100 text-purple-700" />
          <StatCard label="Столиків вільно" value={stats.free || 0} icon={Grid3x3} color="bg-teal-100 text-teal-700" />
          <StatCard label="Сьогодні ₴" value={(Number(stats.today_revenue || 0)).toLocaleString('uk-UA')} icon={CreditCard} color="bg-indigo-100 text-indigo-700" />
          <StatCard label="Резервацій сьогодні" value={stats.today_reservations || 0} icon={Calendar} color="bg-pink-100 text-pink-700" />
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-xl mb-5 overflow-x-auto scrollbar-hide">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${tab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div>
          {tab === 'orders' && <OrdersTab />}
          {tab === 'kitchen' && <KitchenTab />}
          {tab === 'tables' && <TablesTab />}
          {tab === 'menu' && <MenuTab />}
          {tab === 'analytics' && <AnalyticsTab />}
          {tab === 'room-charges' && <RoomChargesTab />}
          {tab === 'pos-sync' && <PosIntegrationTab />}
        </div>
      </div>
    </AppLayout>
  );
}
