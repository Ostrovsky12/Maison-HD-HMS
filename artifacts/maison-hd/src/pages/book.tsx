import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Search, BedDouble, Users, Calendar, Wifi, Car, Coffee, Waves,
  CheckCircle2, ChevronRight, Star, MapPin, Phone, Mail, ArrowLeft,
  Sparkles, Clock, Shield,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api/public";
const apiFetch = (path: string, opts: RequestInit = {}) => fetch(API + path, opts);

const TYPE_LABELS: Record<string, string> = {
  standard: "Стандарт", deluxe: "Делюкс", suite: "Люкс",
  presidential: "Президентський", villa: "Вілла", apartment: "Апартаменти",
};
const AMENITY_ICONS: Record<string, string> = {
  wifi: "📶", parking: "🚗", breakfast: "🍳", pool: "🏊", spa: "🧘",
  gym: "💪", restaurant: "🍽️", bar: "🍸", balcony: "🌅", bathtub: "🛁",
  tv: "📺", aircon: "❄️", minibar: "🥂", safe: "🔒",
};

type Step = "search" | "select" | "form" | "confirm";

interface SearchParams { propertyId: string; checkIn: string; checkOut: string; guests: string; }
interface UnitResult { id: number; name: string; category: string; floor: number; capacity: number; maxCapacity: number; basePrice: string; description: string; hasView: string; hasBalcony: boolean; squareMeters: string; propertyName: string; propertyAddress: string; nights: number; totalPrice: number; }
interface BookingConfirm { bookingRef: string; firstName: string; lastName: string; email: string; checkIn: string; checkOut: string; nights: number; totalAmount: number; propertyName: string; status: string; }

const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

