import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export default function Advertisements() {
  const { profile, user, roles } = useAuthStore();
  const messId = profile?.mess_id;
  const isAdmin = roles.includes("mess_admin") || roles.includes("super_admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", image_url: "", link_url: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["ads", messId],
    enabled: !!messId,
    queryFn: async () => {
      return apiGet<any[]>("advertisements", { mess_id: messId!, order: "created_at.desc" });
    },
  });

  const add = async () => {
    if (!form.title.trim() || !messId || !user) return toast.error("শিরোনাম দিন");
    try {
      await apiPost("advertisements", {
        mess_id: messId, created_by: user.id,
        title: form.title, body: form.body || null,
        image_url: form.image_url || null, link_url: form.link_url || null,
      });
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success("বিজ্ঞাপন যোগ হয়েছে");
    setOpen(false); setForm({ title: "", body: "", image_url: "", link_url: "" });
    qc.invalidateQueries({ queryKey: ["ads", messId] });
  };

  const toggleActive = async (id: string, active: boolean) => {
    await apiPatch("advertisements", id, { active: !active });
    qc.invalidateQueries({ queryKey: ["ads", messId] });
  };

  const remove = async (id: string) => {
    await apiDelete("advertisements", id);
    qc.invalidateQueries({ queryKey: ["ads", messId] });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">বিজ্ঞাপন</h1>
          <p className="text-sm text-muted-foreground mt-1">মেসের প্রচার ও ঘোষণা</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> নতুন</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>নতুন বিজ্ঞাপন</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>শিরোনাম</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>বিবরণ</Label><Textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>ছবির URL</Label><Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>লিংক URL</Label><Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} /></div>
                <Button onClick={add} className="w-full">যোগ করুন</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? <Skeleton className="h-64 rounded-2xl" /> : !data?.length ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Megaphone className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">কোনো বিজ্ঞাপন নেই</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((a: any) => (
            <div key={a.id} className="rounded-2xl border bg-card overflow-hidden">
              {a.image_url && <img src={a.image_url} alt={a.title} className="w-full aspect-video object-cover" />}
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{a.title}</h3>
                  <Badge variant={a.active ? "default" : "outline"}>{a.active ? "Active" : "Off"}</Badge>
                </div>
                {a.body && <p className="text-sm text-muted-foreground">{a.body}</p>}
                {a.link_url && <a href={a.link_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">লিংক দেখুন</a>}
                {isAdmin && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Switch checked={a.active} onCheckedChange={() => toggleActive(a.id, a.active)} />
                    <span className="text-xs text-muted-foreground flex-1">Active</span>
                    <Button size="icon" variant="outline" onClick={() => remove(a.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
