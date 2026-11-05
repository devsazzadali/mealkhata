import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Sparkles, Printer } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMessAdmin, canManageMoney } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBdt } from "@/lib/phone";
import { currentPeriod, periodLabel } from "@/lib/period";

const monthsList = Array.from({ length: 12 }, (_, i) => i + 1);
const yearsList = (() => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1];
})();

export default function MonthlyBills() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const qc = useQueryClient();
  const cur = currentPeriod();
  const [year, setYear] = useState(cur.year);
  const [month, setMonth] = useState(cur.month);
  const [generating, setGenerating] = useState(false);

  const roles = useAuthStore((s) => s.roles);
  // Server rules (do not weaken): generate-bills requires mess_admin,
  // monthly-bills PATCH requires edit_money or close_month.
  const canGenerate = isMessAdmin(roles);
  const canMarkPaid = canManageMoney(roles);
  const { data: bills, isLoading } = useQuery({
    queryKey: ["monthly_bills", messId, year, month],
    enabled: !!messId,
    queryFn: async () => {
      // No join in the Prisma API: fetch boarders and attach them in JS.
      const [bills, boarders] = await Promise.all([
        apiGet<any[]>("monthly-bills", { mess_id: messId!, year, month, order: "created_at.asc" }),
        apiGet<any[]>("boarders", { mess_id: messId! }),
      ]);
      const byId = new Map(boarders.map((b: any) => [b.id, b]));
      return bills.map((b: any) => {
        const br = byId.get(b.boarder_id) as any;
        return { ...b, boarders: br ? { full_name: br.full_name, phone: br.phone } : undefined };
      });
    },
  });

  const generate = async () => {
    if (!messId) return;
    setGenerating(true);
    try {
      const res = await apiPost<{ count: number }>("stats/generate-bills", {
        mess_id: messId, year, month,
      });
      toast.success(`${res.count} bills generated`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
    qc.invalidateQueries({ queryKey: ["monthly_bills"] });
  };

  const markPaid = async (id: string, payable: number) => {
    try {
      await apiPatch("monthly-bills", id, { paid: payable, status: "paid" });
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success("Marked paid");
    qc.invalidateQueries({ queryKey: ["monthly_bills"] });
  };

  const totalPayable = (bills ?? []).reduce((s, b: any) => s + Number(b.payable), 0);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Monthly Bills</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {periodLabel(year, month)} · মোট bill: <span className="font-semibold text-foreground">{formatBdt(totalPayable)}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthsList.map((m) => (
                <SelectItem key={m} value={String(m)}>{periodLabel(2024, m).split(" ")[0]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearsList.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {canGenerate && (
          <Button onClick={generate} disabled={generating} className="gap-2 shadow-glow">
            <Sparkles className="w-4 h-4" /> {generating ? "Generating..." : "Generate"}
          </Button>
          )}
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : !bills || bills.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">এই মাসের bill এখনো generate হয়নি</p>
          {canGenerate && <p className="text-sm text-muted-foreground mt-1">"Generate" button চাপুন।</p>}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {bills.map((b: any) => (
            <div key={b.id} className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{b.boarders?.full_name}</h3>
                  <p className="text-xs text-muted-foreground">{b.boarders?.phone}</p>
                </div>
                <Badge variant={b.status === "paid" ? "default" : "outline"}>
                  {b.status === "paid" ? "Paid" : "Unpaid"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Meals</span><span className="tabular-nums">{Number(b.total_meals).toFixed(1)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span className="tabular-nums">{formatBdt(Number(b.meal_rate))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Meal Cost</span><span className="tabular-nums">{formatBdt(Number(b.meal_cost))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Extra Share</span><span className="tabular-nums">{formatBdt(Number(b.extra_share))}</span></div>
                {b.details?.fixed_breakdown && Object.entries(b.details.fixed_breakdown).map(([k, v]) => (
                  <div key={k} className="flex justify-between pl-3"><span className="text-muted-foreground text-xs">· {k}</span><span className="tabular-nums text-xs">{formatBdt(Number(v))}</span></div>
                ))}
                <div className="flex justify-between"><span className="text-muted-foreground">Deposit</span><span className="tabular-nums text-success">{formatBdt(Number(b.total_deposit))}</span></div>
              </div>
              <div className="border-t pt-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Payable</span>
                <span className={`font-bold text-lg tabular-nums ${Number(b.payable) > 0 ? "text-destructive" : "text-success"}`}>
                  {formatBdt(Number(b.payable))}
                </span>
              </div>
              {canMarkPaid && b.status !== "paid" && Number(b.payable) > 0 && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => markPaid(b.id, Number(b.payable))}>
                  Mark Paid
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
