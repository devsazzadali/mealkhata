import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export default function Events() {
  const { profile, user, roles } = useAuthStore();
  const messId = profile?.mess_id;
  const isAdmin = roles.includes("mess_admin") || roles.includes("super_admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", event_date: format(new Date(), "yyyy-MM-dd"), event_time: "", location: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["events", messId],
    enabled: !!messId,
    queryFn: async () => {
      return apiGet<any[]>("events", { mess_id: messId!, order: "event_date.asc" });
    },
  });

  const add = async () => {
    if (!form.title.trim() || !messId || !user) return toast.error("শিরোনাম দিন");
    try {
      await apiPost("events", {
        mess_id: messId, created_by: user.id,
        title: form.title, description: form.description || null,
        event_date: form.event_date, event_time: form.event_time || null, location: form.location || null,
      });
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success("ইভেন্ট যোগ হয়েছে");
    setOpen(false);
    setForm({ title: "", description: "", event_date: format(new Date(), "yyyy-MM-dd"), event_time: "", location: "" });
    qc.invalidateQueries({ queryKey: ["events", messId] });
  };

  const remove = async (id: string) => {
    await apiDelete("events", id);
    qc.invalidateQueries({ queryKey: ["events", messId] });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ইভেন্ট</h1>
          <p className="text-sm text-muted-foreground mt-1">আসন্ন অনুষ্ঠান ও মিটিং</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> নতুন</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>নতুন ইভেন্ট</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>শিরোনাম</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>বিবরণ</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5"><Label>তারিখ</Label><Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>সময়</Label><Input type="time" value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label>স্থান</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                <Button onClick={add} className="w-full">যোগ করুন</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? <Skeleton className="h-64 rounded-2xl" /> : !data?.length ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <CalendarDays className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">কোনো ইভেন্ট নেই</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((e: any) => (
            <div key={e.id} className="rounded-2xl border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{e.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(e.event_date), "dd MMM yyyy")}
                    {e.event_time && ` · ${e.event_time}`}
                    {e.location && ` · ${e.location}`}
                  </p>
                </div>
                {isAdmin && (
                  <Button size="icon" variant="outline" onClick={() => remove(e.id)}><Trash2 className="w-4 h-4" /></Button>
                )}
              </div>
              {e.description && <p className="text-sm">{e.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
