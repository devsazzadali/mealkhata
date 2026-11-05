import { useQuery } from "@tanstack/react-query";
import { Wallet, ArrowDownCircle } from "lucide-react";
import { format } from "date-fns";
import { apiGet } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatBdt } from "@/lib/phone";

export default function MyDeposits() {
  const userId = useAuthStore((s) => s.user?.id);

  const { data, isLoading } = useQuery({
    queryKey: ["my-deposits", userId],
    enabled: !!userId,
    queryFn: async () => {
      const boarders = await apiGet<any[]>("boarders", { user_id: userId! });
      const boarder = boarders[0] ?? null;
      if (!boarder) return null;
      const rows = await apiGet<any[]>("deposits", { boarder_id: boarder.id, order: "deposit_date.desc" });
      const total = (rows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      return { rows: rows ?? [], total };
    },
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data) return <p className="text-muted-foreground">কোনো boarder profile পাওয়া যায়নি।</p>;

  return (
    <div className="space-y-5 animate-fade-in pb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">আমার ডিপোজিট</h1>
        <p className="text-sm text-muted-foreground mt-1">আপনার সব deposit এর ইতিহাস</p>
      </div>

      <div className="rounded-2xl border bg-card p-5 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-success/15 text-success flex items-center justify-center">
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">মোট ডিপোজিট (সব সময়)</p>
          <p className="text-2xl font-bold tabular-nums">{formatBdt(data.total)}</p>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <ArrowDownCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">এখনও কোনো deposit নেই।</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.rows.map((d: any) => (
            <div key={d.id} className="rounded-xl border bg-card p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 text-success flex items-center justify-center">
                <ArrowDownCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{format(new Date(d.deposit_date), "dd MMM yyyy")}</p>
                  <Badge variant="outline" className="text-[10px]">{d.method}</Badge>
                </div>
                {d.notes && <p className="text-xs text-muted-foreground truncate">{d.notes}</p>}
              </div>
              <p className="font-semibold tabular-nums text-success">+{formatBdt(Number(d.amount))}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
