import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Wallet, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { formatBdt } from "@/lib/phone";
import { currentPeriod, periodRange } from "@/lib/period";

const schema = z.object({
  boarder_id: z.string().min(1, "Boarder required"),
  amount: z.coerce.number().positive("Amount required"),
  method: z.enum(["cash", "bkash", "nagad", "bank"]),
  deposit_date: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
});
type FormVals = z.infer<typeof schema>;

const methodColors: Record<string, string> = {
  cash: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  bkash: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
  nagad: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  bank: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

export default function Deposits() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const roles = useAuthStore((s) => s.roles);
  // Server rule (api-server.ts): a read-only mess_monitor may not write this model.
  const readOnly = isMonitorOnly(roles);

  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { year, month } = currentPeriod();
  const { start, end } = periodRange(year, month);

  const { data: boarders } = useQuery({
    queryKey: ["boarders-light", messId],
    enabled: !!messId,
    queryFn: async () => {
      const all = await apiGet<any[]>("boarders", { mess_id: messId! });
      return all.filter((b) => b.status === "active").sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  const { data: deposits, isLoading } = useQuery({
    queryKey: ["deposits", messId, start, end],
    enabled: !!messId,
    queryFn: async () => {
      // Generic API returns plain rows (no boarders join) and no date-range
      // params, so filter by deposit_date and attach boarder names in JS.
      const [rows, allBoarders] = await Promise.all([
        apiGet<any[]>("deposits", { mess_id: messId!, order: "deposit_date.desc" }),
        apiGet<any[]>("boarders", { mess_id: messId! }),
      ]);
      const byId = new Map(allBoarders.map((b) => [b.id, b]));
      return rows
        .filter((d) => String(d.deposit_date) >= start && String(d.deposit_date) < end)
        .map((d) => ({ ...d, deposit_date: String(d.deposit_date).slice(0, 10), boarders: { full_name: byId.get(d.boarder_id)?.full_name } }));
    },
  });

  const total = (deposits ?? []).reduce((s, d: any) => s + Number(d.amount), 0);

  const form = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      boarder_id: "",
      amount: 0,
      method: "cash",
      deposit_date: new Date().toISOString().slice(0, 10),
      reference: "",
      notes: "",
    },
  });

  const onSubmit = async (vals: FormVals) => {
    if (!messId) return;
    try {
      await apiPost("deposits", {
        mess_id: messId,
        boarder_id: vals.boarder_id,
        amount: vals.amount,
        method: vals.method,
        deposit_date: vals.deposit_date,
        reference: vals.reference || null,
        notes: vals.notes || null,
        created_by: userId,
      });
    } catch (e: any) {
      toast.error(e.message);
      return;
    }
    toast.success("Deposit recorded");
    setOpen(false);
    form.reset({
      boarder_id: "",
      amount: 0,
      method: "cash",
      deposit_date: new Date().toISOString().slice(0, 10),
      reference: "",
      notes: "",
    });
    qc.invalidateQueries({ queryKey: ["deposits"] });
    qc.invalidateQueries({ queryKey: ["mess-dashboard", messId] });
    qc.invalidateQueries({ queryKey: ["month-stats"] });
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete("deposits", id);
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["deposits"] });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Deposits</h1>
          <p className="text-sm text-muted-foreground mt-1">This month: {formatBdt(total)}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          {!readOnly && (
          <DialogTrigger asChild>
            <Button className="shadow-glow"><Plus className="w-4 h-4 mr-1" /> Add</Button>
          </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader><DialogTitle>New Deposit</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField name="boarder_id" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Boarder</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select boarder" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(boarders ?? []).map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="amount" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Amount (BDT)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="method" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(["cash","bkash","nagad","bank"] as const).map((m) => (
                          <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField name="deposit_date" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
                <FormField name="reference" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Reference (TrxID)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField name="notes" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl></FormItem>
                )} />
                <DialogFooter>
                  <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : !deposits || deposits.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Wallet className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No deposits this month</p>
          <p className="text-sm text-muted-foreground mt-1">Record a deposit to track payments.</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          {deposits.map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-xl bg-success/15 text-success flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{d.boarders?.full_name ?? "—"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className={methodColors[d.method]}>
                    {d.method}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{d.deposit_date}</span>
                </div>
              </div>
              <p className="font-semibold tabular-nums">{formatBdt(Number(d.amount))}</p>
              {!readOnly && (
              <Button size="icon" variant="ghost" onClick={() => handleDelete(d.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
