import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, Building2, CalendarDays, BarChart3, Globe2, Shield, Zap, ChevronRight, Star, Hotel, Users, TrendingUp, Clock } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_URL = BASE.replace("/maison-hd", "") + "/api";

const FEATURES = [
  { icon: CalendarDays, title: "Шахматка бронювань", desc: "Наочне управління номерним фондом з drag-and-drop інтерфейсом" },
  { icon: Globe2, title: "OTA інтеграції", desc: "Підключення до Booking.com, Airbnb, Expedia та інших каналів" },
  { icon: BarChart3, title: "Аналітика і звіти", desc: "Детальна статистика доходів, завантаженості та KPI готелю" },
  { icon: Building2, title: "Мультиоб'єктність", desc: "Управляйте кількома готелями з єдиного кабінету" },
  { icon: Shield, title: "Ролева система", desc: "Гнучке налаштування прав для адміністраторів, покоївок, бухгалтерії" },
  { icon: Zap, title: "Автоматизація", desc: "Нічний аудит, сповіщення, автоматичні звіти та задачі" },
];

const TESTIMONIALS = [
  { name: "Олена Коваль", role: "Директор готелю «Карпатський рай»", text: "Maison HD повністю замінив нашу стару систему. Завантаженість зросла на 23% завдяки синхронізації з OTA.", rating: 5 },
  { name: "Іван Мельник", role: "Власник комплексу «Буковель Резорт»", text: "Шахматка бронювань — найкраще, що ми бачили. Персонал освоїв систему за 2 дні.", rating: 5 },
  { name: "Марина Дорошенко", role: "GM готелю «Панорама»", text: "Аналітика допомагає приймати рішення на основі даних. Рекомендую всім колегам.", rating: 5 },
];

const STATS = [
  { value: "500+", label: "Готелів", icon: Hotel },
  { value: "50 000+", label: "Бронювань на місяць", icon: CalendarDays },
  { value: "98%", label: "Задоволених клієнтів", icon: Star },
  { value: "24/7", label: "Технічна підтримка", icon: Clock },
];

