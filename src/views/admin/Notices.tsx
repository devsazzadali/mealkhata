import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Megaphone, Pin, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function Notices() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const userId = useAuthStore((s) => s.user?.id);
  const roles = useAuthStore((s) => s.roles);
  // Server rule (api-server.ts): a read-only mess_monitor may not write Notices.
  const readOnly = isMonitorOnly(roles);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", is_pinned: false, is_emergency: false });

  const { data: notices, isLoading } = useQuery({
    queryKey: ["notices", messId],
    enabled: !!messId,
    queryFn: async () => {
      // API supports one order key only: order by created_at, then sort
      // pinned-first in JS (original: is_pinned desc, created_at desc).
      const rows = await apiGet<any[]>("notices", { mess_id: messId!, order: "created_at.desc" });
      return [...rows].sort((a: any, b: any) => Number(b.is_pinned) - Number(a.is_pinned));
    },
  });

  async function handleCreate() {
    if (!messId || !form.title.trim() || !form.content.trim()) return;
    try {
      await apiPost("notices", {
        mess_id: messId,
        title: form.title.trim(),
        content: form.content.trim(),
        is_pinned: form.is_pinned,
        is_emergency: form.is_emergency,
        created_by: userId,
      });
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success(form.is_emergency ? "🚨 জরুরি notice পাঠানো হয়েছে" : "Notice published");
    setOpen(false);
    setForm({ title: "", content: "", is_pinned: false, is_emergency: false });
    qc.invalidateQueries({ queryKey: ["notices", messId] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this notice?")) return;
    try {
      await apiDelete("notices", id);
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["notices", messId] });
  }

  async function togglePin(id: string, current: boolean) {
    await apiPatch("notices", id, { is_pinned: !current });
    qc.invalidateQueries({ queryKey: ["notices", messId] });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Notices</h1>
          <p className="text-sm text-muted-foreground mt-1">Announcements visible to all boarders</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          {!readOnly && (
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> New Notice</Button>
          </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader><DialogTitle>Publish Notice</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <Label className="cursor-pointer">Pin to top</Label>
                  <p className="text-[11px] text-muted-foreground">Pinned notices appear first.</p>
                </div>
                <Switch checked={form.is_pinned} onCheckedChange={(v) => setForm({ ...form, is_pinned: v })} />
              </div>
              <div className={`flex items-center justify-between rounded-xl border p-3 ${form.is_emergency ? "border-destructive/60 bg-destructive/5" : ""}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`w-4 h-4 mt-0.5 ${form.is_emergency ? "text-destructive" : "text-muted-foreground"}`} />
                  <div>
                    <Label className="cursor-pointer">Emergency 🚨</Label>
                    <p className="text-[11px] text-muted-foreground">সবার phone-এ alarm sound + full-screen popup আসবে।</p>
                  </div>
                </div>
                <Switch checked={form.is_emergency} onCheckedChange={(v) => setForm({ ...form, is_emergency: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate}>Publish</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : notices?.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <Megaphone className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No notices yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices?.map((n) => (
            <div key={n.id} className={`rounded-2xl border bg-card p-4 ${(n as any).is_emergency ? "border-destructive/60 bg-destructive/5" : n.is_pinned ? "border-primary/50" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{n.title}</h3>
                    {(n as any).is_emergency && <Badge className="bg-destructive text-destructive-foreground gap-1"><AlertTriangle className="w-3 h-3" /> Emergency</Badge>}
                    {n.is_pinned && <Badge variant="outline" className="border-primary text-primary gap-1"><Pin className="w-3 h-3" /> Pinned</Badge>}
                  </div>
                  <p className="text-sm text-foreground/80 mt-1.5 whitespace-pre-wrap">{n.content}</p>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                {!readOnly && (
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => togglePin(n.id, n.is_pinned)}>
                    <Pin className={`w-4 h-4 ${n.is_pinned ? "fill-primary text-primary" : ""}`} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(n.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
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
