import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Receipt } from "lucide-react";
import { format } from "date-fns";
import { apiGet } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBdt } from "@/lib/phone";

export default function MyExpenses() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["mess-expenses", messId, start],
    enabled: !!messId,
    queryFn: async () => {
      // apiGet has no gte filter and no join: fetch expenses + categories,
      // filter to this month and attach the category in JS.
      const [allRows, cats] = await Promise.all([
        apiGet<any[]>("expenses", { mess_id: messId!, order: "expense_date.desc" }),
        apiGet<any[]>("expense-categories"),
      ]);
      const catById: Record<string, any> = {};
      for (const c of cats ?? []) catById[c.id] = c;
      const rows = (allRows ?? [])
        .filter((r) => String(r.expense_date).slice(0, 10) >= start)
        .map((r) => ({ ...r, expense_categories: r.category_id ? catById[r.category_id] ?? null : null }));
      const total = (rows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      return { rows: rows ?? [], total };
    },
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-5 animate-fade-in pb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">মেসের খরচ</h1>
        <p className="text-sm text-muted-foreground mt-1">এই মাসে সবার বাজার ও খরচ (transparency)</p>
      </div>

      <div className="rounded-2xl border bg-card p-5 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-warning/15 text-warning flex items-center justify-center">
          <ShoppingCart className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">এই মাসের মোট খরচ</p>
          <p className="text-2xl font-bold tabular-nums">{formatBdt(data?.total ?? 0)}</p>
        </div>
      </div>

      {data?.rows.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <Receipt className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">এই মাসে কোনো খরচ যোগ হয়নি।</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data?.rows.map((e: any) => (
            <div key={e.id} className="rounded-xl border bg-card p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-lg">
                {e.expense_categories?.icon ?? "🛒"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{e.description ?? e.expense_categories?.name ?? "খরচ"}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(e.expense_date), "dd MMM yyyy")}</p>
              </div>
              <p className="font-semibold tabular-nums">{formatBdt(Number(e.amount))}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
