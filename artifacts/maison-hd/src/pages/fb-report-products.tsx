import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Search, ArrowUpDown } from "lucide-react";

const API = "/api/fb";
async function apiFetch(path: string) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

const fmt = (n: number) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().split("T")[0]; }

const PRESETS = [
  { label: "7 днів", from: () => daysAgo(6), to: () => today() },
  { label: "30 днів", from: () => daysAgo(29), to: () => today() },
  { label: "Цей місяць", from: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0], to: () => today() },
];

type SortKey = "revenue" | "qty";

export default function FbReportProducts() {
  const [tab, setTab] = useState<"products" | "categories">("products");
  const [preset, setPreset] = useState(1);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [sort, setSort] = useState<SortKey>("revenue");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const productsQ = useQuery({
    queryKey: ["fb-analytics-products", from, to],
    queryFn: () => apiFetch(`/analytics/products?from=${from}&to=${to}`),
    enabled: tab === "products",
  });

  const catsQ = useQuery({
    queryKey: ["fb-analytics-categories", from, to],
    queryFn: () => apiFetch(`/analytics/categories?from=${from}&to=${to}`),
    enabled: tab === "categories",
  });

  function applyPreset(i: number) {
    setPreset(i);
    setFrom(PRESETS[i].from());
    setTo(PRESETS[i].to());
  }

  const products: any[] = productsQ.data?.products || [];
  const categories: any[] = catsQ.data?.categories || [];

  const allCats = [...new Set(products.map((p: any) => p.category_name))].sort();

  const filteredProducts = products
    .filter(p =>
      (!search || p.name.toLowerCase().includes(search.toLowerCase())) &&
      (categoryFilter === "all" || p.category_name === categoryFilter)
    )
    .sort((a, b) => Number(b[sort]) - Number(a[sort]));

  const totalRevProducts = filteredProducts.reduce((s, p) => s + Number(p.revenue), 0);
  const totalQtyProducts = filteredProducts.reduce((s, p) => s + Number(p.qty), 0);

  const totalRevCats = categories.reduce((s, c) => s + Number(c.revenue), 0);
  const totalQtyCats = categories.reduce((s, c) => s + Number(c.qty), 0);

  const isLoading = tab === "products" ? productsQ.isLoading : catsQ.isLoading;

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Товари та категорії</h1>
            <p className="text-sm text-muted-foreground">Аналітика продажів по стравах</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
          <button onClick={() => setTab("products")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "products" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Товари ({products.length})
          </button>
          <button onClick={() => setTab("categories")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "categories" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Категорії ({categories.length})
          </button>
        </div>

        {/* Filters */}
        <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(i)}
                className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }}
            className="border rounded px-2 py-1.5 bg-background text-xs" />
          <span className="text-muted-foreground text-xs">—</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }}
            className="border rounded px-2 py-1.5 bg-background text-xs" />

          {tab === "products" && (
            <>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="border rounded px-2 py-1.5 bg-background text-xs">
                <option value="all">Всі категорії</option>
                {allCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex items-center gap-1.5 border rounded px-2 py-1.5 bg-background text-xs ml-auto">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input placeholder="Пошук страви..." value={search} onChange={e => setSearch(e.target.value)}
                  className="bg-transparent outline-none w-32" />
              </div>
            </>
          )}
        </div>

        {/* Products Table */}
        {tab === "products" && (
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs w-8">#</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Страва</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Категорія</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">
                      <button onClick={() => setSort("qty")} className={`flex items-center gap-1 ml-auto ${sort === "qty" ? "text-primary" : ""}`}>
                        К-сть <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs w-32">Виторг, %</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">
                      <button onClick={() => setSort("revenue")} className={`flex items-center gap-1 ml-auto ${sort === "revenue" ? "text-primary" : ""}`}>
                        Виторг ₴ <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Завантаження...</td></tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Немає даних</td></tr>
                  ) : (
                    filteredProducts.map((p: any, i: number) => {
                      const revPct = totalRevProducts > 0 ? Number(p.revenue) / totalRevProducts * 100 : 0;
                      return (
                        <tr key={p.item_id || p.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-2.5 font-medium">{p.name}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.category_name}</td>
                          <td className="px-4 py-2.5 text-right">{Number(p.qty).toFixed(0)} шт.</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 justify-end">
                              <span className="text-xs text-muted-foreground w-10 text-right">{revPct.toFixed(1)}%</span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${revPct}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmt(Number(p.revenue))}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredProducts.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-muted/40">
                      <td colSpan={3} className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Разом</td>
                      <td className="px-4 py-2.5 text-right font-bold text-xs">{totalQtyProducts.toFixed(0)} шт.</td>
                      <td className="px-4 py-2.5 text-right font-bold text-xs">100%</td>
                      <td className="px-4 py-2.5 text-right font-bold">{fmt(totalRevProducts)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* Categories Table */}
        {tab === "categories" && (
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Категорія</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">К-сть</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Виторг, %</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Виторг ₴</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">Завантаження...</td></tr>
                  ) : categories.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">Немає даних</td></tr>
                  ) : (
                    categories.map((c: any) => {
                      const revPct = totalRevCats > 0 ? Number(c.revenue) / totalRevCats * 100 : 0;
                      return (
                        <tr key={c.category_id || c.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{Number(c.qty).toFixed(0)} шт.</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 justify-end">
                              <span className="text-xs text-muted-foreground w-10 text-right">{revPct.toFixed(1)}%</span>
                              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${revPct}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{fmt(Number(c.revenue))}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {categories.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-muted/40">
                      <td className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Разом</td>
                      <td className="px-4 py-2.5 text-right font-bold text-xs">{totalQtyCats.toFixed(0)} шт.</td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold">100%</td>
                      <td className="px-4 py-2.5 text-right font-bold">{fmt(totalRevCats)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
