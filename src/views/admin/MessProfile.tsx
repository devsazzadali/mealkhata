"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Building2, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";

export default function MessProfile() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const roles = useAuthStore((s) => s.roles);
  // Server rule (api-server.ts): a read-only mess_monitor may not write this model.
  const readOnly = isMonitorOnly(roles);

  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: mess, isLoading } = useQuery({
    queryKey: ["mess", messId],
    enabled: !!messId,
    queryFn: async () => {
      const rows = await apiGet<any[]>("messes", { id: messId! });
      return rows[0] ?? null;
    },
  });

  useEffect(() => {
    if (mess) {
      setForm({
        name: mess.name || "",
        address: mess.address || "",
        phone: mess.phone || "",
      });
    }
  }, [mess]);

  async function handleSave() {
    if (!messId) return;
    setSaving(true);
    try {
      await apiPatch("messes", messId, {
        name: form.name,
        address: form.address || null,
        phone: form.phone || null,
      });
    } catch (e: any) {
      setSaving(false);
      toast.error(e.message);
      return;
    }
    setSaving(false);
    toast.success("Mess profile updated");
    qc.invalidateQueries({ queryKey: ["mess", messId] });
  }

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">মেস প্রোফাইল</h1>
        <p className="text-sm text-muted-foreground mt-1">আপনার মেসের মৌলিক তথ্য পরিবর্তন করুন</p>
      </div>

      <div className="rounded-2xl border bg-card p-6 space-y-4 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="name" className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" /> মেসের নাম *
          </Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="উদা: সোনালী মেস"
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground" /> কন্টাক্ট নম্বর
          </Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="উদা: 017XXXXXXXX"
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address" className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" /> ঠিকানা / লোকেশন
          </Label>
          <Textarea
            id="address"
            rows={3}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="উদা: মিরপুর ১০, ঢাকা"
            className="resize-none"
          />
        </div>

        <div className="pt-4">
          {!readOnly && (
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto gap-2 gradient-primary text-primary-foreground h-11 px-8">
            <Save className="w-4 h-4" />
            {saving ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
          </Button>
          )}
          {readOnly && <p className="text-sm text-muted-foreground">Read-only view: a mess_monitor cannot change the mess profile.</p>}
        </div>
      </div>

      <div className="rounded-2xl border bg-primary/5 p-6 space-y-2 border-primary/20">
        <h3 className="font-semibold text-primary">মেস আইডি:</h3>
        <p className="font-mono text-sm break-all opacity-80">{messId}</p>
        <p className="text-xs text-muted-foreground">
          এই আইডিটি সিস্টেমের অভ্যন্তরীণ ব্যবহারের জন্য।
        </p>
      </div>
    </div>
  );
}
