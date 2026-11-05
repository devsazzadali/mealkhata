import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfWeek, addDays, parseISO } from "date-fns";
import { bn } from "date-fns/locale";
import { Plus, Pencil, Trash2, UtensilsCrossed, Sun, Moon, Coffee } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

type DailyMenu = {
  id: string;
  mess_id: string;
  menu_date: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  notes: string | null;
};

const todayStr = () => format(new Date(), "yyyy-MM-dd");

export default function DailyMenu() {
  const messId = useAuthStore((s) => s.profile?.mess_id ?? null);
  const roles = useAuthStore((s) => s.roles);
  // Server rule (api-server.ts): a read-only mess_monitor may not write this model.
  const readOnly = isMonitorOnly(roles);

  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DailyMenu | null>(null);
  const [form, setForm] = useState({
    menu_date: todayStr(),
    breakfast: "",
    lunch: "",
    dinner: "",
    notes: "",
  });

  const { data: menus = [], isLoading } = useQuery({
    queryKey: ["daily_menus", messId],
    enabled: !!messId,
    queryFn: async () => {
      const rows = await apiGet<DailyMenu[]>("daily-menus", { mess_id: messId!, order: "menu_date.desc", limit: 60 });
      // Prisma serializes Date columns as full ISO datetimes; the UI keys
      // menus by YYYY-MM-DD, so normalize date-only fields back to that form.
      return rows.map((m) => ({ ...m, menu_date: String(m.menu_date).slice(0, 10) }));
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!messId) throw new Error("No mess");
      const payload = {
        mess_id: messId,
        menu_date: form.menu_date,
        breakfast: form.breakfast,
        lunch: form.lunch,
        dinner: form.dinner,
        notes: form.notes || null,
      };
      if (editing) {
        await apiPatch("daily-menus", editing.id, payload);
      } else {
        // No generic upsert endpoint: emulate onConflict (mess_id, menu_date) in JS.
        const existing = await apiGet<DailyMenu[]>("daily-menus", { mess_id: messId });
        const match = existing.find((m) => m.menu_date.slice(0, 10) === form.menu_date.slice(0, 10));
        if (match) await apiPatch("daily-menus", match.id, payload);
        else await apiPost("daily-menus", payload);
      }
    },
    onSuccess: () => {
      toast.success(editing ? "মেনু আপডেট হয়েছে" : "মেনু সংরক্ষণ হয়েছে");
      qc.invalidateQueries({ queryKey: ["daily_menus", messId] });
      resetAndClose();
    },
    onError: (e: any) => toast.error(e.message ?? "সংরক্ষণে সমস্যা"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiDelete("daily-menus", id);
    },
    onSuccess: () => {
      toast.success("মেনু মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["daily_menus", messId] });
    },
    onError: (e: any) => toast.error(e.message ?? "মুছতে সমস্যা"),
  });

  const resetAndClose = () => {
    setOpen(false);
    setEditing(null);
    setForm({ menu_date: todayStr(), breakfast: "", lunch: "", dinner: "", notes: "" });
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ menu_date: todayStr(), breakfast: "", lunch: "", dinner: "", notes: "" });
    setOpen(true);
  };

  const openEdit = (m: DailyMenu) => {
    setEditing(m);
    setForm({
      menu_date: m.menu_date,
      breakfast: m.breakfast,
      lunch: m.lunch,
      dinner: m.dinner,
      notes: m.notes ?? "",
    });
    setOpen(true);
  };

  // Build current week list (Sat -> Fri style; default week-start Saturday for BD context)
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 6 }); // Saturday
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const menuByDate = new Map(menus.map((m) => [m.menu_date, m]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">দৈনিক মেনু ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground">প্রতিদিনের নাশতা, দুপুর ও রাতের খাবারের মেনু নির্ধারণ</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : resetAndClose())}>
          {!readOnly && (
          <DialogTrigger asChild>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" /> নতুন মেনু যোগ করুন
            </Button>
          </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "মেনু সম্পাদনা করুন" : "নতুন মেনু যোগ করুন"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="date">তারিখ *</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.menu_date}
                  onChange={(e) => setForm({ ...form, menu_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="breakfast">নাশতা *</Label>
                <Textarea
                  id="breakfast"
                  placeholder="নাশতার মেনু লিখুন..."
                  value={form.breakfast}
                  onChange={(e) => setForm({ ...form, breakfast: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lunch">দুপুরের খাবার *</Label>
                <Textarea
                  id="lunch"
                  placeholder="দুপুরের খাবারের মেনু লিখুন..."
                  value={form.lunch}
                  onChange={(e) => setForm({ ...form, lunch: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dinner">রাতের খাবার *</Label>
                <Textarea
                  id="dinner"
                  placeholder="রাতের খাবারের মেনু লিখুন..."
                  value={form.dinner}
                  onChange={(e) => setForm({ ...form, dinner: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">বিশেষ নোট (ঐচ্ছিক)</Label>
                <Textarea
                  id="notes"
                  placeholder="কোনো বিশেষ নোট বা তথ্য..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose}>বাতিল</Button>
              <Button
                onClick={() => upsertMutation.mutate()}
                disabled={
                  upsertMutation.isPending ||
                  !form.menu_date || !form.breakfast || !form.lunch || !form.dinner
                }
              >
                {upsertMutation.isPending ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Weekly menu */}
      <Card>
        <CardHeader>
          <CardTitle>সাপ্তাহিক মেনু তালিকা</CardTitle>
          <p className="text-sm text-muted-foreground">সপ্তাহের সকল দিনের মেনু একনজরে দেখুন</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {weekDays.map((d) => {
              const ds = format(d, "yyyy-MM-dd");
              const m = menuByDate.get(ds);
              return (
                <Card key={ds} className="border-dashed">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">
                          {format(d, "EEEE", { locale: bn })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(d, "dd MMM yyyy", { locale: bn })}
                        </p>
                      </div>
                      {m ? (
                        !readOnly ? (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(m)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("এই মেনু মুছে ফেলবেন?")) deleteMutation.mutate(m.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                        ) : null
                      ) : !readOnly ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(null);
                            setForm({ menu_date: ds, breakfast: "", lunch: "", dinner: "", notes: "" });
                            setOpen(true);
                          }}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> যোগ
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {m ? (
                      <>
                        <Row icon={<Coffee className="w-4 h-4" />} label="নাশতা" value={m.breakfast} />
                        <Row icon={<Sun className="w-4 h-4" />} label="দুপুর" value={m.lunch} />
                        <Row icon={<Moon className="w-4 h-4" />} label="রাত" value={m.dinner} />
                        {m.notes && <p className="text-xs italic text-muted-foreground pt-1">📝 {m.notes}</p>}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">কোনো মেনু সেট করা নেই</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent menus list */}
      <Card>
        <CardHeader>
          <CardTitle>সাম্প্রতিক মেনু</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>
          ) : menus.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <UtensilsCrossed className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>এখনো কোনো মেনু যোগ করা হয়নি</p>
              <p className="text-xs">নতুন মেনু যোগ করতে উপরের বোতামে ক্লিক করুন।</p>
            </div>
          ) : (
            <div className="space-y-3">
              {menus.map((m) => (
                <div key={m.id} className="border rounded-xl p-3 flex flex-wrap gap-3 items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {format(parseISO(m.menu_date), "dd MMM yyyy, EEEE", { locale: bn })}
                    </p>
                    <div className="grid sm:grid-cols-3 gap-2 text-sm">
                      <Row icon={<Coffee className="w-4 h-4" />} label="নাশতা" value={m.breakfast} />
                      <Row icon={<Sun className="w-4 h-4" />} label="দুপুর" value={m.lunch} />
                      <Row icon={<Moon className="w-4 h-4" />} label="রাত" value={m.dinner} />
                    </div>
                    {m.notes && <p className="text-xs italic text-muted-foreground">📝 {m.notes}</p>}
                  </div>
                  {!readOnly && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(m)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("এই মেনু মুছে ফেলবেন?")) deleteMutation.mutate(m.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-primary mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words">{value || "—"}</p>
      </div>
    </div>
  );
}
