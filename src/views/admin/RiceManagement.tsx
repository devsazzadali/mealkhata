"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Wheat, Plus, History, TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function RiceManagement() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const roles = useAuthStore((s) => s.roles);
  // Server rule (api-server.ts): a read-only mess_monitor may not write this model.
  const readOnly = isMonitorOnly(roles);

  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ quantity: "", notes: "" });

  const { data: riceStock, isLoading: loadingStock } = useQuery({
    queryKey: ["rice-stock", messId],
    enabled: !!messId,
    queryFn: async () => {
      // Find the stock item named "Rice" or "Chal". The API has no .or() /
      // ilike filter, so fetch the mess's stocks and match in JS.
      const stocks = await apiGet<any[]>("stocks", { mess_id: messId! });
      const data = stocks.find((st: any) => {
        const n = String(st.name ?? "").toLowerCase();
        return n.includes("chal") || n.includes("rice") || n.includes("চাউল");
      });

      // If doesn't exist, create it
      if (!data) {
        const newItem = await apiPost<any>("stocks", {
          mess_id: messId!,
          name: "চাউল (Rice)",
          unit: "kg",
          quantity: 0,
          low_stock_threshold: 5,
        });
        return newItem;
      }
      return data;
    },
  });

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["rice-history", riceStock?.id],
    enabled: !!riceStock?.id,
    queryFn: async () => {
      return apiGet<any[]>("stock-transactions", {
        stock_id: riceStock!.id, order: "created_at.desc", limit: 10,
      });
    },
  });

  async function handleTransaction(type: "in" | "out") {
    if (!messId || !riceStock) return;
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) return toast.error("সঠিক পরিমাণ লিখুন");

    setSubmitting(true);
    try {
      const delta = type === "in" ? qty : -qty;
      const newQty = (riceStock.quantity || 0) + delta;
      
      if (newQty < 0) {
        toast.error("স্টকে যথেষ্ট চাউল নেই");
        return;
      }

      await apiPost("stock-transactions", {
        mess_id: messId,
        stock_id: riceStock.id,
        txn_type: type,
        quantity: qty,
        notes: form.notes || null,
      });

      await apiPatch("stocks", riceStock.id, { quantity: newQty });

      toast.success(type === "in" ? "চাউল জমা করা হয়েছে" : "চাউল খরচ রেকর্ড করা হয়েছে");
      setForm({ quantity: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["rice-stock", messId] });
      qc.invalidateQueries({ queryKey: ["rice-history", riceStock.id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteTxn(id: string, qty: number, type: string) {
    if (!confirm("এই রেকর্ডটি মুছতে চান? স্টকের পরিমাণ আবার আগের মতো হয়ে যাবে।")) return;
    
    const delta = type === "in" ? -qty : qty;
    const newQty = (riceStock?.quantity || 0) + delta;

    try {
      await apiDelete("stock-transactions", id);
    } catch (e: any) {
      return toast.error(e.message);
    }

    await apiPatch("stocks", riceStock!.id, { quantity: newQty });
    
    toast.success("রেকর্ড মোছা হয়েছে");
    qc.invalidateQueries({ queryKey: ["rice-stock", messId] });
    qc.invalidateQueries({ queryKey: ["rice-history", riceStock?.id] });
  }

  if (loadingStock) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Wheat className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">চাউল ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground mt-1">মেসের চাউল জমা এবং ব্যবহারের হিসাব রাখুন</p>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* Current Stock */}
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-3xl border bg-card p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Wheat className="w-24 h-24" />
            </div>
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">বর্তমানে স্টকে আছে</span>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-black tabular-nums text-primary">{riceStock?.quantity || 0}</span>
              <span className="text-xl font-medium text-muted-foreground">কেজি</span>
            </div>
            {Number(riceStock?.quantity) <= Number(riceStock?.low_stock_threshold) && (
              <p className="text-xs text-destructive font-medium bg-destructive/10 px-3 py-1 rounded-full">স্টক কম আছে!</p>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-6 space-y-4 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" /> চাউল জমা/খরচ যোগ করুন
            </h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="qty">পরিমাণ (কেজি)</Label>
                <Input
                  id="qty"
                  type="number"
                  step="0.1"
                  placeholder="0.00"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="h-11 text-lg font-semibold tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">নোট (ঐচ্ছিক)</Label>
                <Input
                  id="notes"
                  placeholder="উদা: বাড়ি থেকে আনা বা বাজার থেকে কেনা"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="h-11"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button 
                  onClick={() => handleTransaction("in")} 
                  disabled={submitting || readOnly} 
                  className="h-11 bg-success hover:bg-success/90 text-white gap-2"
                >
                  <TrendingUp className="w-4 h-4" /> জমা (In)
                </Button>
                <Button 
                  onClick={() => handleTransaction("out")} 
                  disabled={submitting || readOnly} 
                  variant="outline" 
                  className="h-11 border-destructive text-destructive hover:bg-destructive/10 gap-2"
                >
                  <TrendingDown className="w-4 h-4" /> খরচ (Out)
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* History */}
        <div className="md:col-span-3 space-y-4">
          <h3 className="font-semibold flex items-center gap-2 px-2">
            <History className="w-4 h-4" /> সাম্প্রতিক লেনদেন
          </h3>
          {loadingHistory ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : !history || history.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground bg-muted/20">
              এখনো কোনো লেনদেন নেই
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between p-4 rounded-2xl border bg-card hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${txn.txn_type === 'in' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
                      {txn.txn_type === 'in' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-semibold flex items-center gap-2">
                        {txn.txn_type === 'in' ? 'জমা' : 'খরচ'}: {txn.quantity} কেজি
                        {txn.notes && <span className="text-xs font-normal text-muted-foreground line-clamp-1">— {txn.notes}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{format(new Date(txn.created_at), "dd MMM, hh:mm a")}</p>
                    </div>
                  </div>
                  {!readOnly && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteTxn(txn.id, txn.quantity, txn.txn_type)}>
                    <Trash2 className="w-4 h-4 text-muted-foreground/50 hover:text-destructive" />
                  </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-center text-muted-foreground italic">সর্বশেষ ১০টি লেনদেন দেখানো হচ্ছে</p>
        </div>
      </div>
    </div>
  );
}
