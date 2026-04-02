import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../components/layout/app-layout';
import {
  UtensilsCrossed, ShoppingCart, Grid3x3, Calendar, BarChart2,
  Plus, X, ChefHat, Beer, Coffee, Star, Clock, Users, Wifi,
  CheckCircle, AlertTriangle, RefreshCw, Home, Truck, Sunrise,
  PartyPopper, Building2, CreditCard, Search, ChevronDown,
  Flame, Zap, ArrowRight, Circle, Edit2, Trash2, Phone
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
function TablesTab() {
  const [tables, setTables] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [reservationDate, setReservationDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [showReservation, setShowNewReservation] = useState(false);
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Резервації на:</span>
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
            {sections.map(section => (
              <div key={section}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{section}</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {tables.filter((t: any) => t.section === section).map((table: any) => (
                    <div key={table.id} className={`border-2 rounded-xl p-3 ${TABLE_STATUS_COLORS[table.status as TableStatus]}`}>
                      <div className="flex items-start justify-between">
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

      {/* New Reservation Modal */}
      {showReservation && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
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
function MenuTab() {
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', description: '', price: '', cost_price: '', category_id: '', item_type: 'food', prep_time_min: 15, calories: '', is_available: true, is_featured: false });
  const [saving, setSaving] = useState(false);

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

  const saveItem = async () => {
    if (!itemForm.name || !itemForm.price) return;
    setSaving(true);
    await apiFetch('/restaurant/menu/items', { method: 'POST', body: JSON.stringify({ ...itemForm, price: parseFloat(itemForm.price), cost_price: itemForm.cost_price ? parseFloat(itemForm.cost_price) : null, category_id: itemForm.category_id ? parseInt(itemForm.category_id) : null }) });
    setSaving(false);
    setShowAddItem(false);
    setItemForm({ name: '', description: '', price: '', cost_price: '', category_id: '', item_type: 'food', prep_time_min: 15, calories: '', is_available: true, is_featured: false });
    load();
  };

  const filtered = items.filter((i: any) =>
    (!selectedCat || i.category_id === selectedCat) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.description || '').toLowerCase().includes(search.toLowerCase()))
  );

  const ITEM_TYPE_OPTIONS = [['food','Їжа'],['drink','Напій'],['dessert','Десерт'],['alcohol','Алкоголь'],['tobacco','Тютюн/Кальян']];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" placeholder="Пошук страви..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white" />
        </div>
        <button onClick={() => setShowAddItem(true)} className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700">
          <Plus className="w-3.5 h-3.5" /> Нова позиція
        </button>
      </div>

      {/* Category tabs */}
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

      {loading ? <div className="text-center py-12 text-gray-400">Завантаження...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item: any) => (
            <div key={item.id} className={`bg-white border rounded-xl p-3 transition-all ${!item.is_available ? 'opacity-60' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm text-gray-900">{item.name}</span>
                    {item.is_featured && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                  </div>
                  {item.description && <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</div>}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="font-semibold text-indigo-600">{Number(item.price).toLocaleString('uk-UA')} ₴</span>
                    {item.cost_price && <span className="text-xs text-gray-400">собівартість: {Number(item.cost_price).toLocaleString('uk-UA')} ₴</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{item.category_name} {item.category_icon}</span>
                    <span className="text-xs text-gray-400 flex items-center gap-0.5"><Clock className="w-3 h-3" />{item.prep_time_min}хв</span>
                    {item.calories > 0 && <span className="text-xs text-gray-400">{item.calories} ккал</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                <button onClick={() => toggleAvailability(item)} className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${item.is_available ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {item.is_available ? '✓ Доступне' : '✗ Недоступне'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">Нова позиція меню</h3>
              <button onClick={() => setShowAddItem(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              <input type="text" placeholder="Назва *" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <textarea placeholder="Опис (склад, особливості...)" value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Ціна (₴) *</label>
                  <input type="number" min={0} step={0.01} placeholder="0.00" value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Собівартість (₴)</label>
                  <input type="number" min={0} step={0.01} placeholder="0.00" value={itemForm.cost_price} onChange={e => setItemForm(f => ({ ...f, cost_price: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <select value={itemForm.category_id} onChange={e => setItemForm(f => ({ ...f, category_id: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">Категорія (не вказана)</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <select value={itemForm.item_type} onChange={e => setItemForm(f => ({ ...f, item_type: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {ITEM_TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Час приготування (хв)</label>
                  <input type="number" min={0} value={itemForm.prep_time_min} onChange={e => setItemForm(f => ({ ...f, prep_time_min: parseInt(e.target.value) || 0 }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Калорії</label>
                  <input type="number" min={0} placeholder="0" value={itemForm.calories} onChange={e => setItemForm(f => ({ ...f, calories: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={itemForm.is_featured} onChange={e => setItemForm(f => ({ ...f, is_featured: e.target.checked }))} className="rounded" />
                  Фічерна страва
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={itemForm.is_available} onChange={e => setItemForm(f => ({ ...f, is_available: e.target.checked }))} className="rounded" />
                  Доступна
                </label>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setShowAddItem(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm hover:bg-gray-50">Скасувати</button>
              <button onClick={saveItem} disabled={!itemForm.name || !itemForm.price || saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Збереження...' : 'Додати позицію'}
              </button>
            </div>
          </div>
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

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function RestaurantPage() {
  const [stats, setStats] = useState<any>({});
  const [tab, setTab] = useState<'orders' | 'kitchen' | 'tables' | 'menu' | 'analytics'>('orders');

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
        </div>
      </div>
    </AppLayout>
  );
}
