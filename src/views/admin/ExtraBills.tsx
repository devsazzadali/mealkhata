import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Zap, Trash2, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBdt } from "@/lib/phone";
import { currentPeriod, periodRange } from "@/lib/period";

const CATEGORIES = [
  { value: "electricity", label: "⚡ বিদ্যুৎ বিল" },
  { value: "gas", label: "🔥 গ্যাস বিল" },
  { value: "water", label: "💧 পানি বিল" },
  { value: "wifi", label: "📶 ওয়াইফাই" },
  { value: "rent", label: "🏠 বাসা ভাড়া / সিট ভাড়া (বসি বিল)" },
  { value: "service", label: "🧹 সার্ভিস চার্জ" },
  { value: "cleaner", label: "🧹 ক্লিনার" },
  { value: "garbage", label: "🗑️ ময়লা / গার্বেজ" },
  { value: "generator", label: "⛽ জেনারেটর / ফুয়েল" },
  { value: "maintenance", label: "🛠️ মেইনটেন্যান্স ফান্ড" },
  { value: "feast", label: "🎉 ফিস্ট ফান্ড" },
  { value: "other", label: "💼 অন্যান্য" },
];

type FormState = {
  id?: string;
  title: string;
  category: string;
  amount: string;
  bill_date: string;
  split_method: "equal" | "meal_ratio";
  notes: string;
};

const empty: FormState = {
  title: "",
  category: "electricity",
  amount: "",
  bill_date: new Date().toISOString().slice(0, 10),
  split_method: "equal",
  notes: "",
};

export default function ExtraBills() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const { year, month } = currentPeriod();
  const { start, end } = periodRange(year, month);

  const roles = useAuthStore((s) => s.roles);
  const readOnly = isMonitorOnly(roles);
  const { data: bills, isLoading } = useQuery({
    queryKey: ["extra_bills", messId, start, end],
    enabled: !!messId,
    queryFn: async () => {
      // No date-range params in apiGet, so filter by bill_date in JS.
      const rows = await apiGet<any[]>("extra-bills", { mess_id: messId!, order: "bill_date.desc" });
      return rows
        .filter((b) => String(b.bill_date) >= start && String(b.bill_date) < end)
        .map((b) => ({ ...b, bill_date: String(b.bill_date).slice(0, 10) }));
    },
  });

  const total = (bills ?? []).reduce((s, b: any) => s + Number(b.amount), 0);

  const handleSubmit = async () => {
    if (!messId) return;
    if (!form.title.trim() || !form.amount) return toast.error("Title ও amount দরকার");
    const payload = {
      mess_id: messId,
      title: form.title.trim(),
      category: form.category,
      amount: Number(form.amount),
      bill_date: form.bill_date,
      split_method: form.split_method,
      notes: form.notes || null,
      created_by: userId,
    };
    try {
      if (form.id) await apiPatch("extra-bills", form.id, payload);
      else await apiPost("extra-bills", payload);
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success(form.id ? "Updated" : "Added");
    setOpen(false);
    setForm(empty);
    qc.invalidateQueries({ queryKey: ["extra_bills"] });
  };

  const handleEdit = (b: any) => {
    setForm({
      id: b.id,
      title: b.title,
      category: b.category ?? "other",
      amount: String(b.amount),
      bill_date: b.bill_date,
      split_method: b.split_method,
      notes: b.notes ?? "",
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this bill?")) return;
    try {
      await apiDelete("extra-bills", id);
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["extra_bills"] });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Extra Bills</h1>
          <p className="text-sm text-muted-foreground mt-1">
            বিদ্যুৎ, গ্যাস, ওয়াইফাই, ভাড়া · এই মাসে: <span className="font-semibold text-foreground">{formatBdt(total)}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!readOnly && (
          <Button 
            variant="outline" 
            onClick={async () => {
              // mess_settings has mess_id as its id; list by mess_id and take [0].
              let settings: any[];
              try {
                settings = await apiGet<any[]>("mess-settings", { mess_id: messId! });
              } catch (e: any) {
                return toast.error(e.message);
              }
              const s = settings[0] ?? null;
              if (!s?.bank_info || !s.bank_info.startsWith("{")) return toast.error("প্রথমে মেস সেটিংসে গিয়ে অটো-বিল সেট করুন");

              const recurring = JSON.parse(s.bank_info).recurring;
              const billsToAdd = [
                { title: "খালার বিল", amount: Number(recurring.khala), category: "service" },
                { title: "বিদ্যুৎ বিল (স্থায়ী)", amount: Number(recurring.electricity), category: "electricity" },
                { title: "ওয়াইফাই বিল", amount: Number(recurring.wifi), category: "wifi" },
                { title: "গ্যাস বিল", amount: Number(recurring.gas), category: "gas" },
                { title: "পানি বিল", amount: Number(recurring.water), category: "water" },
              ].filter(b => b.amount > 0);

              if (billsToAdd.length === 0) return toast.error("সেটিংসে কোনো বিল সেট করা নেই");

              // No bulk-insert endpoint: post one bill at a time.
              try {
                for (const b of billsToAdd) {
                  await apiPost("extra-bills", {
                    ...b,
                    mess_id: messId!,
                    bill_date: new Date().toISOString().slice(0, 10),
                    split_method: "equal",
                    created_by: userId
                  });
                }
              } catch (e: any) {
                return toast.error(e.message);
              }
              toast.success("অটোমেটিক বিলগুলো যোগ করা হয়েছে");
              qc.invalidateQueries({ queryKey: ["extra_bills"] });
            }} 
            className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
          >
            <Sparkles className="w-4 h-4" /> অটো-বিল যোগ করুন
          </Button>
          )}
          {!readOnly && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(empty); }}>
            <DialogTrigger asChild>
              <Button className="shadow-glow gap-2"><Plus className="w-4 h-4" /> Add Bill</Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit" : "New"} Extra Bill</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="e.g. October Electricity"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (BDT)</Label>
                  <Input type="number" step="0.01" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Bill Date</Label>
                  <Input type="date" value={form.bill_date}
                    onChange={(e) => setForm({ ...form, bill_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Split Method</Label>
                  <Select value={form.split_method} onValueChange={(v: any) => setForm({ ...form, split_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equal">সমান ভাগে (head count)</SelectItem>
                      <SelectItem value="meal_ratio">মিল অনুযায়ী</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSubmit}>{form.id ? "Update" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          )}
      </div>

      {isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : !bills || bills.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Zap className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No extra bills this month</p>
          <p className="text-sm text-muted-foreground mt-1">বিদ্যুৎ, গ্যাস, ওয়াইফাই বিল add করুন।</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card divide-y overflow-hidden">
          {bills.map((b: any) => {
            const cat = CATEGORIES.find((c) => c.value === b.category);
            return (
              <div key={b.id} className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{b.title}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {b.split_method === "equal" ? "সমান" : "মিল অনুযায়ী"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {cat?.label ?? b.category} · {b.bill_date}{b.notes ? ` · ${b.notes}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatBdt(Number(b.amount))}</p>
                </div>
                {!readOnly && (<>
                <Button size="icon" variant="ghost" onClick={() => handleEdit(b)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(b.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
                </>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