export default function BookPage() {
  const [step, setStep] = useState<Step>("search");
  const [properties, setProperties] = useState<any[]>([]);
  const [search, setSearch] = useState<SearchParams>({ propertyId: "", checkIn: today(), checkOut: tomorrow(), guests: "1" });
  const [results, setResults] = useState<UnitResult[]>([]);
  const [nights, setNights] = useState(1);
  const [selectedUnit, setSelectedUnit] = useState<UnitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState<BookingConfirm | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", specialRequests: "" });
  const { toast } = useToast();

  useEffect(() => {
    apiFetch("/properties").then(r => r.json()).then(d => setProperties(d.properties || []));
  }, []);

  const handleSearch = async () => {
    if (!search.checkIn || !search.checkOut) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ checkIn: search.checkIn, checkOut: search.checkOut, guests: search.guests });
      if (search.propertyId) params.append("propertyId", search.propertyId);
      const r = await apiFetch(`/availability?${params}`);
      const d = await r.json();
      setResults(d.units || []);
      setNights(d.nights || 1);
      setStep("select");
    } catch { toast({ title: "Помилка пошуку", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const handleSelect = (unit: UnitResult) => { setSelectedUnit(unit); setStep("form"); };

  const handleBook = async () => {
    if (!selectedUnit) return;
    if (!form.firstName || !form.lastName || !form.email) {
      toast({ title: "Заповніть обов'язкові поля", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const r = await apiFetch("/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: selectedUnit.id,
          checkIn: search.checkIn, checkOut: search.checkOut,
          guestsCount: parseInt(search.guests),
          ...form,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: "Помилка бронювання", description: d.error, variant: "destructive" }); return; }
      setConfirmed(d.booking);
      setStep("confirm");
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(step === "select" || step === "form") && (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setStep(step === "form" ? "select" : "search")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h1 className="font-bold text-lg text-gray-900">🏨 Dogoda Resort</h1>
              <p className="text-xs text-gray-500">Онлайн-бронювання · Найкраща ціна гарантована</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Shield className="h-4 w-4 text-green-500" />
            <span>Безпечне бронювання</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── STEP 1: SEARCH ── */}
        {step === "search" && (
          <div>
            {/* Hero */}
            <div className="text-center py-8 mb-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Знайдіть ідеальний відпочинок</h2>
              <p className="text-gray-500">Вибирайте з наших чудових локацій у Карпатах та по всій Україні</p>
            </div>

            {/* Search Card */}
            <Card className="border-0 shadow-lg mb-8">
              <CardContent className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Локація</Label>
                    <Select value={search.propertyId} onValueChange={v => setSearch(s => ({ ...s, propertyId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Всі локації" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Всі локації</SelectItem>
                        {properties.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Заїзд</Label>
                    <Input type="date" value={search.checkIn} min={today()}
                      onChange={e => setSearch(s => ({ ...s, checkIn: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Виїзд</Label>
                    <Input type="date" value={search.checkOut} min={search.checkIn || today()}
                      onChange={e => setSearch(s => ({ ...s, checkOut: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Гостей</Label>
                    <div className="flex gap-2">
                      <Select value={search.guests} onValueChange={v => setSearch(s => ({ ...s, guests: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1,2,3,4,5,6].map(n => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "гість" : n < 5 ? "гості" : "гостей"}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button className="bg-blue-600 hover:bg-blue-700 shrink-0" onClick={handleSearch} disabled={loading}>
                        {loading ? "…" : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Features */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { icon: Shield, title: "Миттєве підтвердження", desc: "Отримайте підтвердження одразу після бронювання" },
                { icon: Star, title: "Найкраща ціна", desc: "Гарантуємо найкращу ціну при прямому бронюванні" },
                { icon: Clock, title: "Безкоштовна відміна", desc: "Безкоштовна відміна до 24 год до заїзду" },
              ].map((f, i) => (
                <div key={i} className="text-center p-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <f.icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <p className="font-semibold text-sm text-gray-800">{f.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{f.desc}</p>
                </div>
              ))}
            </div>

            {/* Properties Preview */}
            {properties.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 mb-3">Наші локації</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {properties.map(p => (
                    <Card key={p.id} className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => { setSearch(s => ({ ...s, propertyId: String(p.id) })); handleSearch(); }}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl">🏨</div>
                          <div>
                            <p className="font-semibold">{p.name}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="h-3 w-3" />{p.city}, {p.country}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: SELECT ROOM ── */}
        {step === "select" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Доступні номери</h2>
                <p className="text-sm text-gray-500">{search.checkIn} → {search.checkOut} · {nights} {nights === 1 ? "ніч" : nights < 5 ? "ночі" : "ночей"} · {search.guests} {parseInt(search.guests) === 1 ? "гість" : "гостей"}</p>
              </div>
              <Badge className="bg-blue-100 text-blue-700">{results.length} варіантів</Badge>
            </div>

            {results.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-gray-500 font-medium">На ці дати вільних номерів не знайдено</p>
                <p className="text-sm text-gray-400 mt-1">Спробуйте змінити дати або кількість гостей</p>
                <Button variant="outline" className="mt-4" onClick={() => setStep("search")}>Змінити пошук</Button>
              </div>
            ) : (
              <div className="space-y-4">
                {results.map(unit => (
                  <Card key={unit.id} className="border-0 shadow-sm hover:shadow-md transition-all">
                    <CardContent className="p-5">
                      <div className="flex gap-4">
                        {/* Room visual */}
                        <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex-shrink-0 flex items-center justify-center text-4xl">
                          {unit.category?.includes("люкс") || unit.category?.toLowerCase().includes("suite") ? "✨" : unit.category?.toLowerCase().includes("апарт") ? "🏢" : unit.category?.toLowerCase().includes("вілла") || unit.category?.toLowerCase().includes("villa") ? "🏡" : "🛏️"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between flex-wrap gap-2">
                            <div>
                              <h3 className="font-bold text-gray-900">{unit.name}</h3>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge className="bg-gray-100 text-gray-600 text-xs">{unit.category}</Badge>
                                {unit.floor && <span className="text-xs text-gray-400">{unit.floor} пов.</span>}
                                <span className="text-xs text-gray-400">до {unit.capacity} ос.</span>
                                {unit.squareMeters && <span className="text-xs text-gray-400">{unit.squareMeters} м²</span>}
                              </div>
                              <p className="text-xs text-gray-500 mt-1">{unit.propertyName}{unit.propertyAddress ? ` · ${unit.propertyAddress}` : ""}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-400">{parseFloat(unit.basePrice || "0").toLocaleString()} ₴/ніч</p>
                              <p className="text-xl font-bold text-blue-600">{unit.totalPrice.toLocaleString()} ₴</p>
                              <p className="text-xs text-gray-400">за {nights} {nights === 1 ? "ніч" : nights < 5 ? "ночі" : "ночей"}</p>
                            </div>
                          </div>
                          {unit.description && <p className="text-xs text-gray-600 mt-2 line-clamp-2">{unit.description}</p>}
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {unit.hasView && <span className="text-xs bg-blue-50 border border-blue-100 text-blue-600 px-2 py-0.5 rounded-full">👁 {unit.hasView}</span>}
                            {unit.hasBalcony && <span className="text-xs bg-green-50 border border-green-100 text-green-600 px-2 py-0.5 rounded-full">🌿 Балкон</span>}
                          </div>
                          <Button className="mt-3 bg-blue-600 hover:bg-blue-700" size="sm" onClick={() => handleSelect(unit)}>
                            Обрати номер <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: BOOKING FORM ── */}
        {step === "form" && selectedUnit && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Form */}
            <div className="md:col-span-2 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Ваші дані</h2>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Ім'я *</Label><Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Іван" /></div>
                    <div><Label>Прізвище *</Label><Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Коваленко" /></div>
                  </div>
                  <div><Label className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Email *</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ivan@example.com" />
                  </div>
                  <div><Label className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Телефон</Label>
                    <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+380 XX XXX XXXX" />
                  </div>
                  <div><Label>Особливі побажання</Label>
                    <Textarea rows={3} value={form.specialRequests}
                      onChange={e => setForm(f => ({ ...f, specialRequests: e.target.value }))}
                      placeholder="Побажання щодо номера, харчування, привід для відзначення..." />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm bg-amber-50 border-amber-100">
                <CardContent className="p-4 text-sm text-amber-800">
                  <p className="font-semibold mb-1">💳 Оплата</p>
                  <p>Оплата здійснюється при заїзді готівкою або карткою. Бронювання підтверджується без передоплати.</p>
                </CardContent>
              </Card>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base" onClick={handleBook} disabled={loading}>
                {loading ? "Обробка…" : `Підтвердити бронювання · ${selectedUnit.totalPrice.toLocaleString()} ₴`}
              </Button>
            </div>

            {/* Summary */}
            <div>
              <h3 className="font-bold text-gray-800 mb-3">Ваш вибір</h3>
              <Card className="border-0 shadow-sm sticky top-20">
                <CardContent className="p-5 space-y-3">
                  <div className="w-full h-24 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center text-4xl mb-2">
                    {selectedUnit.category?.toLowerCase().includes("люкс") || selectedUnit.category?.toLowerCase().includes("suite") ? "✨" : "🛏️"}
                  </div>
                  <p className="font-bold">{selectedUnit.name}</p>
                  <p className="text-xs text-gray-500">{selectedUnit.propertyName}</p>
                  <div className="border-t pt-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Заїзд</span><span className="font-medium">{search.checkIn}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Виїзд</span><span className="font-medium">{search.checkOut}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Ночей</span><span className="font-medium">{nights}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Гостей</span><span className="font-medium">{search.guests}</span></div>
                    <div className="border-t pt-2 flex justify-between font-bold text-base">
                      <span>Разом</span><span className="text-blue-600">{selectedUnit.totalPrice.toLocaleString()} ₴</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ── STEP 4: CONFIRMATION ── */}
        {step === "confirm" && confirmed && (
          <div className="max-w-lg mx-auto text-center py-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Бронювання підтверджено!</h2>
            <p className="text-gray-500 mb-4">Підтвердження надіслано на {confirmed.email}</p>

            <Card className="border-0 shadow-md mb-6">
              <CardContent className="p-6 text-left space-y-3">
                <div className="text-center mb-4">
                  <p className="text-xs text-gray-400 mb-1">Номер бронювання</p>
                  <p className="text-3xl font-bold text-blue-600 tracking-wider">{confirmed.bookingRef}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
                  <div><p className="text-gray-400 text-xs">Гість</p><p className="font-medium">{confirmed.firstName} {confirmed.lastName}</p></div>
                  <div><p className="text-gray-400 text-xs">Локація</p><p className="font-medium">{confirmed.propertyName}</p></div>
                  <div><p className="text-gray-400 text-xs">Заїзд</p><p className="font-medium">{confirmed.checkIn}</p></div>
                  <div><p className="text-gray-400 text-xs">Виїзд</p><p className="font-medium">{confirmed.checkOut}</p></div>
                  <div><p className="text-gray-400 text-xs">Ночей</p><p className="font-medium">{confirmed.nights}</p></div>
                  <div><p className="text-gray-400 text-xs">Сума</p><p className="font-bold text-blue-600">{parseFloat(String(confirmed.totalAmount || 0)).toLocaleString()} ₴</p></div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => { setStep("search"); setConfirmed(null); setForm({ firstName: "", lastName: "", email: "", phone: "", specialRequests: "" }); }}>
                Нове бронювання
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => window.print()}>
                🖨️ Роздрукувати
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
