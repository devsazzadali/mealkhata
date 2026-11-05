import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Save, User } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { formatBdt, isValidBdPhone, normalizePhone } from "@/lib/phone";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfMonth } from "date-fns";

export default function Profile() {
  const { user, profile, loadProfileAndRoles } = useAuthStore();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile?.full_name, profile?.phone]);

  // Boarder data (if any)
  const { data: boarderData, isLoading } = useQuery({
    queryKey: ["profile-boarder", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const boarders = await apiGet<any[]>("boarders", { user_id: user!.id });
      const boarder = boarders[0] ?? null;
      if (!boarder) return null;

      const ms = startOfMonth(new Date()).toISOString().slice(0, 10);
      const [mealRows, deposits, stats] = await Promise.all([
        apiGet<any[]>("meal-entries", { boarder_id: boarder.id, order: "meal_date.desc" }),
        apiGet<any[]>("deposits", { boarder_id: boarder.id, order: "deposit_date.desc", limit: 20 }),
        apiGet<any[]>("stats/month", {
          mess_id: boarder.mess_id,
          year: new Date().getFullYear(),
          month: new Date().getMonth() + 1,
        }),
      ]);
      // apiGet has no gte filter: filter this month's meals in JS.
      const meals = mealRows.filter((m) => String(m.meal_date).slice(0, 10) >= ms);

      const totalMeals = meals.reduce(
        (s, m) => s + Number(m.breakfast) + Number(m.lunch) + Number(m.dinner),
        0,
      );
      const monthDeposit = (deposits ?? [])
        .filter((d) => String(d.deposit_date).slice(0, 10) >= ms)
        .reduce((s, d) => s + Number(d.amount), 0);
      const mealRate = Number(stats?.[0]?.meal_rate ?? 0);

      return { boarder, meals, deposits: deposits ?? [], totalMeals, monthDeposit, mealRate };
    },
  });

  const handleAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("bucket", "avatars");
      const upRes = await fetch("/api/upload", { method: "POST", body: form });
      const upJson = await upRes.json().catch(() => ({}));
      if (!upRes.ok) throw new Error(upJson.error || "Upload failed");
      const photoUrl: string = upJson.url;
      await apiPatch("profiles", user.id, { photo_url: photoUrl });
      // Also update boarder photo if linked
      if (boarderData?.boarder?.id) {
        await apiPatch("boarders", boarderData.boarder.id, { photo_url: photoUrl });
      }
      await loadProfileAndRoles();
      qc.invalidateQueries({ queryKey: ["profile-boarder"] });
      toast.success("Photo updated");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    if (!fullName.trim()) return toast.error("Name required");
    if (phone && !isValidBdPhone(phone)) return toast.error("Invalid phone");
    setSaving(true);
    try {
      await apiPatch("profiles", user.id, { full_name: fullName.trim(), phone: normalizePhone(phone) });
    } catch (e: any) {
      setSaving(false);
      return toast.error(e.message || "Save failed");
    }
    setSaving(false);
    await loadProfileAndRoles();
    toast.success("Profile saved");
  };

  const initials = (profile?.full_name || "U")
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and view your activity</p>
      </div>

      {/* Profile card */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar className="w-20 h-20 ring-2 ring-primary/20">
              <AvatarImage src={profile?.photo_url ?? undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:scale-105 transition-transform disabled:opacity-50"
              aria-label="Change photo"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && handleAvatar(e.target.files[0])}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg truncate">{profile?.full_name}</h2>
            <p className="text-sm text-muted-foreground truncate">{profile?.phone}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="017XXXXXXXX" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveProfile} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save changes
          </Button>
        </div>
      </div>

      {/* Boarder summary + history */}
      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : boarderData ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Balance" value={formatBdt(boarderData.boarder.balance)} icon={User} tone="primary" />
            <StatCard label="Meals (month)" value={String(boarderData.totalMeals)} icon={User} />
            <StatCard label="Deposit (month)" value={formatBdt(boarderData.monthDeposit)} icon={User} tone="success" />
            <StatCard label="Meal rate" value={formatBdt(boarderData.mealRate)} icon={User} />
          </div>

          <Tabs defaultValue="meals">
            <TabsList>
              <TabsTrigger value="meals">Meal history</TabsTrigger>
              <TabsTrigger value="deposits">Deposit history</TabsTrigger>
            </TabsList>
            <TabsContent value="meals" className="mt-4">
              <div className="rounded-2xl border bg-card overflow-hidden">
                {boarderData.meals.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">No meals this month</p>
                ) : (
                  <div className="divide-y">
                    {boarderData.meals.map((m: any) => {
                      const total = Number(m.breakfast) + Number(m.lunch) + Number(m.dinner);
                      return (
                        <div key={m.meal_date} className="flex items-center justify-between p-3 px-4">
                          <div>
                            <p className="text-sm font-medium">{format(new Date(m.meal_date), "EEE, dd MMM")}</p>
                            <p className="text-xs text-muted-foreground">
                              B: {m.breakfast} · L: {m.lunch} · D: {m.dinner}
                            </p>
                          </div>
                          <span className="text-sm font-semibold tabular-nums">{total}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="deposits" className="mt-4">
              <div className="rounded-2xl border bg-card overflow-hidden">
                {boarderData.deposits.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">No deposits yet</p>
                ) : (
                  <div className="divide-y">
                    {boarderData.deposits.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between p-3 px-4">
                        <div>
                          <p className="text-sm font-medium">{format(new Date(d.deposit_date), "dd MMM yyyy")}</p>
                          <p className="text-xs text-muted-foreground capitalize">{d.method}{d.reference ? ` · ${d.reference}` : ""}</p>
                        </div>
                        <span className="text-sm font-semibold text-success tabular-nums">+{formatBdt(d.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
