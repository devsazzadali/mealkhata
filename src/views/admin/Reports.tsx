import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Calendar } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBdt } from "@/lib/phone";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend,
} from "recharts";

type Range = "daily" | "weekly" | "monthly";

function getRange(kind: Range) {
  const today = new Date();
  const start = new Date(today);
  if (kind === "daily") start.setDate(today.getDate() - 6);
  else if (kind === "weekly") start.setDate(today.getDate() - 7 * 7);
  else start.setMonth(today.getMonth() - 5);
  start.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setDate(end.getDate() + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function bucket(date: string, kind: Range) {
  const d = new Date(date);
  if (kind === "daily") return d.toISOString().slice(5, 10); // MM-DD
  if (kind === "weekly") {
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
    return `W${week}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function Reports() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const [tab, setTab] = useState<Range>("daily");
  const range = useMemo(() => getRange(tab), [tab]);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", messId, tab],
    enabled: !!messId,
    queryFn: async () => {
      // API has no gte/lt filters: fetch the mess's lists and filter the
      // date range in JS (original: start <= date < end).
      const inRange = (d: any) => {
        const v = String(d ?? "").slice(0, 10);
        return v >= range.start && v < range.end;
      };
      const [meals, exp, dep, extras] = await Promise.all([
        apiGet<any[]>("meal-entries", { mess_id: messId! }),
        apiGet<any[]>("expenses", { mess_id: messId! }),
        apiGet<any[]>("deposits", { mess_id: messId! }),
        apiGet<any[]>("extra-bills", { mess_id: messId! }),
      ]);
      return {
        meals: meals.filter((m: any) => inRange(m.meal_date)),
        expenses: exp.filter((e: any) => inRange(e.expense_date)),
        deposits: dep.filter((d: any) => inRange(d.deposit_date)),
        extras: extras.filter((e: any) => inRange(e.bill_date)),
      };
    },
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, any>();
    const get = (k: string) => {
      if (!map.has(k)) map.set(k, { label: k, meals: 0, expense: 0, deposit: 0, extra: 0 });
      return map.get(k);
    };
    data.meals.forEach((m: any) => {
      const o = get(bucket(m.meal_date, tab));
      o.meals += Number(m.breakfast) + Number(m.lunch) + Number(m.dinner);
    });
    data.expenses.forEach((e: any) => { get(bucket(e.expense_date, tab)).expense += Number(e.amount); });
    data.deposits.forEach((d: any) => { get(bucket(d.deposit_date, tab)).deposit += Number(d.amount); });
    data.extras.forEach((e: any) => { get(bucket(e.bill_date, tab)).extra += Number(e.amount); });
    return Array.from(map.values());
  }, [data, tab]);

  const totals = useMemo(() => {
    if (!data) return { meals: 0, expense: 0, deposit: 0, extra: 0 };
    return {
      meals: data.meals.reduce((s: number, m: any) => s + Number(m.breakfast) + Number(m.lunch) + Number(m.dinner), 0),
      expense: data.expenses.reduce((s: number, e: any) => s + Number(e.amount), 0),
      deposit: data.deposits.reduce((s: number, d: any) => s + Number(d.amount), 0),
      extra: data.extras.reduce((s: number, e: any) => s + Number(e.amount), 0),
    };
  }, [data]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Daily, weekly, monthly summaries</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Range)}>
        <TabsList>
          <TabsTrigger value="daily">Daily (7d)</TabsTrigger>
          <TabsTrigger value="weekly">Weekly (7w)</TabsTrigger>
          <TabsTrigger value="monthly">Monthly (6m)</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox label="Meals" value={totals.meals.toFixed(1)} />
            <StatBox label="Expenses" value={formatBdt(totals.expense)} />
            <StatBox label="Extra Bills" value={formatBdt(totals.extra)} />
            <StatBox label="Deposits" value={formatBdt(totals.deposit)} />
          </div>

          {isLoading ? (
            <Skeleton className="h-80 rounded-2xl" />
          ) : (
            <>
              <div className="rounded-2xl border bg-card p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Money Flow</h3>
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="expense" fill="hsl(var(--destructive))" name="Expense" />
                      <Bar dataKey="extra" fill="hsl(var(--warning))" name="Extra" />
                      <Bar dataKey="deposit" fill="hsl(var(--success))" name="Deposit" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4" /> Meal Trend</h3>
                <div className="h-64">
                  <ResponsiveContainer>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="meals" stroke="hsl(var(--primary))" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1">{value}</p>
    </div>
  );
}
