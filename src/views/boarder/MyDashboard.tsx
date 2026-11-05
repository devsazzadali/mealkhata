import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, UtensilsCrossed, AlertCircle, Calendar, Megaphone, Pin,
  Coffee, Sun, Moon, Plus, Minus, Send, Copy, Phone,   CheckCircle2, Clock, XCircle, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBdt } from "@/lib/phone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function MyDashboard() {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-dashboard", userId],
    enabled: !!userId,
    queryFn: async () => {
      const boarders = await apiGet<any[]>("boarders", { user_id: userId! });
      const boarder = boarders[0] ?? null;
      if (!boarder) return null;

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const ms = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const today = now.toISOString().slice(0, 10);

      // NOTE: the original code destructured 7 names for 8 queries and then
      // referenced an undefined `bazarRes` — fixed here by naming all 8.
      // apiGet has no gte/or filters and only one order key, so range and
      // pinned ordering are done in JS below.
      const [mealRows, depositRows, stats, settingsList, noticeRows, requests, messList, bazarRows] = await Promise.all([
        apiGet<any[]>("meal-entries", { boarder_id: boarder.id }),
        apiGet<any[]>("deposits", { boarder_id: boarder.id }),
        apiGet<any[]>("stats/month", { mess_id: boarder.mess_id, year, month }),
        apiGet<any[]>("mess-settings", { mess_id: boarder.mess_id }),
        apiGet<any[]>("notices", { mess_id: boarder.mess_id, order: "created_at.desc", limit: 50 }),
        apiGet<any[]>("meal-requests", { user_id: userId!, order: "created_at.desc", limit: 10 }),
        apiGet<any[]>("messes", { id: boarder.mess_id }),
        apiGet<any[]>("bazar-schedule", { mess_id: boarder.mess_id }),
      ]);
      const meals = (mealRows ?? []).filter((m) => String(m.meal_date).slice(0, 10) >= ms);
      const deposits = (depositRows ?? []).filter((d) => String(d.deposit_date).slice(0, 10) >= ms);
      const notices = (noticeRows ?? [])
        .sort((a, b) => Number(b.is_pinned ?? false) - Number(a.is_pinned ?? false)
          || String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 3);
      // boarder_id2 does not exist in the Prisma schema, so only boarder_id
      // is matched (the original .or() also referenced that missing column).
      const bazarToday = (bazarRows ?? []).filter(
        (s) => String(s.schedule_date).slice(0, 10) === today && s.boarder_id === boarder.id,
      );
      const totalMeals = meals.reduce(
        (s, m) => s + Number(m.breakfast) + Number(m.lunch) + Number(m.dinner) + Number(m.guest ?? 0),
        0
      );
      const monthDeposit = deposits.reduce((s, d) => s + Number(d.amount), 0);
      const mealRate = Number(stats?.[0]?.meal_rate ?? 0);

      return {
        boarder, totalMeals, monthDeposit, mealRate,
        settings: settingsList[0] ?? null, notices,
        requests: requests ?? [], messName: messList[0]?.name ?? "",
        bazarToday,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">আপনার অ্যাকাউন্টের সাথে কোনো boarder profile যুক্ত নেই। Mess admin এর সাথে যোগাযোগ করুন।</p>
      </div>
    );
  }

  const { boarder, totalMeals, monthDeposit, mealRate, settings, notices, requests, messName, bazarToday } = data;
  const balance = Number(boarder.balance);
  const monthCost = totalMeals * mealRate;
  const liveNet = monthDeposit - monthCost;
  const lowBalanceThreshold = Number(settings?.low_balance_threshold ?? 100);
  const isLowBalance = balance < lowBalanceThreshold;
  const initials = boarder.full_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();

  const copyText = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    toast.success(`${label} কপি হয়েছে`);
  };

  const cancelRequest = async (id: string) => {
    try {
      await apiDelete("meal-requests", id);
    } catch (e: any) {
      return toast.error(e.message || "Failed");
    }
    toast.success("Request বাতিল হয়েছে");
    qc.invalidateQueries({ queryKey: ["my-dashboard", userId] });
  };

  return (
    <div className="space-y-5 animate-fade-in pb-6">
      {/* Profile header card */}
      <div className="rounded-2xl border bg-card p-5 flex items-center gap-4 shadow-sm">
        {boarder.photo_url ? (
          <img src={boarder.photo_url} alt={boarder.full_name} className="w-16 h-16 rounded-2xl object-cover ring-2 ring-primary/20" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center font-bold text-xl shadow-md">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{boarder.full_name}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
            {messName && <span className="truncate">🏠 {messName}</span>}
            {boarder.seat_number && <span>· Seat {boarder.seat_number}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <Phone className="w-3 h-3" /> {boarder.phone}
          </div>
        </div>
        <Badge variant={boarder.status === "active" ? "secondary" : "outline"}
               className={boarder.status === "active" ? "bg-success/15 text-success border-success/30" : ""}>
          {boarder.status}
        </Badge>
      </div>

      {/* Balance hero */}
      <div className="rounded-2xl p-6 gradient-hero text-primary-foreground shadow-glow grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">টাকা ব্যালেন্স</p>
          <p className="text-3xl font-bold mt-1 tabular-nums">{formatBdt(balance)}</p>
        </div>
        <div className="text-right border-l border-white/20 pl-4">
          <p className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">চাউল ব্যালেন্স</p>
          <p className="text-3xl font-bold mt-1 tabular-nums">
            {Number(boarder.rice_balance || 0).toLocaleString()} <span className="text-xs font-normal">গ্রাম</span>
          </p>
        </div>
        <div className="col-span-2 pt-2 border-t border-white/10 mt-1">
          <p className="text-[11px] opacity-90">
            এই মাসে live: {formatBdt(liveNet)} ({totalMeals} meals × {formatBdt(mealRate)})
          </p>
          {balance < 0 && <p className="text-[11px] mt-1 opacity-100 font-bold text-yellow-200">⚠ আপনার বকেয়া আছে — দ্রুত টাকা জমা দিন।</p>}
        </div>
      </div>

      {/* Bazar Alert */}
      {bazarToday && bazarToday.length > 0 && (
        <div className="rounded-2xl border-2 border-primary bg-primary/5 p-5 shadow-sm animate-pulse-subtle">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-md">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-primary">আজ আপনার বাজার! 🛒</h3>
              <p className="text-sm text-muted-foreground">আজকের জন্য আপনার বাজার শিডিউল বরাদ্দ আছে।</p>
            </div>
          </div>
          {bazarToday[0].notes && (
            <p className="mt-3 text-sm bg-muted/50 p-2 rounded-lg border border-dashed font-medium italic">
              নোট: {bazarToday[0].notes}
            </p>
          )}
        </div>
      )}

      {isLowBalance && (
        <div className="rounded-2xl border border-warning/50 bg-warning/10 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">কম ব্যালেন্স সতর্কতা</p>
            <p className="text-sm text-foreground/80 mt-1">
              আপনার ব্যালেন্স ({formatBdt(balance)}), threshold {formatBdt(lowBalanceThreshold)} এর নিচে। দয়া করে deposit দিন।
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="এই মাসের মিল" value={String(totalMeals)} icon={UtensilsCrossed} tone="primary" />
        <StatCard label="এই মাসের জমা" value={formatBdt(monthDeposit)} icon={Wallet} tone="success" />
        <StatCard label="মিল রেট (live)" value={formatBdt(mealRate)} hint="per meal" icon={Calendar} />
        <StatCard label="খরচ এই মাসে" value={formatBdt(monthCost)} icon={UtensilsCrossed} tone="warning" />
      </div>

      {/* Payment info */}
      {(settings?.bkash_number || settings?.nagad_number || settings?.bank_info) && (
        <div className="rounded-2xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">পেমেন্ট তথ্য</h2>
            <Badge variant="outline">Deposit এখানে দিন</Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {settings?.bkash_number && (
              <button onClick={() => copyText(settings.bkash_number, "bKash নম্বর")}
                      className="flex items-center gap-3 rounded-xl border bg-background p-3 hover:bg-accent text-left transition-colors">
                <div className="w-10 h-10 rounded-lg bg-pink-500/15 text-pink-600 flex items-center justify-center font-bold text-xs">bK</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">bKash</p>
                  <p className="font-mono text-sm truncate">{settings.bkash_number}</p>
                </div>
                <Copy className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            {settings?.nagad_number && (
              <button onClick={() => copyText(settings.nagad_number, "Nagad নম্বর")}
                      className="flex items-center gap-3 rounded-xl border bg-background p-3 hover:bg-accent text-left transition-colors">
                <div className="w-10 h-10 rounded-lg bg-orange-500/15 text-orange-600 flex items-center justify-center font-bold text-xs">Ng</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Nagad</p>
                  <p className="font-mono text-sm truncate">{settings.nagad_number}</p>
                </div>
                <Copy className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          {settings?.bank_info && (
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground mb-1">Bank Info</p>
              <p className="text-sm whitespace-pre-wrap">{settings.bank_info}</p>
            </div>
          )}
        </div>
      )}

      {/* Meal Request */}
      <MealRequestSection
        boarder={boarder}
        userId={userId!}
        requests={requests}
        onCancel={cancelRequest}
      />

      {/* Notices */}
      {notices.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Megaphone className="w-4 h-4" /> সর্বশেষ নোটিশ
          </h2>
          {notices.map((n: any) => (
            <div key={n.id} className={`rounded-2xl border bg-card p-4 ${n.is_pinned ? "border-primary/50" : ""}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">{n.title}</h3>
                {n.is_pinned && <Badge variant="outline" className="border-primary text-primary gap-1 text-[10px]"><Pin className="w-2.5 h-2.5" /> Pinned</Badge>}
              </div>
              <p className="text-sm text-foreground/80 mt-1.5 whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== Meal Request Section ==========
function MealRequestSection({
  boarder, userId, requests, onCancel,
}: { boarder: any; userId: string; requests: any[]; onCancel: (id: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reqDate, setReqDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [breakfast, setBreakfast] = useState(false);
  const [lunch, setLunch] = useState(false);
  const [dinner, setDinner] = useState(false);
  const [guest, setGuest] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReqDate(format(new Date(), "yyyy-MM-dd"));
    setBreakfast(false); setLunch(false); setDinner(false);
    setGuest(0); setNote("");
  };

  const submit = async () => {
    if (!breakfast && !lunch && !dinner && guest === 0) {
      return toast.error("কমপক্ষে একটা মিল বা guest নির্বাচন করুন");
    }
    setSubmitting(true);
    try {
      await apiPost("meal-requests", {
        mess_id: boarder.mess_id,
        boarder_id: boarder.id,
        user_id: userId,
        request_date: reqDate,
        breakfast, lunch, dinner, guest,
        note: note.trim() || null,
      });
    } catch (e: any) {
      setSubmitting(false);
      return toast.error(e.message || "Failed");
    }
    setSubmitting(false);
    toast.success("আপনার Request পাঠানো হয়েছে — admin approval এর অপেক্ষায়");
    setOpen(false); reset();
    qc.invalidateQueries({ queryKey: ["my-dashboard", userId] });
  };

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-success/15 text-success border-success/30 gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>;
    if (s === "rejected") return <Badge variant="outline" className="border-destructive/40 text-destructive gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>;
    return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
  };

  return (
    <div className="rounded-2xl border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">মিল Request</h2>
          <p className="text-xs text-muted-foreground mt-0.5">কোন দিন কোন বেলায় খাবেন তা admin কে জানান</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Send className="w-4 h-4" /> নতুন</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>মিল On/Off Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>তারিখ</Label>
                <Input type="date" value={reqDate} onChange={(e) => setReqDate(e.target.value)} min={format(new Date(), "yyyy-MM-dd")} />
              </div>
              <div className="space-y-1.5">
                <Label>বেলা</Label>
                <div className="grid grid-cols-3 gap-2">
                  <MealToggle label="নাশতা" icon={Coffee} active={breakfast} onClick={() => setBreakfast((v) => !v)} />
                  <MealToggle label="দুপুর" icon={Sun} active={lunch} onClick={() => setLunch((v) => !v)} />
                  <MealToggle label="রাত" icon={Moon} active={dinner} onClick={() => setDinner((v) => !v)} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">যেগুলো বেছে নেবেন সেগুলো on করার request হিসেবে যাবে। বন্ধ রাখতে চাইলে note এ লিখুন।</p>
              </div>
              <div className="space-y-1.5">
                <Label>Guest সংখ্যা</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" onClick={() => setGuest((g) => Math.max(0, g - 1))}>
                    <Minus className="w-4 h-4" />
                  </Button>
                  <div className="flex-1 text-center font-semibold tabular-nums text-lg">{guest}</div>
                  <Button type="button" variant="outline" size="icon" onClick={() => setGuest((g) => g + 1)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>নোট (ঐচ্ছিক)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                          placeholder="যেমন: আজ রাতের মিল বন্ধ রাখুন, বা ২ জন guest আনব দুপুরে..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "পাঠানো হচ্ছে..." : "Request পাঠান"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Recent requests */}
      {requests.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
          এখনও কোনো মিল request নেই
        </div>
      ) : (
        <div className="space-y-2">
          {requests.slice(0, 5).map((r: any) => {
            const items: string[] = [];
            if (r.breakfast) items.push("নাশতা");
            if (r.lunch) items.push("দুপুর");
            if (r.dinner) items.push("রাত");
            if (r.guest > 0) items.push(`Guest×${r.guest}`);
            return (
              <div key={r.id} className="rounded-xl border bg-background p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{format(new Date(r.request_date), "dd MMM yyyy")}</p>
                    {statusBadge(r.status)}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {items.join(" · ") || "কোনো বেলা নেই"}
                    {r.note && ` — ${r.note}`}
                  </p>
                </div>
                {r.status === "pending" && (
                  <Button variant="ghost" size="icon" onClick={() => onCancel(r.id)} className="text-destructive hover:text-destructive shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MealToggle({ label, icon: Icon, active, onClick }: { label: string; icon: any; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background hover:border-primary/40 text-muted-foreground"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
