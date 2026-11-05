import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Save, RefreshCw, Building2, Calculator, Zap, Wheat } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const roles = useAuthStore((s) => s.roles);
  // Server rule (api-server.ts): a read-only mess_monitor may not write this model.
  const readOnly = isMonitorOnly(roles);

  const qc = useQueryClient();
  const [form, setForm] = useState({
    default_meal_rate: "0",
    low_balance_threshold: "100",
    bkash_number: "",
    nagad_number: "",
    bank_info: "",
    // New fields for mess profile (to be synced with 'messes' table)
    mess_name: "",
    mess_address: "",
    mess_phone: "",
    // Recurring bills (stored as JSON in bank_info)
    khala_bill: "0",
    electricity_bill: "0",
    wifi_bill: "0",
    gas_bill: "0",
    water_bill: "0",
    others_bill: "0",
    // Rice settings (stored as JSON in bank_info)
    kg_per_meal: "",
    rice_per_meal_breakfast: "0",
    rice_per_meal_lunch: "0",
    rice_per_meal_dinner: "0",
  });
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["mess-settings", messId],
    enabled: !!messId,
    queryFn: async () => {
      // No join in the Prisma API: fetch the mess row and attach it as
      // `messes` in JS (original: mess_settings joined with messes).
      const [rows, messRows] = await Promise.all([
        apiGet<any[]>("mess-settings", { mess_id: messId! }),
        apiGet<any[]>("messes", { id: messId! }),
      ]);
      const row = rows[0] ?? null;
      if (!row) return null;
      const m = messRows[0] as any;
      return { ...row, messes: m ? { name: m.name, address: m.address, phone: m.phone } : undefined };
    },
  });

  useEffect(() => {
    if (settings) {
      let recurring = { khala: "0", electricity: "0", wifi: "0", gas: "0", water: "0", others: "0" };
      let rice = { breakfast: "0", lunch: "0", dinner: "0" };
      try {
        if (settings.bank_info && settings.bank_info.startsWith("{")) {
          const parsed = JSON.parse(settings.bank_info);
          if (parsed.recurring) recurring = parsed.recurring;
          if (parsed.rice) rice = parsed.rice;
        }
      } catch (e) {}

      setForm({
        default_meal_rate: String(settings.default_meal_rate ?? 0),
        low_balance_threshold: String(settings.low_balance_threshold ?? 100),
        bkash_number: settings.bkash_number ?? "",
        nagad_number: settings.nagad_number ?? "",
        bank_info: settings.bank_info ?? "",
        mess_name: settings.messes?.name ?? "",
        mess_address: settings.messes?.address ?? "",
        mess_phone: settings.messes?.phone ?? "",
        khala_bill: recurring.khala || "0",
        electricity_bill: recurring.electricity || "0",
        wifi_bill: recurring.wifi || "0",
        gas_bill: recurring.gas || "0",
        water_bill: recurring.water || "0",
        others_bill: recurring.others || "0",
        kg_per_meal: settings.kg_per_meal != null ? String(settings.kg_per_meal) : "",
        rice_per_meal_breakfast: rice.breakfast || "0",
        rice_per_meal_lunch: rice.lunch || "0",
        rice_per_meal_dinner: rice.dinner || "0",
      });
    }
  }, [settings]);

  async function handleSave() {
    if (!messId) return;
    setSaving(true);
    
    const recurringData = {
      recurring: {
        khala: form.khala_bill,
        electricity: form.electricity_bill,
        wifi: form.wifi_bill,
        gas: form.gas_bill,
        water: form.water_bill,
        others: form.others_bill,
      },
      rice: {
        breakfast: form.rice_per_meal_breakfast,
        lunch: form.rice_per_meal_lunch,
        dinner: form.rice_per_meal_dinner,
      }
    };

    // MessSettings PK is mess_id (not id). If no settings row exists yet,
    // create one - the old update-by-mess_id was a no-op in that case.
    try {
      const settingsBody = {
        kg_per_meal: form.kg_per_meal === "" ? null : Number(form.kg_per_meal),
        default_meal_rate: Number(form.default_meal_rate) || 0,
        low_balance_threshold: Number(form.low_balance_threshold) || 0,
        bkash_number: form.bkash_number || null,
        nagad_number: form.nagad_number || null,
        bank_info: JSON.stringify(recurringData),
      };
      if ((settings as any)?.mess_id) {
        await apiPatch("mess-settings", (settings as any).mess_id, settingsBody);
      } else {
        await apiPost("mess-settings", { mess_id: messId, join_key: Math.random().toString(36).slice(2, 10), ...settingsBody });
      }
      await apiPatch("messes", messId, {
        name: form.mess_name,
        address: form.mess_address || null,
        phone: form.mess_phone || null,
      });
    } catch (e: any) {
      setSaving(false);
      toast.error(e.message);
      return;
    }

    setSaving(false);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["mess-settings", messId] });
  }

  async function regenerateKey() {
    if (!messId || !(settings as any)?.mess_id) return;
    const newKey = Math.random().toString(36).slice(2, 10);
    try {
      await apiPatch("mess-settings", (settings as any).mess_id, { join_key: newKey });
    } catch (e: any) {
      toast.error(e.message);
      return;
    }
    toast.success("Join key regenerated");
    qc.invalidateQueries({ queryKey: ["mess-settings", messId] });
  }

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">মেস সেটিংস</h1>
          <p className="text-sm text-muted-foreground mt-1">মেসের যাবতীয় কনফিগারেশন এখান থেকে পরিচালনা করুন</p>
        </div>
        {!readOnly && (
        <Button onClick={handleSave} disabled={saving} className="gap-2 gradient-primary">
          <Save className="w-4 h-4" />
          {saving ? "সংরক্ষণ হচ্ছে..." : "সব পরিবর্তন সংরক্ষণ করুন"}
        </Button>
        )}
        {readOnly && <p className="text-sm text-muted-foreground">Read-only view: a mess_monitor cannot change settings.</p>}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Mess Info */}
          <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 text-primary">
              <Building2 className="w-4 h-4" /> মেস প্রোফাইল
            </h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="mname">মেসের নাম</Label>
                <Input id="mname" value={form.mess_name} onChange={(e) => setForm({ ...form, mess_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mphone">কন্টাক্ট নম্বর</Label>
                <Input id="mphone" value={form.mess_phone} onChange={(e) => setForm({ ...form, mess_phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maddr">ঠিকানা</Label>
                <Textarea id="maddr" rows={2} value={form.mess_address} onChange={(e) => setForm({ ...form, mess_address: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Join Key */}
          <div className="rounded-2xl border bg-card p-5 space-y-3 shadow-sm">
            <div>
              <h3 className="font-semibold">জয়েন কি (Join Key)</h3>
              <p className="text-[11px] text-muted-foreground mt-1">
                নতুন মেম্বারদের এই কি-টি দিন। তারা সাইন-আপ করার সময় এটি ব্যবহার করে আপনার মেসে জয়েন করতে পারবে।
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-4 py-3 rounded-xl bg-muted font-mono text-lg tracking-wider text-center">
                {settings?.join_key ?? "—"}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(settings?.join_key ?? "");
                  toast.success("কপি হয়েছে");
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={regenerateKey} title="নতুন কি তৈরি করুন">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Financial settings */}
          <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 text-primary">
              <Calculator className="w-4 h-4" /> আর্থিক সেটিংস
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rate">ডিফল্ট মিল রেট (৳)</Label>
                <Input
                  id="rate"
                  type="number"
                  step="0.01"
                  value={form.default_meal_rate}
                  onChange={(e) => setForm({ ...form, default_meal_rate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lowbal">লো ব্যালেন্স এলার্ট (৳)</Label>
                <Input
                  id="lowbal"
                  type="number"
                  step="1"
                  value={form.low_balance_threshold}
                  onChange={(e) => setForm({ ...form, low_balance_threshold: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Rice auto-deduction (Phase 1) */}
          <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 text-primary">
              <Wheat className="w-4 h-4" /> চাল অটো-কাটা (kg per meal)
            </h3>
            <p className="text-[11px] text-muted-foreground -mt-2">
              খালি রাখলে অটো-কাটা বন্ধ থাকবে। কোনো সার্বজনীন kg/meal সংখ্যা নেই — মেস নিজের হিসাব থেকে এই মান বসাবে। নতুন মিল এন্ট্রি হলে এই হারে &quot;rice&quot; স্টক থেকে কাটা হবে; rice স্টক না থাকলে কাটা হবে না।
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="kgpermeal">Kg per meal</Label>
              <Input
                id="kgpermeal"
                type="number"
                step="0.001"
                min="0"
                placeholder="e.g. 0.15 (leave blank to disable)"
                value={form.kg_per_meal}
                onChange={(e) => setForm({ ...form, kg_per_meal: e.target.value })}
              />
            </div>
          </div>

          {/* Fixed Monthly Bills */}
          <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 text-primary">
              <Zap className="w-4 h-4" /> অটোমেটিক মাসিক বিল (ফিক্সড)
            </h3>
            <p className="text-[11px] text-muted-foreground -mt-2">
              এই বিলগুলো প্রতি মাসে সবার মাঝে সমানভাবে ভাগ হবে। (এক্সট্রা বিল সেকশনে অটো-এড করার জন্য ব্যবহৃত হবে)
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1">
                <Label className="text-xs">খালা বিল</Label>
                <Input type="number" value={form.khala_bill} onChange={(e) => setForm({ ...form, khala_bill: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">বিদ্যুৎ (ফিক্সড)</Label>
                <Input type="number" value={form.electricity_bill} onChange={(e) => setForm({ ...form, electricity_bill: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ওয়াইফাই</Label>
                <Input type="number" value={form.wifi_bill} onChange={(e) => setForm({ ...form, wifi_bill: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">গ্যাস বিল</Label>
                <Input type="number" value={form.gas_bill} onChange={(e) => setForm({ ...form, gas_bill: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">পানি বিল</Label>
                <Input type="number" value={form.water_bill} onChange={(e) => setForm({ ...form, water_bill: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Rice Settings */}
          <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 text-primary">
              <Wheat className="w-4 h-4" /> চাউল খরচ সেটিংস (প্রতি মিল)
            </h3>
            <p className="text-[11px] text-muted-foreground -mt-2">
              প্রতি মিলের জন্য কত গ্রাম চাউল খরচ হয় তা সেট করুন। মিল এন্ট্রি করার সময় এটি মেম্বারের ব্যালেন্স থেকে কাটা হবে।
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">সকাল (গ্রাম)</Label>
                <Input type="number" value={form.rice_per_meal_breakfast} onChange={(e) => setForm({ ...form, rice_per_meal_breakfast: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">দুপুর (গ্রাম)</Label>
                <Input type="number" value={form.rice_per_meal_lunch} onChange={(e) => setForm({ ...form, rice_per_meal_lunch: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">রাত (গ্রাম)</Label>
                <Input type="number" value={form.rice_per_meal_dinner} onChange={(e) => setForm({ ...form, rice_per_meal_dinner: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Payment numbers */}
          <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold">পেমেন্ট নম্বরসমূহ</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bkash">bKash</Label>
                <Input id="bkash" placeholder="01XXXXXXXXX" value={form.bkash_number} onChange={(e) => setForm({ ...form, bkash_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nagad">Nagad</Label>
                <Input id="nagad" placeholder="01XXXXXXXXX" value={form.nagad_number} onChange={(e) => setForm({ ...form, nagad_number: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
