import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Trash2 } from "lucide-react";
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
  amount: z.coerce.number().positive("Amount required"),
  category_id: z.string().optional(),
  expense_date: z.string().min(1),
  description: z.string().max(500).optional(),
});
type FormVals = z.infer<typeof schema>;

export default function Expenses() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const roles = useAuthStore((s) => s.roles);
  // Server rule (api-server.ts): a read-only mess_monitor may not write this model.
  const readOnly = isMonitorOnly(roles);

  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { year, month } = currentPeriod();
  const { start, end } = periodRange(year, month);

  const { data: cats } = useQuery({
    queryKey: ["expense-cats", messId],
    enabled: !!messId,
    queryFn: async () => {
      // Original .or(is_default, mess_id) cannot be expressed via apiGet,
      // so fetch all categories and filter in JS.
      const all = await apiGet<any[]>("expense-categories", { order: "name.asc" });
      return all.filter((c) => c.is_default || c.mess_id === messId);
    },
  });

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses", messId, start, end],
    enabled: !!messId,
    queryFn: async () => {
      // Generic API returns plain rows (no expense_categories join) and no
      // date-range params, so filter by expense_date and attach categories in JS.
      const [rows, allCats] = await Promise.all([
        apiGet<any[]>("expenses", { mess_id: messId!, order: "expense_date.desc" }),
        apiGet<any[]>("expense-categories", { order: "name.asc" }),
      ]);
      const byId = new Map(allCats.map((c) => [c.id, c]));
      return rows
        .filter((e) => String(e.expense_date) >= start && String(e.expense_date) < end)
        .map((e) => ({
          ...e,
          expense_date: String(e.expense_date).slice(0, 10),
          expense_categories: e.category_id ? { name: byId.get(e.category_id)?.name, icon: byId.get(e.category_id)?.icon } : null,
        }));
    },
  });

  const total = (expenses ?? []).reduce((s, e: any) => s + Number(e.amount), 0);

  const form = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: { amount: 0, expense_date: new Date().toISOString().slice(0, 10), description: "" },
  });

  const onSubmit = async (vals: FormVals) => {
    if (!messId) return;
    try {
      await apiPost("expenses", {
        mess_id: messId,
        amount: vals.amount,
        category_id: vals.category_id || null,
        expense_date: vals.expense_date,
        description: vals.description || null,
        created_by: userId,
      });
    } catch (e: any) {
      toast.error(e.message);
      return;
    }
    toast.success("Expense added");
    setOpen(false);
    form.reset({ amount: 0, expense_date: new Date().toISOString().slice(0, 10), description: "" });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["mess-dashboard", messId] });
    qc.invalidateQueries({ queryKey: ["month-stats"] });
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete("expenses", id);
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["mess-dashboard", messId] });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">This month: {formatBdt(total)}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          {!readOnly && (
          <DialogTrigger asChild>
            <Button className="shadow-glow">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Expense</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField name="amount" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (BDT)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="category_id" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(cats ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField name="expense_date" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="description" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl></FormItem>
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
      ) : !expenses || expenses.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Receipt className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No expenses this month</p>
          <p className="text-sm text-muted-foreground mt-1">Tap Add to record your first one.</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          {expenses.map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-lg">
                {e.expense_categories?.icon ?? "💸"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{e.expense_categories?.name ?? "Other"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {e.expense_date} {e.description ? `· ${e.description}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatBdt(Number(e.amount))}</p>
              </div>
              {!readOnly && (
              <Button size="icon" variant="ghost" onClick={() => handleDelete(e.id)}>
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
