import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, ArrowDownCircle, ArrowUpCircle, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

const UNITS = ["kg", "litre", "piece", "gram", "packet"] as const;

export default function Stocks() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const roles = useAuthStore((s) => s.roles);
  // Server rule (api-server.ts): a read-only mess_monitor may not write this model.
  const readOnly = isMonitorOnly(roles);

  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [openTxn, setOpenTxn] = useState<{ stockId: string; name: string; type: "in" | "out" } | null>(null);

  const [newForm, setNewForm] = useState({ name: "", unit: "kg" as typeof UNITS[number], quantity: "0", low_stock_threshold: "5" });
  const [txnForm, setTxnForm] = useState({ quantity: "", notes: "" });

  const { data: stocks, isLoading } = useQuery({
    queryKey: ["stocks", messId],
    enabled: !!messId,
    queryFn: async () => {
      return apiGet<any[]>("stocks", { mess_id: messId!, order: "name.asc" });
    },
  });

  async function handleCreate() {
    if (!messId || !newForm.name.trim()) return;
    try {
      await apiPost("stocks", {
        mess_id: messId,
        name: newForm.name.trim(),
        unit: newForm.unit,
        quantity: Number(newForm.quantity) || 0,
        low_stock_threshold: Number(newForm.low_stock_threshold) || 0,
      });
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success("Stock item added");
    setOpenNew(false);
    setNewForm({ name: "", unit: "kg", quantity: "0", low_stock_threshold: "5" });
    qc.invalidateQueries({ queryKey: ["stocks", messId] });
  }

  async function handleTxn() {
    if (!openTxn || !messId) return;
    const qty = Number(txnForm.quantity);
    if (!qty || qty <= 0) return toast.error("Enter a valid quantity");

    const stock = stocks?.find((s) => s.id === openTxn.stockId);
    if (!stock) return;
    const delta = openTxn.type === "in" ? qty : -qty;
    const newQty = Number(stock.quantity) + delta;
    if (newQty < 0) return toast.error("Not enough stock");

    try {
      await apiPost("stock-transactions", {
        mess_id: messId,
        stock_id: openTxn.stockId,
        txn_type: openTxn.type,
        quantity: qty,
        notes: txnForm.notes || null,
      });
      await apiPatch("stocks", openTxn.stockId, { quantity: newQty });
    } catch (e: any) {
      return toast.error(e.message);
    }

    toast.success(`${openTxn.type === "in" ? "Added to" : "Used from"} stock`);
    setOpenTxn(null);
    setTxnForm({ quantity: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["stocks", messId] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this stock item? All transactions will be removed.")) return;
    // No bulk delete in the API: delete this stock's transactions one by one.
    const txns = await apiGet<any[]>("stock-transactions", { stock_id: id });
    for (const t of txns) await apiDelete("stock-transactions", t.id);
    try {
      await apiDelete("stocks", id);
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["stocks", messId] });
  }

  const lowStockCount = stocks?.filter((s) => Number(s.quantity) <= Number(s.low_stock_threshold)).length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Stock</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lowStockCount > 0 ? (
              <span className="text-warning font-medium inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> {lowStockCount} item(s) low
              </span>
            ) : (
              "Track rice, oil, gas and groceries"
            )}
          </p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          {!readOnly && (
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Add Item</Button>
          </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader><DialogTitle>New Stock Item</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="e.g. Chal, Tel, Gas cylinder"
                  value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select value={newForm.unit} onValueChange={(v: any) => setNewForm({ ...newForm, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Initial Quantity</Label>
                  <Input type="number" step="0.01" value={newForm.quantity}
                    onChange={(e) => setNewForm({ ...newForm, quantity: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Low Stock Alert Threshold</Label>
                <Input type="number" step="0.01" value={newForm.low_stock_threshold}
                  onChange={(e) => setNewForm({ ...newForm, low_stock_threshold: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">You'll be alerted when quantity ≤ this value.</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : stocks?.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <Package className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No stock items yet. Add chal, tel, gas etc.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stocks?.map((s) => {
            const low = Number(s.quantity) <= Number(s.low_stock_threshold);
            return (
              <div key={s.id} className={`rounded-2xl border bg-card p-4 ${low ? "border-warning/50" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{s.name}</h3>
                    <p className="text-2xl font-bold tabular-nums mt-1">
                      {Number(s.quantity).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{s.unit}</span>
                    </p>
                  </div>
                  {low && <Badge variant="outline" className="border-warning text-warning gap-1"><AlertTriangle className="w-3 h-3" /> Low</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Alert at: {s.low_stock_threshold} {s.unit}</p>
                {!readOnly && (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 gap-1"
                    onClick={() => setOpenTxn({ stockId: s.id, name: s.name, type: "in" })}>
                    <ArrowDownCircle className="w-3.5 h-3.5" /> In
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1"
                    onClick={() => setOpenTxn({ stockId: s.id, name: s.name, type: "out" })}>
                    <ArrowUpCircle className="w-3.5 h-3.5" /> Out
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Transaction dialog */}
      <Dialog open={!!openTxn} onOpenChange={(o) => !o && setOpenTxn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {openTxn?.type === "in" ? "Add Stock" : "Use Stock"} — {openTxn?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" step="0.01" autoFocus
                value={txnForm.quantity} onChange={(e) => setTxnForm({ ...txnForm, quantity: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input value={txnForm.notes} onChange={(e) => setTxnForm({ ...txnForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleTxn}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
