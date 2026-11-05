import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, UtensilsCrossed, Coffee, Sun, Moon, Users, Calendar, Search, CheckCheck } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type Status = "pending" | "approved" | "rejected";

export default function MealRequests() {
  const { profile, user, roles } = useAuthStore();
  // Server rule (api-server.ts): a read-only mess_monitor may not decide requests.
  const readOnly = isMonitorOnly(roles);
  const messId = profile?.mess_id;
  const qc = useQueryClient();
  const [tab, setTab] = useState<Status>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["meal-requests", messId],
    enabled: !!messId,
    queryFn: async () => {
      // No join in the Prisma API: fetch boarders and attach them in JS.
      const [reqs, boarders] = await Promise.all([
        apiGet<any[]>("meal-requests", { mess_id: messId!, order: "created_at.desc" }),
        apiGet<any[]>("boarders", { mess_id: messId! }),
      ]);
      const byId = new Map(boarders.map((b: any) => [b.id, b]));
      return reqs.map((r: any) => {
        const b = byId.get(r.boarder_id) as any;
        return { ...r, boarders: b ? { full_name: b.full_name, photo_url: b.photo_url } : undefined };
      });
    },
  });

  // Realtime channel replaced by 15s polling (see migration contract).
  useEffect(() => {
    if (!messId) return;
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["meal-requests", messId] });
    }, 15000);
    return () => clearInterval(t);
  }, [messId, qc]);

  // reset selection when tab changes
  useEffect(() => { setSelected(new Set()); }, [tab]);

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      pending: all.filter((r: any) => r.status === "pending").length,
      approved: all.filter((r: any) => r.status === "approved").length,
      rejected: all.filter((r: any) => r.status === "rejected").length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const all = (data ?? []).filter((r: any) => r.status === tab);
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((r: any) => (r.boarders?.full_name ?? "").toLowerCase().includes(q));
  }, [data, tab, search]);

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r: any) => r.id)));
  };

  const decideOne = async (r: any, action: "approved" | "rejected") => {
    await apiPatch("meal-requests", r.id, {
      status: action, decided_by: user?.id, decided_at: new Date().toISOString(),
    });

    if (action === "approved") {
      // Meal-entry upsert on (boarder_id, meal_date): GET first, PATCH if
      // exists else POST (no generic upsert route in the Prisma API).
      const body = {
        mess_id: r.mess_id,
        boarder_id: r.boarder_id,
        meal_date: r.request_date,
        breakfast: r.breakfast ? 1 : 0,
        lunch: r.lunch ? 1 : 0,
        dinner: r.dinner ? 1 : 0,
        guest: r.guest ?? 0,
        created_by: user?.id,
      };
      const existing = (await apiGet<any[]>("meal-entries", {
        boarder_id: r.boarder_id, meal_date: r.request_date,
      }))[0];
      if (existing) await apiPatch("meal-entries", existing.id, body);
      else await apiPost("meal-entries", body);
    }
  };

  const decide = async (r: any, action: "approved" | "rejected") => {
    try {
      await decideOne(r, action);
      toast.success(action === "approved" ? "Approve করা হয়েছে" : "Reject করা হয়েছে");
      qc.invalidateQueries({ queryKey: ["meal-requests", messId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const bulkDecide = async (action: "approved" | "rejected") => {
    const targets = filtered.filter((r: any) => selected.has(r.id) && r.status === "pending");
    if (targets.length === 0) return toast.info("কোনো pending request নির্বাচন করা নেই");
    setBusy(true);
    let ok = 0, fail = 0;
    for (const r of targets) {
      try { await decideOne(r, action); ok++; } catch { fail++; }
    }
    setBusy(false);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["meal-requests", messId] });
    if (fail === 0) toast.success(`${ok} টি ${action === "approved" ? "approve" : "reject"} হয়েছে`);
    else toast.warning(`${ok} সফল, ${fail} ব্যর্থ`);
  };

  const allChecked = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">মিল Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">Boarders এর মিল on/off ও guest meal requests</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
        <TabsList>
          <TabsTrigger value="pending">
            অপেক্ষমান {counts.pending > 0 && <Badge className="ml-2 h-5 px-1.5">{counts.pending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved {counts.approved > 0 && <Badge variant="secondary" className="ml-2 h-5 px-1.5">{counts.approved}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected {counts.rejected > 0 && <Badge variant="secondary" className="ml-2 h-5 px-1.5">{counts.rejected}</Badge>}
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="নাম দিয়ে খুঁজুন..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {tab === "pending" && filtered.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                <CheckCheck className="w-4 h-4 mr-1" />
                {allChecked ? "Unselect all" : "Select all"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={selected.size === 0 || busy || readOnly}
                onClick={() => bulkDecide("rejected")}
              >
                <X className="w-4 h-4 mr-1" /> Reject ({selected.size})
              </Button>
              <Button
                size="sm"
                disabled={selected.size === 0 || busy || readOnly}
                onClick={() => bulkDecide("approved")}
              >
                <Check className="w-4 h-4 mr-1" /> Approve ({selected.size})
              </Button>
            </>
          )}
        </div>

        <TabsContent value={tab} className="mt-4 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState text={
              tab === "pending" ? "কোনো অপেক্ষমান request নেই" :
              tab === "approved" ? "এখনও কোনো approved request নেই" :
              "এখনও কোনো rejected request নেই"
            } />
          ) : (
            filtered.map((r: any) => (
              <RequestCard
                key={r.id}
                r={r}
                selectable={tab === "pending"}
                checked={selected.has(r.id)}
                onCheck={() => toggleOne(r.id)}
                onApprove={() => decide(r, "approved")}
                onReject={() => decide(r, "rejected")}
                readonly={tab !== "pending" || readOnly}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border bg-card p-10 text-center">
      <UtensilsCrossed className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <p className="font-medium">{text}</p>
    </div>
  );
}

function RequestCard({
  r, onApprove, onReject, readonly, selectable, checked, onCheck,
}: {
  r: any; onApprove?: () => void; onReject?: () => void; readonly?: boolean;
  selectable?: boolean; checked?: boolean; onCheck?: () => void;
}) {
  const items: { label: string; icon: any }[] = [];
  if (r.breakfast) items.push({ label: "নাশতা", icon: Coffee });
  if (r.lunch) items.push({ label: "দুপুর", icon: Sun });
  if (r.dinner) items.push({ label: "রাত", icon: Moon });

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        {selectable && (
          <div className="pt-1">
            <Checkbox checked={checked} onCheckedChange={onCheck} />
          </div>
        )}
        {r.boarders?.photo_url ? (
          <img src={r.boarders.photo_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
            {(r.boarders?.full_name ?? "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{r.boarders?.full_name ?? "Unknown"}</p>
            <StatusBadge status={r.status} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(r.request_date), "dd MMM yyyy")}</span>
            <span>· {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {items.map((it, i) => (
              <Badge key={i} variant="secondary" className="gap-1 font-normal">
                <it.icon className="w-3 h-3" /> {it.label}
              </Badge>
            ))}
            {r.guest > 0 && (
              <Badge variant="secondary" className="gap-1 font-normal">
                <Users className="w-3 h-3" /> Guest × {r.guest}
              </Badge>
            )}
            {items.length === 0 && r.guest === 0 && (
              <span className="text-xs text-muted-foreground italic">কোনো বেলা নির্বাচন নেই</span>
            )}
          </div>
          {r.note && <p className="text-sm mt-2 italic text-foreground/80">"{r.note}"</p>}
        </div>
        {!readonly && r.status === "pending" && (
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={onReject}><X className="w-4 h-4" /></Button>
            <Button size="sm" onClick={onApprove}><Check className="w-4 h-4 mr-1" /> Approve</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-success/15 text-success border-success/30">Approved</Badge>;
  if (status === "rejected") return <Badge variant="outline" className="border-destructive/40 text-destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}
