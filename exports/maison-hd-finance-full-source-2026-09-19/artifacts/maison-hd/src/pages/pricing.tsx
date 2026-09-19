import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  PLANS, MODULES, CATEGORY_LABELS, CATEGORY_ICONS,
  getModulesByCategory, isModuleInPlan, TOTAL_STANDALONE_PRICE,
  type PlanKey, type ModuleCategory,
} from "@/lib/modules";
import { CheckCircle2, XCircle, Zap, Crown, Star, ArrowRight, Package, Info } from "lucide-react";

export default function PricingPage() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [activeTab, setActiveTab] = useState<"plans" | "modules">("plans");
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");

  const fmtPrice = (p: number) =>
    Math.round(p).toLocaleString("uk-UA") + " ₴";

  const displayPrice = (price: number, priceYear: number) =>
    billing === "monthly" ? price : Math.round(priceYear / 12);

  const byCategory = getModulesByCategory();
  const categoryOrder: ModuleCategory[] = [
    "core", "revenue", "operations", "experience",
    "hospitality", "ai", "finance", "analytics", "platform",
  ];

  const planIcons: Record<PlanKey, any> = {
    starter: Star,
    professional: Zap,
    enterprise: Crown,
  };

  return (
    <AppLayout>
      <div className="min-h-screen">
        {/* ── Hero ── */}
        <div className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-900 text-white">
          <div className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(ellipse at 20% 60%, rgba(99,102,241,0.25) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(245,158,11,0.15) 0%, transparent 50%)" }}
          />
          <div className="relative max-w-5xl mx-auto px-6 py-16 text-center">
            <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-400/30 mb-5 text-xs px-4 py-1.5">
              Maison HD — Hospitality OS
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 font-display">
              Один продукт.
              <span className="block bg-gradient-to-r from-indigo-400 to-amber-400 bg-clip-text text-transparent">
                Дві моделі продажу.
              </span>
            </h1>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-8">
              Продавайте готелю повну платформу або складайте рішення з окремих модулів —
              ваш бізнес, ваш вибір.
            </p>

            {/* Billing toggle */}
            <div className="inline-flex bg-white/10 backdrop-blur-sm rounded-xl p-1 border border-white/15">
              <button
                onClick={() => setBilling("monthly")}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${billing === "monthly" ? "bg-white text-slate-900 shadow-sm" : "text-white/70 hover:text-white"}`}
              >
                Місячна оплата
              </button>
              <button
                onClick={() => setBilling("yearly")}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${billing === "yearly" ? "bg-white text-slate-900 shadow-sm" : "text-white/70 hover:text-white"}`}
              >
                Річна оплата
                <span className="text-xs bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-semibold">-20%</span>
              </button>
            </div>

            {/* Tab selector */}
            <div className="flex justify-center mt-8 gap-3">
              <button
                onClick={() => setActiveTab("plans")}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all border ${activeTab === "plans" ? "bg-indigo-600 border-indigo-500 text-white" : "border-white/20 text-white/60 hover:border-white/40 hover:text-white/80"}`}
              >
                Тарифні плани
              </button>
              <button
                onClick={() => setActiveTab("modules")}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all border ${activeTab === "modules" ? "bg-indigo-600 border-indigo-500 text-white" : "border-white/20 text-white/60 hover:border-white/40 hover:text-white/80"}`}
              >
                Окремі модулі
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-10">

          {/* ── PLANS TAB ── */}
          {activeTab === "plans" && (
            <div className="space-y-8">
              {/* Plan cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {(Object.values(PLANS) as typeof PLANS[PlanKey][]).map(plan => {
                  const Icon = planIcons[plan.key];
                  const price = displayPrice(plan.price, plan.priceYear);
                  return (
                    <div
                      key={plan.key}
                      className={`relative rounded-2xl border-2 p-6 flex flex-col ${
                        plan.highlight
                          ? "border-indigo-400 bg-gradient-to-b from-indigo-50 to-white shadow-xl shadow-indigo-100"
                          : `${plan.borderColor} ${plan.bgColor}`
                      }`}
                    >
                      {plan.badge && (
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                          <span className={`px-4 py-1 rounded-full text-xs font-bold shadow-sm ${
                            plan.highlight ? "bg-indigo-600 text-white" : "bg-amber-500 text-white"
                          }`}>
                            {plan.badge}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-3 mb-4">
                        <div className={`p-2.5 rounded-xl ${plan.highlight ? "bg-indigo-100" : "bg-white/80 border"}`}>
                          <Icon className={`w-5 h-5 ${plan.color}`} />
                        </div>
                        <div>
                          <div className={`font-bold text-lg ${plan.color}`}>{plan.name}</div>
                          <div className="text-xs text-gray-500">{plan.description}</div>
                        </div>
                      </div>

                      <div className="mb-5">
                        <div className={`text-4xl font-bold ${plan.color} font-display tracking-tight`}>
                          {fmtPrice(price)}
                        </div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          / місяць
                          {billing === "yearly" && (
                            <span className="ml-2 text-emerald-600 font-semibold text-xs">
                              Економія {fmtPrice(plan.price * 12 - plan.priceYear)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Limits */}
                      <div className="grid grid-cols-3 gap-2 mb-5 p-3 bg-white/60 rounded-xl border border-white/50">
                        {[
                          { label: "Номерів", value: plan.maxUnits === 99999 ? "∞" : plan.maxUnits },
                          { label: "Юзерів", value: plan.maxUsers === 99999 ? "∞" : plan.maxUsers },
                          { label: "Готелів", value: plan.maxProperties === 99999 ? "∞" : plan.maxProperties },
                        ].map(l => (
                          <div key={l.label} className="text-center">
                            <div className={`text-xl font-bold ${plan.color}`}>{l.value}</div>
                            <div className="text-xs text-gray-500">{l.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Modules count */}
                      <div className="mb-5 text-sm text-gray-600">
                        <span className="font-semibold text-gray-900">{MODULES.filter(m => m.includedIn.includes(plan.key)).length}</span> модулів включено
                      </div>

                      <Button
                        className={`w-full mt-auto ${plan.highlight ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-white border-2 hover:bg-gray-50 text-gray-800 border-gray-200"}`}
                        onClick={() => navigate(`~${BASE}/subscription`)}
                      >
                        Обрати план <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Feature matrix */}
              <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b bg-gray-50 flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-500" />
                  <h3 className="font-semibold text-gray-800">Порівняння модулів по планах</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50/50">
                        <th className="text-left px-6 py-3 font-medium text-gray-500 w-64">Модуль</th>
                        {Object.values(PLANS).map(p => (
                          <th key={p.key} className={`px-4 py-3 font-semibold text-center ${p.color} w-32`}>{p.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {categoryOrder.map(cat => {
                        const mods = byCategory[cat];
                        if (!mods?.length) return null;
                        return [
                          <tr key={`cat-${cat}`} className="border-b bg-gray-50">
                            <td colSpan={4} className="px-6 py-2 text-xs font-semibold text-gray-400 uppercase tracking-widest">
                              {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
                            </td>
                          </tr>,
                          ...mods.map(mod => (
                            <tr key={mod.key} className="border-b hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-2">
                                  <span>{mod.icon}</span>
                                  <div>
                                    <div className="font-medium text-gray-800">{mod.nameUk}</div>
                                    <div className="text-xs text-gray-400 leading-tight">{mod.description}</div>
                                  </div>
                                </div>
                              </td>
                              {(["starter", "professional", "enterprise"] as PlanKey[]).map(planKey => (
                                <td key={planKey} className="px-4 py-3 text-center">
                                  {mod.comingSoon ? (
                                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Скоро</span>
                                  ) : isModuleInPlan(mod.key, planKey) ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-gray-200 mx-auto" />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── MODULES TAB ── */}
          {activeTab === "modules" && (
            <div className="space-y-6">
              {/* Info banner */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800">
                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Модульна модель — для Starter плану</p>
                  <p className="text-sm text-blue-600 mt-0.5">
                    Ви отримуєте базову PMS та додаєте тільки потрібні модулі.
                    Значно вигідніше за Professional план якщо потрібно 3-5 функцій.
                    Повний набір модулів (à la carte) = {fmtPrice(990 + TOTAL_STANDALONE_PRICE)}/міс.
                  </p>
                </div>
              </div>

              {/* Module grid by category */}
              {categoryOrder.map(cat => {
                const mods = byCategory[cat];
                if (!mods?.length) return null;
                const hasPaid = mods.some(m => m.standalonePrice !== null);
                if (!hasPaid && cat === "core") return null; // Core is always included
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{CATEGORY_ICONS[cat]}</span>
                      <h3 className="font-semibold text-gray-800">{CATEGORY_LABELS[cat]}</h3>
                      <div className="flex-1 border-b border-gray-100 ml-2" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {mods.map(mod => (
                        <div
                          key={mod.key}
                          onMouseEnter={() => setHoveredModule(mod.key)}
                          onMouseLeave={() => setHoveredModule(null)}
                          className={`relative p-4 rounded-xl border-2 transition-all cursor-default ${
                            mod.key === "core_pms"
                              ? "border-gray-300 bg-gray-50 opacity-70"
                              : hoveredModule === mod.key
                                ? "border-indigo-300 bg-indigo-50 shadow-sm"
                                : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                        >
                          {mod.comingSoon && (
                            <div className="absolute top-3 right-3">
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Скоро</span>
                            </div>
                          )}
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{mod.icon}</span>
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900 text-sm">{mod.nameUk}</div>
                              <div className="text-xs text-gray-500 mt-0.5 leading-tight">{mod.description}</div>
                              <div className="mt-3 flex items-center gap-2">
                                {mod.standalonePrice ? (
                                  <>
                                    <span className="font-bold text-indigo-600">{fmtPrice(mod.standalonePrice)}/міс</span>
                                    <span className="text-xs text-gray-400">додатково</span>
                                  </>
                                ) : mod.key === "core_pms" ? (
                                  <span className="text-xs text-gray-500 font-medium">Включено в усі плани</span>
                                ) : (
                                  <span className="text-xs text-gray-400">Тільки у вищих планах</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Included in plans indicator */}
                          <div className="mt-3 flex gap-1">
                            {(["starter", "professional", "enterprise"] as PlanKey[]).map(pk => (
                              <div
                                key={pk}
                                title={PLANS[pk].name}
                                className={`h-1.5 flex-1 rounded-full ${
                                  isModuleInPlan(mod.key, pk)
                                    ? pk === "starter" ? "bg-slate-400" : pk === "professional" ? "bg-indigo-500" : "bg-amber-500"
                                    : "bg-gray-100"
                                }`}
                              />
                            ))}
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 px-0.5">
                            <span>Starter</span><span>Pro</span><span>Enterprise</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* CTA */}
              <div className="mt-8 p-6 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl text-white text-center">
                <h3 className="text-xl font-bold mb-2">Не знаєте, що обрати?</h3>
                <p className="text-indigo-200 text-sm mb-4">
                  Наш консультант підбере оптимальний набір модулів під ваш заклад безкоштовно
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold">
                    Безкоштовна консультація
                  </Button>
                  <Button variant="outline" className="border-white/40 text-white hover:bg-white/10">
                    Спробувати 30 днів безкоштовно
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FAQ strip */}
        <div className="border-t bg-gray-50 py-10">
          <div className="max-w-3xl mx-auto px-6">
            <h3 className="text-center text-lg font-semibold text-gray-800 mb-6">Часті питання</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { q: "Чи можна змінити план пізніше?", a: "Так, план можна змінити будь-якого місяця. Зміна набирає чинності з наступного розрахункового періоду." },
                { q: "Як додати окремий модуль?", a: "У вашому кабінеті Super Admin → Тенанти → кнопка редагування → розділ Модулі." },
                { q: "Чи є безкоштовний тріал?", a: "Так — 30 днів безкоштовно на будь-якому тарифі. Картка не потрібна." },
                { q: "Що входить в Enterprise?", a: "Всі модулі + HQ для кількох готелів + White-label + API + виділений менеджер підтримки." },
              ].map(faq => (
                <div key={faq.q} className="bg-white rounded-xl p-4 border border-gray-200">
                  <div className="font-semibold text-gray-800 text-sm mb-1">{faq.q}</div>
                  <div className="text-gray-500 text-xs leading-relaxed">{faq.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
