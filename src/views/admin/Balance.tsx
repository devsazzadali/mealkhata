import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, RefreshCcw, TrendingUp, TrendingDown, Calculator } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMessAdmin } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatBdt } from "@/lib/phone";
import { currentPeriod, periodLabel } from "@/lib/period";

export default function Balance() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const roles = useAuthStore((s) => s.roles);
  // Server rule (stats/close-month): mess_admin / super_admin only.
  const canCloseMonth = isMessAdmin(roles);
  const qc = useQueryClient();
  const { year, month } = currentPeriod();
  const [closing, setClosing] = useState(false);

  // Live month stats via DB function
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["month-stats", messId, year, month],
    enabled: !!messId,
    queryFn: async () => {
      const data = await apiGet<any[]>("stats/month", { mess_id: messId!, year, month });
      return data?.[0] ?? { total_meals: 0, total_expense: 0, total_deposit: 0, meal_rate: 0 };
    },
  });

  // Per-boarder live summary
  const { data: rows, isLoading: loadingRows } = useQuery({
    queryKey: ["boarder-month", messId, year, month],
    enabled: !!messId,
    queryFn: async () => {
      return apiGet<any[]>("stats/boarder-summary", { mess_id: messId!, year, month });
    },
  });

  // Closed periods history
  const { data: periods } = useQuery({
    queryKey: ["periods", messId],
    enabled: !!messId,
    queryFn: async () => {
      // API supports one order key: order by year, then sort month in JS
      // (original: year desc, month desc).
      const rows = await apiGet<any[]>("monthly-periods", { mess_id: messId!, order: "year.desc" });
      return [...rows].sort((a: any, b: any) => b.year - a.year || b.month - a.month);
    },
  });

  const currentClosed = periods?.find((p) => p.year === year && p.month === month && p.status === "closed");

  const rate = Number(stats?.meal_rate ?? 0);

  const handleClose = async () => {
    if (!messId) return;
    setClosing(true);
    try {
      await apiPost("stats/close-month", { mess_id: messId, year, month });
    } catch (e: any) {
      setClosing(false);
      return toast.error(e.message);
    }
    setClosing(false);
    toast.success(`${periodLabel(year, month)} closed. Boarder balances updated.`);
    qc.invalidateQueries({ queryKey: ["periods"] });
    qc.invalidateQueries({ queryKey: ["boarders"] });
    qc.invalidateQueries({ queryKey: ["mess-dashboard", messId] });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Balance & Meal Rate</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live preview for <span className="font-medium">{periodLabel(year, month)}</span>
            {currentClosed && (
              <Badge variant="secondary" className="ml-2 bg-success/15 text-success">Closed</Badge>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["month-stats"] });
              qc.invalidateQueries({ queryKey: ["boarder-month"] });
            }}
          >
            <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          {canCloseMonth && !currentClosed && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="shadow-glow">
                  <Lock className="w-4 h-4 mr-1" /> Close Month
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close {periodLabel(year, month)}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This locks the meal rate at <span className="font-semibold">{formatBdt(rate)}/meal</span> and
                    applies (deposits − meals × rate) to every active boarder's running balance. You can still add
                    data later, but balances won't auto-update.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClose} disabled={closing}>
                    {closing ? "Closing…" : "Yes, close month"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Top stats */}
      {loadingStats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Total Meals" value={String(Number(stats?.total_meals ?? 0))} icon={Calculator} tone="primary" />
          <StatCard label="Total Expense" value={formatBdt(Number(stats?.total_expense ?? 0))} icon={TrendingDown} tone="warning" />
          <StatCard label="Total Deposit" value={formatBdt(Number(stats?.total_deposit ?? 0))} icon={TrendingUp} tone="success" />
          <StatCard label="Meal Rate (live)" value={formatBdt(rate)} hint="per meal" icon={Calculator} tone="primary" />
        </div>
      )}

      {/* Per-boarder */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <h2 className="font-semibold text-sm">Per-Boarder Live Preview</h2>
          <p className="text-xs text-muted-foreground">Net = Deposits − (Meals × Rate). Applied on close.</p>
        </div>
        {loadingRows ? (
          <Skeleton className="h-48" />
        ) : !rows || rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No active boarders.</p>
        ) : (
          <div className="divide-y">
            <div className="hidden md:grid grid-cols-[1.5fr,90px,120px,120px,120px] gap-2 px-4 py-2 text-xs uppercase font-semibold text-muted-foreground">
              <div>Boarder</div>
              <div className="text-right">Meals</div>
              <div className="text-right">Meal Cost</div>
              <div className="text-right">Deposits</div>
              <div className="text-right">Net</div>
            </div>
            {rows.map((r: any) => {
              const meals = Number(r.meals);
              const dep = Number(r.deposits);
              const cost = meals * rate;
              const net = dep - cost;
              return (
                <div key={r.boarder_id} className="grid grid-cols-[1.5fr,1fr] md:grid-cols-[1.5fr,90px,120px,120px,120px] gap-2 px-4 py-3 items-center text-sm">
                  <div className="font-medium truncate">{r.full_name}</div>
                  <div className="md:hidden text-right">
                    <div className={"font-semibold tabular-nums " + (net < 0 ? "text-destructive" : "text-success")}>
                      {formatBdt(net)}
                    </div>
                    <div className="text-xs text-muted-foreground">{meals} meals · {formatBdt(dep)} dep</div>
                  </div>
                  <div className="hidden md:block text-right tabular-nums">{meals}</div>
                  <div className="hidden md:block text-right tabular-nums">{formatBdt(cost)}</div>
                  <div className="hidden md:block text-right tabular-nums">{formatBdt(dep)}</div>
                  <div className={"hidden md:block text-right font-semibold tabular-nums " + (net < 0 ? "text-destructive" : "text-success")}>
                    {formatBdt(net)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Closed history */}
      {periods && periods.length > 0 && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h2 className="font-semibold text-sm">Period History</h2>
          </div>
          <div className="divide-y">
            {periods.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{periodLabel(p.year, p.month)}</p>
                  <p className="text-xs text-muted-foreground">
                    {Number(p.total_meals)} meals · {formatBdt(Number(p.total_expense))} exp · {formatBdt(Number(p.total_deposit))} dep
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatBdt(Number(p.meal_rate))}</p>
                  <Badge variant="secondary" className={p.status === "closed" ? "bg-success/15 text-success" : ""}>
                    {p.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