export default function DemoPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    propertiesCount: "1",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.company.trim()) {
      toast({ title: "Заповніть обов'язкові поля", description: "Ім'я, email та назва компанії є обов'язковими", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          propertiesCount: Number(form.propertiesCount),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Помилка відправки");
      }

      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Помилка", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ── NAV ─────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight">Maison HD</span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors">Можливості</a>
              <a href="#testimonials" className="hover:text-foreground transition-colors">Відгуки</a>
              <a href="#pricing" className="hover:text-foreground transition-colors">Ціни</a>
            </div>
            <div className="flex items-center gap-3">
              <a href={`${BASE}/login`}>
                <Button variant="ghost" size="sm">Увійти</Button>
              </a>
              <a href="#demo-form">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700">Демо</Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-amber-50 via-orange-50/30 to-white py-24 px-4">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-400/10 rounded-full blur-3xl" />
        </div>
        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1 text-sm font-medium bg-amber-100 text-amber-800 border-amber-200">
            <Zap className="h-3.5 w-3.5" /> Хмарна PMS для готелів України
          </Badge>
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl leading-tight">
            Готельний менеджмент
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-500">нового покоління</span>
          </h1>
          <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Maison HD — це повноцінна PMS-система для малих і середніх готелів. Шахматка, OTA-інтеграції, аналітика та автоматизація в одному місці.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#demo-form">
              <Button size="lg" className="gap-2 px-8 bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-200">
                Замовити демо <ChevronRight className="h-4 w-4" />
              </Button>
            </a>
            <a href={`${BASE}/login`}>
              <Button size="lg" variant="outline" className="px-8">
                Спробувати безкоштовно
              </Button>
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-500">14 днів безкоштовно · Без кредитної картки</p>
        </div>
      </section>

      {/* ── STATS ───────────────────────────────── */}
      <section className="bg-gray-900 py-14 px-4">
        <div className="mx-auto max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map(({ value, label, icon: Icon }) => (
            <div key={label} className="text-center">
              <Icon className="h-6 w-6 text-amber-400 mx-auto mb-3" />
              <div className="text-3xl font-bold text-white">{value}</div>
              <div className="text-sm text-gray-400 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────── */}
      <section id="features" className="py-24 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Все для управління готелем</h2>
            <p className="mt-4 text-lg text-gray-600">Від бронювань до бухгалтерії — в єдиній хмарній платформі</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="group rounded-2xl border bg-white p-8 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────── */}
      <section id="testimonials" className="bg-gray-50 py-24 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Що кажуть наші клієнти</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {TESTIMONIALS.map(({ name, role, text, rating }) => (
              <div key={name} className="rounded-2xl bg-white border p-8 shadow-sm">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed italic">"{text}"</p>
                <div className="mt-6 border-t pt-4">
                  <div className="font-semibold text-sm text-gray-900">{name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ──────────────────────── */}
      <section id="pricing" className="py-24 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-gray-900">Прозора тарифікація</h2>
          <p className="mt-4 text-lg text-gray-600">Від 990 ₴/місяць · Без прихованих комісій</p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { tier: "Basic", price: "990", units: "до 30", users: "до 5", color: "border-gray-200" },
              { tier: "Pro", price: "2 490", units: "до 100", users: "до 20", color: "border-amber-500", popular: true },
              { tier: "Enterprise", price: "Індивідуально", units: "Необмежено", users: "Необмежено", color: "border-gray-200" },
            ].map(({ tier, price, units, users, color, popular }) => (
              <div key={tier} className={`relative rounded-2xl border-2 ${color} bg-white p-8 shadow-sm ${popular ? "shadow-amber-100" : ""}`}>
                {popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge className="bg-amber-600 text-white px-3">Популярний</Badge>
                  </div>
                )}
                <div className="font-bold text-lg text-gray-900">{tier}</div>
                <div className="mt-3 text-3xl font-bold text-gray-900">
                  {price === "Індивідуально" ? <span className="text-2xl">{price}</span> : <>{price} <span className="text-base font-normal text-gray-500">₴/міс</span></>}
                </div>
                <ul className="mt-6 space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />{units} об'єктів</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />{users} користувачів</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />OTA інтеграції</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />Аналітика</li>
                </ul>
                <a href="#demo-form" className="block mt-8">
                  <Button className={`w-full ${popular ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`} variant={popular ? "default" : "outline"}>
                    Замовити демо
                  </Button>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEMO FORM ───────────────────────────── */}
      <section id="demo-form" className="bg-gradient-to-br from-amber-50 to-orange-50 py-24 px-4">
        <div className="mx-auto max-w-2xl">
          {submitted ? (
            <div className="text-center py-16">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Заявку отримано!</h2>
              <p className="mt-4 text-lg text-gray-600">
                Наш менеджер зв'яжеться з вами протягом 24 годин для узгодження часу демонстрації.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                <a href={`${BASE}/login`}>
                  <Button size="lg" className="bg-amber-600 hover:bg-amber-700">
                    Увійти в систему
                  </Button>
                </a>
                <Button size="lg" variant="outline" onClick={() => setSubmitted(false)}>
                  Надіслати ще одну заявку
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center mb-10">
                <Badge variant="secondary" className="mb-4 bg-amber-100 text-amber-800 border-amber-200">
                  Безкоштовна демонстрація
                </Badge>
                <h2 className="text-3xl font-bold text-gray-900">Замовте персональне демо</h2>
                <p className="mt-3 text-gray-600">
                  Ми покажемо, як Maison HD вирішить завдання саме вашого готелю
                </p>
              </div>

              <form onSubmit={handleSubmit} className="rounded-2xl bg-white border shadow-sm p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Ваше ім'я <span className="text-red-500">*</span></Label>
                    <Input
                      id="name"
                      placeholder="Іван Петренко"
                      value={form.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Назва готелю / компанії <span className="text-red-500">*</span></Label>
                    <Input
                      id="company"
                      placeholder="Готель «Мрія»"
                      value={form.company}
                      onChange={(e) => handleChange("company", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="ivan@hotel.ua"
                      value={form.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Телефон</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+380 XX XXX XX XX"
                      value={form.phone}
                      onChange={(e) => handleChange("phone", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="propertiesCount">Кількість об'єктів (номерів)</Label>
                  <Select value={form.propertiesCount} onValueChange={(v) => handleChange("propertiesCount", v)}>
                    <SelectTrigger id="propertiesCount">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1–10 номерів</SelectItem>
                      <SelectItem value="15">11–30 номерів</SelectItem>
                      <SelectItem value="50">31–100 номерів</SelectItem>
                      <SelectItem value="150">100+ номерів</SelectItem>
                      <SelectItem value="5">Декілька об'єктів</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Що вас цікавить найбільше?</Label>
                  <Textarea
                    id="message"
                    rows={4}
                    placeholder="Розкажіть про ваш готель, задачі або питання, які ви хочете вирішити..."
                    value={form.message}
                    onChange={(e) => handleChange("message", e.target.value)}
                    className="resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={loading}
                >
                  {loading ? (
                    <><span className="animate-spin">⏳</span> Відправка...</>
                  ) : (
                    <>Замовити демо <ChevronRight className="h-4 w-4" /></>
                  )}
                </Button>

                <p className="text-center text-xs text-gray-400">
                  Натискаючи кнопку, ви погоджуєтесь з <span className="underline cursor-pointer">умовами використання</span> та <span className="underline cursor-pointer">політикою конфіденційності</span>
                </p>
              </form>
            </>
          )}
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────── */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <span className="text-white font-semibold">Maison HD</span>
          </div>
          <div className="text-sm text-center">
            © 2026 Maison HD. Всі права захищені.
          </div>
          <div className="flex gap-4 text-sm">
            <a href={`${BASE}/login`} className="hover:text-white transition-colors">Вхід</a>
            <a href="#features" className="hover:text-white transition-colors">Можливості</a>
            <a href="#demo-form" className="hover:text-white transition-colors">Демо</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
