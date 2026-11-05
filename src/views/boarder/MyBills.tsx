import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Receipt, TrendingUp, Calendar } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatBdt } from "@/lib/phone";

export default function MyBills() {
  const userId = useAuthStore((s) => s.user?.id);
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["my-bills", userId],
    enabled: !!userId,
    queryFn: async () => {
      const boarders = await apiGet<any[]>("boarders", { user_id: userId! });
      const boarder = boarders[0] ?? null;
      if (!boarder) return null;

      const billRows = await apiGet<any[]>("monthly-bills", { boarder_id: boarder.id, order: "year.desc" });
      // apiGet supports only one order key: sort year desc, month desc in JS.
      const bills = (billRows ?? []).sort((a, b) => b.year - a.year || b.month - a.month);

      const stats = await apiGet<any[]>("stats/month", { mess_id: boarder.mess_id, year, month });

      return { boarder, bills, liveRate: Number(stats?.[0]?.meal_rate ?? 0) };
    },
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data) return <p className="text-muted-foreground">কোনো boarder profile পাওয়া যায়নি।</p>;

  const months = [
    "জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন",
    "জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর",
  ];

  return (
    <div className="space-y-5 animate-fade-in pb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">আমার বিল</h1>
        <p className="text-sm text-muted-foreground mt-1">প্রতি মাসের meal cost ও payable</p>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">এই মাসের live মিল রেট</p>
            <p className="text-2xl font-bold tabular-nums">{formatBdt(data.liveRate)} <span className="text-sm font-normal text-muted-foreground">/ meal</span></p>
          </div>
        </div>
      </div>

      {data.bills.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <Receipt className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">এখনও কোনো monthly bill তৈরি হয়নি।</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.bills.map((b: any) => (
            <div key={b.id} className="rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{months[b.month - 1]} {b.year}</p>
                    <p className="text-xs text-muted-foreground">{b.total_meals} meals · {formatBdt(Number(b.meal_rate))}/meal</p>
                  </div>
                </div>
                <Badge variant={b.status === "paid" ? "secondary" : "outline"}
                       className={b.status === "paid" ? "bg-success/15 text-success border-success/30" : "border-warning/40 text-warning"}>
                  {b.status === "paid" ? "Paid" : b.status === "partial" ? "Partial" : "Unpaid"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                <Stat label="Meal cost" value={formatBdt(Number(b.meal_cost))} />
                <Stat label="Extra share" value={formatBdt(Number(b.extra_share))} />
                <Stat label="Deposit" value={formatBdt(Number(b.total_deposit))} positive />
                <Stat label="Payable" value={formatBdt(Number(b.payable))}
                      negative={Number(b.payable) > 0} positive={Number(b.payable) <= 0} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums mt-0.5 ${positive ? "text-success" : negative ? "text-destructive" : ""}`}>
        {value}
      </p>
    </div>
  );
}
