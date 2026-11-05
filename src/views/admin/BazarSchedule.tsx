import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { canEditBazar } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

export default function BazarSchedule() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const roles = useAuthStore((s) => s.roles);
  const canEdit = canEditBazar(roles);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [boarderId, setBoarderId] = useState("");
  const [boarderId2, setBoarderId2] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  const { data: boarders } = useQuery({
    queryKey: ["boarders-active", messId],
    enabled: !!messId,
    queryFn: async () => {
      const all = await apiGet<any[]>("boarders", { mess_id: messId! });
      return all.filter((b) => b.status === "active").sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["bazar-schedule", messId],
    enabled: !!messId,
    queryFn: async () => {
      // Generic API returns plain rows (no FK joins), so attach boarder names in JS.
      const [rows, allBoarders] = await Promise.all([
        apiGet<any[]>("bazar-schedule", { mess_id: messId!, order: "schedule_date.asc" }),
        apiGet<any[]>("boarders", { mess_id: messId! }),
      ]);
      const byId = new Map(allBoarders.map((b) => [b.id, b]));
      return rows.map((s) => ({
        ...s,
        boarder1: s.boarder_id ? { full_name: byId.get(s.boarder_id)?.full_name } : null,
        boarder2: s.boarder_id2 ? { full_name: byId.get(s.boarder_id2)?.full_name } : null,
      }));
    },
  });

  const add = async () => {
    if (!canEdit) return toast.error("Only bazar_manager / mess_admin can edit bazar schedule");
    if (!boarderId || !date || !messId) return toast.error("কমপক্ষে একজন সদস্য এবং তারিখ প্রয়োজন");
    try {
      await apiPost("bazar-schedule", {
        mess_id: messId,
        boarder_id: boarderId,
        boarder_id2: boarderId2 || null,
        schedule_date: date,
        notes: notes || null,
      });
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success("শিডিউল যোগ হয়েছে");
    setOpen(false); setBoarderId(""); setBoarderId2(""); setNotes("");
    qc.invalidateQueries({ queryKey: ["bazar-schedule", messId] });
  };

  const toggleDone = async (id: string, done: boolean) => {
    if (!canEdit) return toast.error("Only bazar_manager / mess_admin can edit bazar schedule");
    await apiPatch("bazar-schedule", id, { done: !done });
    qc.invalidateQueries({ queryKey: ["bazar-schedule", messId] });
  };

  const remove = async (id: string) => {
    if (!canEdit) return toast.error("Only bazar_manager / mess_admin can edit bazar schedule");
    await apiDelete("bazar-schedule", id);
    qc.invalidateQueries({ queryKey: ["bazar-schedule", messId] });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">বাজার শিডিউল</h1>
          <p className="text-sm text-muted-foreground mt-1">কোন তারিখে কে বাজার করবে</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          {canEdit && (<DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> নতুন</Button>
          </DialogTrigger>)}
          <DialogContent>
            <DialogHeader><DialogTitle>বাজার শিডিউল</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>সদস্য</Label>
                <Select value={boarderId} onValueChange={setBoarderId}>
                  <SelectTrigger><SelectValue placeholder="প্রথম সদস্য" /></SelectTrigger>
                  <SelectContent>
                    {boarders?.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>সদস্য ২ (ঐচ্ছিক)</Label>
                <Select value={boarderId2} onValueChange={setBoarderId2}>
                  <SelectTrigger><SelectValue placeholder="দ্বিতীয় সদস্য বাছাই (যদি থাকে)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">কেউ না</SelectItem>
                    {boarders?.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>তারিখ</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>নোট (optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="মাছ, সবজি..." />
              </div>
              <Button onClick={add} className="w-full">যোগ করুন</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <Skeleton className="h-72 rounded-2xl" /> : !data?.length ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <CalendarClock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">কোনো শিডিউল নেই</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((s: any) => (
            <div key={s.id} className="rounded-2xl border bg-card p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium">
                  {s.boarder1?.full_name}
                  {s.boarder2?.full_name && ` & ${s.boarder2.full_name}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(s.schedule_date), "EEEE, dd MMM yyyy")}
                  {s.notes && ` · ${s.notes}`}
                </p>
              </div>
              <Badge variant={s.done ? "default" : "outline"}>{s.done ? "Done" : "Pending"}</Badge>
              <Button size="icon" variant="outline" disabled={!canEdit} onClick={() => toggleDone(s.id, s.done)}>
                <Check className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="outline" disabled={!canEdit} onClick={() => remove(s.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
