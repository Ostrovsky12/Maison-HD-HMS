import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Download, Eye, Info } from "lucide-react";

const MOCK_INVOICES = [
  { id: 55, date: "8 червня", desc: "Застосунок «Poster Site» тариф «Сайт для замовлень», Застосунок «Poster QR» тариф «QR-меню», Застосунок «ПРРО» тариф «Стандартний», Застосунок «Postie AI Assistant» тариф «100 actions/month»", amount: 2240, status: "unpaid" },
  { id: 52, date: "8 серпня", desc: "Тариф «Business»", amount: 8460, status: "unpaid" },
  { id: 54, date: "9 травня", desc: "Застосунок «Poster Site» тариф «Сайт для замовлень», Застосунок «Poster QR» тариф «QR-меню», Застосунок «ПРРО» тариф «Стандартний», Застосунок «Postie AI Assistant» тариф «100 actions/month»", amount: 2240, status: "paid" },
  { id: 53, date: "13 квітня", desc: "Застосунок «Poster Site» тариф «Сайт для замовлень», Застосунок «Poster QR» тариф «QR-меню», Застосунок «ПРРО» тариф «Стандартний», Застосунок «Postie AI Assistant» тариф «100 actions/month»", amount: 2240, status: "paid" },
];

export default function FbConfigSubscription() {
  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-slate-600" />
            <h1 className="text-lg font-bold">Передплата</h1>
          </div>
        </div>

        <Tabs defaultValue="tariff" className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b px-6 bg-background">
            <TabsList className="h-9 gap-1 bg-transparent p-0">
              {[["tariff","Тариф"],["billing","Реквізити та сповіщення"]].map(([v,l]) => (
                <TabsTrigger key={v} value={v}
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-3 h-9 text-sm">
                  {l}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="tariff" className="flex-1 overflow-auto m-0 p-6">
            <div className="max-w-3xl space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-5 gap-4">
                {[
                  { label: "Акаунт дійсний до", val: "8 серпня" },
                  { label: "Передплата", val: "8 460,00 ₴", sub: "Кожні 3 місяці" },
                  { label: "Заклади", val: "1" },
                  { label: "Додаткові каси", val: "2" },
                  { label: "Тариф", val: "Business", action: "Змінити тариф" },
                ].map(s => (
                  <div key={s.label} className="border rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                    <p className="font-bold text-base">{s.val}</p>
                    {s.sub && <p className="text-xs text-muted-foreground">{s.sub}</p>}
                    {s.action && <button className="text-xs text-primary hover:underline mt-1">{s.action}</button>}
                  </div>
                ))}
              </div>

              {/* Invoices */}
              <div>
                <h2 className="font-semibold mb-3">Рахунки</h2>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium w-10">№</th>
                        <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium w-24">Дата оплати</th>
                        <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Послуги</th>
                        <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium w-28">Сума</th>
                        <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium w-24">Статус</th>
                        <th className="px-4 py-2.5 w-40"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {MOCK_INVOICES.map(inv => (
                        <tr key={inv.id} className="hover:bg-muted/10">
                          <td className="px-4 py-3 text-muted-foreground">{inv.id}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{inv.date}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-sm">{inv.desc}</td>
                          <td className="px-4 py-3 text-right font-mono font-medium whitespace-nowrap">
                            {inv.amount.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={inv.status === "paid" ? "outline" : "secondary"}
                              className={inv.status === "paid" ? "text-green-700 border-green-300 bg-green-50" : ""}>
                              {inv.status === "paid" ? "Оплачено" : "Не оплачено"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 justify-end">
                              {inv.status === "paid" ? (
                                <>
                                  <button className="text-xs text-primary hover:underline flex items-center gap-0.5"><Download className="w-3 h-3" /> Завантажити акт</button>
                                  <button className="text-xs text-primary hover:underline flex items-center gap-0.5"><Eye className="w-3 h-3" /> Подивитись</button>
                                </>
                              ) : (
                                <>
                                  <button className="text-xs text-primary hover:underline flex items-center gap-0.5"><Download className="w-3 h-3" /> Завантажити рахунок</button>
                                  <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700">Оплатити</Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="billing" className="flex-1 overflow-auto m-0 p-6">
            <div className="max-w-xl space-y-6">
              {/* Bank card */}
              <div>
                <h2 className="font-semibold mb-3">Банківська картка</h2>
                <p className="text-sm text-muted-foreground mb-3">З прив'язаної картки раз на місяць буде автоматично списуватися сума для оплати послуг</p>
                <div className="border rounded-xl px-4 py-3 bg-muted/20 font-mono text-sm text-muted-foreground">
                  •••• •••• •••• 25
                </div>
              </div>

              {/* Business details */}
              <div>
                <h2 className="font-semibold mb-1">Реквізити підприємства</h2>
                <p className="text-xs text-muted-foreground mb-4">Заповніть реквізити, щоб отримувати рахунки для здійснення передплати та акти виконаних робіт.</p>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm">Форма власності</Label>
                    <div className="flex gap-2 mt-1">
                      {["ФОП","ТОВ"].map(t => (
                        <button key={t} className={`px-6 py-1.5 rounded-lg border text-sm font-medium ${t==="ФОП"?"border-primary bg-primary/5 text-primary":"border-input"}`}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">ІПН</Label>
                    <Input placeholder="3211121537" className="mt-1 max-w-xs" />
                  </div>
                  <div>
                    <Label className="text-sm">Реквізити підприємства</Label>
                    <textarea className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background h-20 resize-none"
                      placeholder="ПІБ або назва підприємства, юридична адреса..." />
                  </div>
                  <div>
                    <Label className="text-sm">Адреса для отримання документів</Label>
                    <Input placeholder="м. Київ, вул. Ярославів Вал 15" className="mt-1 max-w-xs" />
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700">Зберегти</Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
