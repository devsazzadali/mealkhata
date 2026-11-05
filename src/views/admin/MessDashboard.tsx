import { useQuery } from "@tanstack/react-query";
import { Users, Wallet, Receipt, AlertCircle, TrendingUp, UtensilsCrossed } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { StatCard } from "@/components/ui/stat-card";
import { formatBdt } from "@/lib/phone";
import { Skeleton } from "@/components/ui/skeleton";

export default function MessDashboard() {
  const messId = useAuthStore((s) => s.profile?.mess_id);

  const { data, isLoading } = useQuery({
    queryKey: ["mess-dashboard", messId],
    enabled: !!messId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const [boarders, allExpenses, statsArr, stocksRes, settingsArr] = await Promise.all([
        apiGet<any[]>("boarders", { mess_id: messId! }),
        apiGet<any[]>("expenses", { mess_id: messId! }),
        apiGet<any[]>("stats/month", { mess_id: messId!, year, month }),
        apiGet<any[]>("stocks", { mess_id: messId! }),
        apiGet<any[]>("mess-settings", { mess_id: messId! }),
      ]);

      // expenses: no date-equality filter issue in JS — filter today here
      // (the API only supports equality filters, so filter by date string).
      const expensesToday = allExpenses.filter(
        (e: any) => String(e.expense_date ?? "").slice(0, 10) === today
      );
      const active = (boarders ?? []).filter((b) => b.status === "active");
      const totalBalance = (boarders ?? []).reduce((s, b) => s + Number(b.balance), 0);
      const totalDue = (boarders ?? []).reduce(
        (s, b) => s + (Number(b.balance) < 0 ? -Number(b.balance) : 0),
        0
      );
      const todayExpense = (expensesToday ?? []).reduce((s, e) => s + Number(e.amount), 0);
      const stats = statsArr?.[0] ?? { total_meals: 0, total_expense: 0, total_deposit: 0, meal_rate: 0 };
      const lowBalThreshold = Number(settingsArr?.[0]?.low_balance_threshold ?? 100);
      const lowBalanceBoarders = active.filter((b) => Number(b.balance) < lowBalThreshold);
      const lowStockItems = (stocksRes ?? []).filter((s) => Number(s.quantity) <= Number(s.low_stock_threshold));

      return {
        totalBoarders: active.length,
        allBoarders: (boarders ?? []).length,
        totalBalance,
        totalDue,
        monthExpense: Number(stats.total_expense),
        todayExpense,
        monthDeposit: Number(stats.total_deposit),
        totalMeals: Number(stats.total_meals),
        mealRate: Number(stats.meal_rate),
        lowBalanceBoarders,
        lowStockItems,
      };
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">A quick look at your mess today</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {((data?.lowBalanceBoarders?.length ?? 0) > 0 || (data?.lowStockItems?.length ?? 0) > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              {(data?.lowBalanceBoarders?.length ?? 0) > 0 && (
                <div className="rounded-2xl border border-warning/50 bg-warning/10 p-4">
                  <div className="flex items-center gap-2 font-semibold text-warning-foreground">
                    <AlertCircle className="w-4 h-4 text-warning" /> Low Balance Boarders
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    {data!.lowBalanceBoarders!.slice(0, 5).map((b: any) => (
                      <div key={b.id} className="flex justify-between">
                        <span>{b.full_name}</span>
                        <span className="font-mono">{formatBdt(b.balance)}</span>
                      </div>
                    ))}
                    {data!.lowBalanceBoarders!.length > 5 && (
                      <p className="text-xs text-muted-foreground">+{data!.lowBalanceBoarders!.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}
              {(data?.lowStockItems?.length ?? 0) > 0 && (
                <div className="rounded-2xl border border-warning/50 bg-warning/10 p-4">
                  <div className="flex items-center gap-2 font-semibold text-warning-foreground">
                    <AlertCircle className="w-4 h-4 text-warning" /> Low Stock Items
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    {data!.lowStockItems!.slice(0, 5).map((s: any) => (
                      <div key={s.id} className="flex justify-between">
                        <span>{s.name}</span>
                        <span className="font-mono">{Number(s.quantity)} {s.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Active Boarders" value={String(data?.totalBoarders ?? 0)} hint={`${data?.allBoarders ?? 0} total`} icon={Users} tone="primary" />
            <StatCard label="Total Balance" value={formatBdt(data?.totalBalance ?? 0)} icon={Wallet} tone="success" />
            <StatCard label="Total Due" value={formatBdt(data?.totalDue ?? 0)} icon={AlertCircle} tone="destructive" />
            <StatCard label="This Month Expense" value={formatBdt(data?.monthExpense ?? 0)} icon={Receipt} tone="warning" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Today Expense" value={formatBdt(data?.todayExpense ?? 0)} icon={Receipt} />
            <StatCard label="Monthly Deposit" value={formatBdt(data?.monthDeposit ?? 0)} icon={TrendingUp} tone="success" />
            <StatCard label="Total Meals (month)" value={String(data?.totalMeals ?? 0)} icon={UtensilsCrossed} />
            <StatCard label="Per Meal Cost" value={formatBdt(data?.mealRate ?? 0)} hint="live" icon={UtensilsCrossed} tone="primary" />
          </div>
        </>
      )}
    </div>
  );
}
