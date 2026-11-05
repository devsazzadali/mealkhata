import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Coffee, Sun, Moon, Users, X, Plus, Minus, CalendarDays, UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { canEditMeals } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Row = {
  boarder_id: string;
  full_name: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  guest: number;
  entry_id?: string;
};

const fmt = (d: Date) => d.toISOString().slice(0, 10);

export default function Meals() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const roles = useAuthStore((s) => s.roles);
  const canEdit = canEditMeals(roles);
  const qc = useQueryClient();

  const [date, setDate] = useState(fmt(new Date()));
  const [draft, setDraft] = useState<Record<string, Row>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["meals", messId, date],
    enabled: !!messId,
    queryFn: async () => {
      const [boardersRes, entriesRes] = await Promise.all([
        apiGet<any[]>("boarders", { mess_id: messId!, status: "active", order: "full_name.asc" }),
        apiGet<any[]>("meal-entries", { mess_id: messId!, meal_date: date }),
      ]);

      const byBoarder = new Map(entriesRes.map((e: any) => [e.boarder_id, e]));
      const rows: Record<string, Row> = {};
      for (const b of boardersRes ?? []) {
        const e: any = byBoarder.get(b.id);
        rows[b.id] = {
          boarder_id: b.id,
          full_name: b.full_name,
          breakfast: Number(e?.breakfast ?? 0),
          lunch: Number(e?.lunch ?? 0),
          dinner: Number(e?.dinner ?? 0),
          guest: Number(e?.guest ?? 0),
          entry_id: e?.id,
        };
      }
      return rows;
    },
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const totals = useMemo(() => {
    const list = Object.values(draft);
    return list.reduce(
      (a, r) => ({
        b: a.b + (r.breakfast > 0 ? 1 : 0),
        l: a.l + (r.lunch > 0 ? 1 : 0),
        d: a.d + (r.dinner > 0 ? 1 : 0),
        g: a.g + r.guest,
        absent: a.absent + (r.breakfast === 0 && r.lunch === 0 && r.dinner === 0 ? 1 : 0),
      }),
      { b: 0, l: 0, d: 0, g: 0, absent: 0 }
    );
  }, [draft]);

  const dialogTotals = useMemo(() => {
    const list = Object.values(draft);
    return list.reduce(
      (a, r) => ({
        b: a.b + r.breakfast,
        l: a.l + r.lunch,
        d: a.d + r.dinner,
        g: a.g + r.guest,
      }),
      { b: 0, l: 0, d: 0, g: 0 }
    );
  }, [draft]);

  const toggleMeal = (id: string, key: "breakfast" | "lunch" | "dinner") => {
    setDraft((d) => ({
      ...d,
      [id]: { ...d[id], [key]: d[id][key] > 0 ? 0 : 1 },
    }));
  };

  const setGuest = (id: string, v: number) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id], guest: Math.max(0, v) } }));
  };

  const setAll = (key: "breakfast" | "lunch" | "dinner", v: 0 | 1) => {
    setDraft((d) => {
      const next: Record<string, Row> = {};
      for (const id of Object.keys(d)) next[id] = { ...d[id], [key]: v };
      return next;
    });
  };

  const allOn = (key: "breakfast" | "lunch" | "dinner") =>
    Object.values(draft).length > 0 && Object.values(draft).every((r) => r[key] > 0);

  const saveAll = async () => {
    if (!canEdit) return toast.error("Only meal_manager / mess_admin can edit meals");
    if (!messId) return;
    setSaving(true);
    const rows = Object.values(draft);

    try {
      // 1. Fetch rice settings
      const settings = (await apiGet<any[]>("mess-settings", { mess_id: messId }))[0] ?? null;
      let rice = { breakfast: 0, lunch: 0, dinner: 0 };
      if (settings?.bank_info && settings.bank_info.startsWith("{")) {
        const parsed = JSON.parse(settings.bank_info);
        if (parsed.rice) {
          rice.breakfast = Number(parsed.rice.breakfast) || 0;
          rice.lunch = Number(parsed.rice.lunch) || 0;
          rice.dinner = Number(parsed.rice.dinner) || 0;
        }
      }

      // 2+3. Per-row upsert on (boarder_id, meal_date) — the API has no
      // bulk delete/insert, so: GET existing by boarder_id+meal_date,
      // PATCH if it exists, POST if not, DELETE it if the row is now zero.
      // Final state is identical to the old delete-then-insert.
      const nonZero = rows.filter((r) => r.breakfast || r.lunch || r.dinner || r.guest);
      for (const r of rows) {
        const body = {
          mess_id: messId,
          boarder_id: r.boarder_id,
          meal_date: date,
          breakfast: r.breakfast,
          lunch: r.lunch,
          dinner: r.dinner,
          guest: r.guest,
        };
        const existing = (await apiGet<any[]>("meal-entries", {
          boarder_id: r.boarder_id, meal_date: date,
        }))[0];
        if (r.breakfast || r.lunch || r.dinner || r.guest) {
          if (existing) await apiPatch("meal-entries", existing.id, body);
          else await apiPost("meal-entries", body);
        } else if (existing) {
          await apiDelete("meal-entries", existing.id);
        }
      }

      if (nonZero.length > 0) {
        // 4. Update Boarder Rice Balances (Deduction)
        // Note: For simplicity, we calculate the daily consumption here. 
        // In a real system, you might want to handle 'updates' by comparing with old values.
        // For now, since we delete and re-insert, we'll need to be careful if we run this multiple times for the same day.
        // The user specifically asked for "automatic deduction".
        const allBoarders = await apiGet<any[]>("boarders", { mess_id: messId });
        const riceBalById = new Map(allBoarders.map((b: any) => [b.id, Number(b.rice_balance || 0)]));
        for (const r of rows) {
          const totalRice = (r.breakfast * rice.breakfast) + (r.lunch * rice.lunch) + (r.dinner * rice.dinner);
          if (totalRice > 0) {
            const currentBal = riceBalById.get(r.boarder_id) ?? 0;
            await apiPatch("boarders", r.boarder_id, { rice_balance: currentBal - totalRice });
            riceBalById.set(r.boarder_id, currentBal - totalRice);

            // Log transaction
            await apiPost("stock-transactions", {
              mess_id: messId,
              notes: `Meal deduction for ${date} (${totalRice}g)`,
              txn_type: "out",
              quantity: totalRice / 1000, // convert gram to kg if units are in kg
              // We'll link to rice stock if it exists, otherwise just a notes log
            });
          }
        }
      }

      toast.success("মিল এন্ট্রি এবং চাউলের হিসাব আপডেট হয়েছে");
      qc.invalidateQueries({ queryKey: ["meals", messId, date] });
      qc.invalidateQueries({ queryKey: ["mess-dashboard", messId] });
      qc.invalidateQueries({ queryKey: ["boarders"] });
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">মিল ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground mt-1">দৈনিক মিল এন্ট্রি ও ট্র্যাকিং সিস্টেম</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} disabled={!canEdit} className="gap-2">
          <Plus className="w-4 h-4" /> মিল এন্ট্রি করুন
        </Button>
      </div>

      {/* Status tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile color="primary" icon={<Coffee className="w-5 h-5" />} label="সকালের নাশতা" value={totals.b} />
        <StatTile color="primary" icon={<Sun className="w-5 h-5" />} label="দুপুরের খাবার" value={totals.l} />
        <StatTile color="primary" icon={<Moon className="w-5 h-5" />} label="রাতের খাবার" value={totals.d} />
        <StatTile color="primary" icon={<Users className="w-5 h-5" />} label="অতিথি মিল" value={totals.g} />
        <StatTile color="destructive" icon={<X className="w-5 h-5" />} label="অনুপস্থিত" value={totals.absent} />
      </div>

      {/* Today list summary */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" /> আজকের মিল স্ট্যাটাস
            </h2>
            <p className="text-xs text-muted-foreground">{date} - সদস্যদের মিলের বিস্তারিত</p>
          </div>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[160px]"
          />
        </div>

        {isLoading ? (
          <Skeleton className="h-40 m-4" />
        ) : Object.keys(draft).length === 0 ? (
          <EmptyBoarders />
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[1.5fr,80px,80px,80px,80px,1fr] gap-2 px-4 py-3 text-xs font-semibold text-muted-foreground border-b bg-muted/30">
              <div>সদস্য</div>
              <div className="text-center">নাশতা</div>
              <div className="text-center">দুপুর</div>
              <div className="text-center">রাত</div>
              <div className="text-center">অতিথি</div>
              <div className="text-center">স্ট্যাটাস</div>
            </div>
            <div className="divide-y">
              {Object.values(draft).map((r) => {
                const absent = !r.breakfast && !r.lunch && !r.dinner;
                return (
                  <div
                    key={r.boarder_id}
                    className="grid grid-cols-[1.5fr,1fr] md:grid-cols-[1.5fr,80px,80px,80px,80px,1fr] gap-2 px-4 py-3 items-center text-sm"
                  >
                    <div className="font-medium truncate">{r.full_name}</div>
                    <Cell value={r.breakfast > 0} />
                    <Cell value={r.lunch > 0} />
                    <Cell value={r.dinner > 0} />
                    <div className="hidden md:block text-center tabular-nums">{r.guest}</div>
                    <div className="text-center text-xs">
                      {absent ? (
                        <span className="text-destructive font-medium">অনুপস্থিত</span>
                      ) : (
                        <span className="text-primary font-medium">উপস্থিত</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" /> দৈনিক মিল এন্ট্রি
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{date} তারিখের মিল এন্ট্রি করুন</p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>তারিখ নির্বাচন করুন</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {/* Quick totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MiniTile color="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" icon={<Coffee className="w-4 h-4" />} label="নাশতা" value={dialogTotals.b} />
              <MiniTile color="bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200" icon={<Sun className="w-4 h-4" />} label="দুপুরের খাবার" value={dialogTotals.l} />
              <MiniTile color="bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200" icon={<Moon className="w-4 h-4" />} label="রাতের খাবার" value={dialogTotals.d} />
              <MiniTile color="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" icon={<Users className="w-4 h-4" />} label="গেস্ট" value={dialogTotals.g} />
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-sm">সদস্যদের মিল এন্ট্রি</p>
              <div className="flex flex-wrap gap-2">
                <BulkBtn active={allOn("breakfast")} onClick={() => setAll("breakfast", allOn("breakfast") ? 0 : 1)} icon={<Coffee className="w-3.5 h-3.5" />}>
                  সবার নাশতা
                </BulkBtn>
                <BulkBtn active={allOn("lunch")} onClick={() => setAll("lunch", allOn("lunch") ? 0 : 1)} icon={<Sun className="w-3.5 h-3.5" />}>
                  সবার দুপুর
                </BulkBtn>
                <BulkBtn active={allOn("dinner")} onClick={() => setAll("dinner", allOn("dinner") ? 0 : 1)} icon={<Moon className="w-3.5 h-3.5" />}>
                  সবার রাত
                </BulkBtn>
              </div>
            </div>

            {isLoading ? (
              <Skeleton className="h-32" />
            ) : Object.keys(draft).length === 0 ? (
              <EmptyBoarders />
            ) : (
              <div className="divide-y border rounded-xl">
                {Object.values(draft).map((r) => (
                  <div
                    key={r.boarder_id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                        {r.full_name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium truncate">{r.full_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ToggleIcon active={r.breakfast > 0} onClick={() => toggleMeal(r.boarder_id, "breakfast")} colorClass="bg-amber-400 text-amber-950" title="নাশতা">
                        <Coffee className="w-4 h-4" />
                      </ToggleIcon>
                      <ToggleIcon active={r.lunch > 0} onClick={() => toggleMeal(r.boarder_id, "lunch")} colorClass="bg-sky-400 text-sky-950" title="দুপুর">
                        <Sun className="w-4 h-4" />
                      </ToggleIcon>
                      <ToggleIcon active={r.dinner > 0} onClick={() => toggleMeal(r.boarder_id, "dinner")} colorClass="bg-violet-400 text-violet-950" title="রাত">
                        <Moon className="w-4 h-4" />
                      </ToggleIcon>
                      <div className="flex items-center gap-1 ml-2 border rounded-lg pl-2">
                        <span className="text-xs text-muted-foreground">গেস্ট:</span>
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setGuest(r.boarder_id, r.guest - 1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-5 text-center text-sm tabular-nums">{r.guest}</span>
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setGuest(r.boarder_id, r.guest + 1)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>বাতিল</Button>
            <Button onClick={saveAll} disabled={saving || !canEdit}>
              {saving ? "সংরক্ষণ হচ্ছে..." : "মিল এন্ট্রি সংরক্ষণ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToggleIcon({
  active, onClick, children, colorClass, title,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode; colorClass: string; title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "h-8 w-8 rounded-lg flex items-center justify-center transition-all border",
        active ? `${colorClass} border-transparent shadow-sm` : "bg-muted/30 text-muted-foreground border-border hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function BulkBtn({
  active, onClick, icon, children,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all",
        active
          ? "bg-primary text-primary-foreground border-transparent"
          : "bg-card text-foreground border-border hover:bg-muted"
      )}
    >
      {icon} {children}
    </button>
  );
}

function Cell({ value }: { value: boolean }) {
  return (
    <div className="text-center">
      <span className={cn("inline-flex w-6 h-6 rounded-full items-center justify-center text-xs",
        value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}>
        {value ? "✓" : "—"}
      </span>
    </div>
  );
}

function StatTile({
  label, value, icon, color,
}: {
  label: string; value: number; icon: React.ReactNode; color: "primary" | "destructive";
}) {
  return (
    <div className={cn(
      "rounded-2xl p-4 border shadow-sm",
      color === "primary" ? "bg-primary text-primary-foreground border-transparent" : "bg-destructive text-destructive-foreground border-transparent"
    )}>
      <div className="flex items-center gap-2 opacity-90">{icon}<p className="text-xs font-medium">{label}</p></div>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
    </div>
  );
}

function MiniTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={cn("rounded-xl px-3 py-2 flex flex-col items-center gap-1 text-center", color)}>
      <div className="flex items-center gap-1 text-xs font-medium">{icon}{label}</div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function EmptyBoarders() {
  return (
    <div className="p-10 text-center">
      <UtensilsCrossed className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <p className="font-medium">কোনো মিল এন্ট্রি নেই</p>
      <p className="text-sm text-muted-foreground mt-1">প্রথমে সদস্য যোগ করুন।</p>
    </div>
  );
}
