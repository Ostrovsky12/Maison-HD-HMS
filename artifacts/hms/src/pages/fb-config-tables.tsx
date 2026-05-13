import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save, Loader2, Pencil, LayoutGrid } from "lucide-react";

const API = "/api/fb/config";
async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers||{}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

interface HallTable { id?: number; table_number: number; pos_x: number; pos_y: number; width: number; height: number; seats: number; hall_name: string; }

const CELL = 20;
const GRID_W = 36;
const GRID_H = 24;

export default function FbConfigTables() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tables, setTables] = useState<HallTable[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hall, setHall] = useState("Основний зал");
  const gridRef = useRef<HTMLDivElement>(null);

  const { isLoading } = useQuery({
    queryKey: ["fb-hall-tables"],
    queryFn: () => apiFetch(`${API}/tables`),
    onSuccess: (d) => {
      if (d.tables?.length) setTables(d.tables);
      else setTables(Array.from({ length: 14 }, (_, i) => ({
        table_number: i + 1,
        pos_x: ((i % 4) * 5 + 1) * CELL,
        pos_y: (Math.floor(i / 4) * 6 + 2) * CELL,
        width: 80, height: 80, seats: 4, hall_name: "Основний зал",
      })));
    },
  });

  const save = useMutation({
    mutationFn: () => apiFetch(`${API}/tables`, { method: "PUT", body: JSON.stringify({ tables }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-hall-tables"] }); toast({ title: "План залу збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const addTable = () => {
    const maxNum = tables.reduce((m, t) => Math.max(m, t.table_number), 0);
    setTables(prev => [...prev, {
      table_number: maxNum + 1, pos_x: CELL * 2, pos_y: CELL * 2,
      width: 80, height: 80, seats: 4, hall_name: hall,
    }]);
  };

  const onMouseDown = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragging(idx);
  };

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging === null || !gridRef.current) return;
    const gr = gridRef.current.getBoundingClientRect();
    const rawX = e.clientX - gr.left - dragOffset.x;
    const rawY = e.clientY - gr.top - dragOffset.y;
    const snapX = Math.round(rawX / CELL) * CELL;
    const snapY = Math.round(rawY / CELL) * CELL;
    const x = Math.max(0, Math.min(snapX, GRID_W * CELL - tables[dragging].width));
    const y = Math.max(0, Math.min(snapY, GRID_H * CELL - tables[dragging].height));
    setTables(prev => prev.map((t, i) => i === dragging ? { ...t, pos_x: x, pos_y: y } : t));
  }, [dragging, dragOffset, tables]);

  const onMouseUp = () => setDragging(null);

  if (isLoading) return <AppLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LayoutGrid className="w-5 h-5 text-slate-600" />
            <h1 className="text-lg font-bold">План залу</h1>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-3 border-b flex items-center gap-3 bg-background">
          <div className="flex items-center gap-2">
            <select value={hall} onChange={e => setHall(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm bg-background font-medium">
              <option>Основний зал</option>
              <option>Тераса</option>
              <option>VIP зона</option>
            </select>
            <button className="text-sm text-primary hover:underline">Ред.</button>
          </div>
          <Button size="sm" variant="outline" className="ml-auto" onClick={addTable}>
            <Plus className="w-4 h-4 mr-1" />Додати стіл
          </Button>
        </div>

        {/* Grid canvas */}
        <div className="flex-1 overflow-auto bg-[#f8f9fb] p-2">
          <div
            ref={gridRef}
            className="relative select-none"
            style={{
              width: GRID_W * CELL,
              height: GRID_H * CELL,
              backgroundImage: "radial-gradient(circle, #d0d0d0 1px, transparent 1px)",
              backgroundSize: `${CELL}px ${CELL}px`,
              cursor: dragging !== null ? "grabbing" : "default",
            }}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {tables.filter(t => t.hall_name === hall).map((t, idx) => {
              const realIdx = tables.indexOf(t);
              return (
                <div key={idx}
                  className="absolute flex items-center justify-center rounded-sm text-slate-600 font-semibold text-sm shadow-sm"
                  style={{
                    left: t.pos_x, top: t.pos_y, width: t.width, height: t.height,
                    background: dragging === realIdx ? "#c8c8c8" : "#b0b0b0",
                    cursor: "grab",
                    userSelect: "none",
                  }}
                  onMouseDown={(e) => onMouseDown(e, realIdx)}
                >
                  {t.table_number}
                  <div className="absolute bottom-0.5 right-0.5 w-2 h-2 opacity-50">
                    <svg viewBox="0 0 8 8"><path d="M8 8L0 8L8 0Z" fill="currentColor" /></svg>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3 flex items-center justify-between bg-background shrink-0">
          <span className="text-sm text-muted-foreground">Столів: {tables.filter(t=>t.hall_name===hall).length}</span>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-green-600 hover:bg-green-700">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Зберегти
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
