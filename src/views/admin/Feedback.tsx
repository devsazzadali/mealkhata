import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareHeart, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export default function Feedback() {
  const { profile, user, roles } = useAuthStore();
  const messId = profile?.mess_id;
  const isAdmin = roles.includes("mess_admin") || roles.includes("super_admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["feedback", messId],
    enabled: !!messId,
    queryFn: async () => {
      return apiGet<any[]>("feedback", { mess_id: messId!, order: "created_at.desc" });
    },
  });

  const submit = async () => {
    if (!subject.trim() || !message.trim() || !messId || !user) return toast.error("পূরণ করুন");
    setSubmitting(true);
    try {
      await apiPost("feedback", {
        mess_id: messId, user_id: user.id, subject, message, rating,
      });
    } catch (e: any) {
      setSubmitting(false);
      return toast.error(e.message);
    }
    setSubmitting(false);
    toast.success("ফিডব্যাক জমা হয়েছে");
    setOpen(false); setSubject(""); setMessage(""); setRating(5);
    qc.invalidateQueries({ queryKey: ["feedback", messId] });
  };

  const setStatus = async (id: string, status: string) => {
    await apiPatch("feedback", id, { status });
    qc.invalidateQueries({ queryKey: ["feedback", messId] });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ফিডব্যাক</h1>
          <p className="text-sm text-muted-foreground mt-1">মেস সম্পর্কে আপনার মতামত</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> নতুন ফিডব্যাক</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>আপনার মতামত</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>বিষয়</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>মেসেজ</Label>
                <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>রেটিং (1-5)</Label>
                <Input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} />
              </div>
              <Button onClick={submit} disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "সাবমিট"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <Skeleton className="h-64 rounded-2xl" /> : !data?.length ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <MessageSquareHeart className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">কোনো ফিডব্যাক নেই</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((f: any) => (
            <div key={f.id} className="rounded-2xl border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{f.subject}</h3>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                    {f.rating && ` · ⭐ ${f.rating}/5`}
                  </p>
                </div>
                <Badge variant={f.status === "resolved" ? "default" : "outline"}>{f.status}</Badge>
              </div>
              <p className="text-sm">{f.message}</p>
              {isAdmin && f.status !== "resolved" && (
                <Button size="sm" variant="outline" onClick={() => setStatus(f.id, "resolved")}>
                  Mark Resolved
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
