import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiGet, apiPost } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useNotificationSound } from "@/hooks/useNotificationSound";

/**
 * Shows a full-screen popup for any unacknowledged emergency notice
 * in the user's mess. The user must click "বুঝেছি" to dismiss.
 * Refetches on realtime INSERT so it pops up immediately.
 */
export default function EmergencyNoticePopup() {
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const messId = profile?.mess_id;
  const userId = user?.id;
  const qc = useQueryClient();
  const { play } = useNotificationSound();
  const [acking, setAcking] = useState<string | null>(null);

  const { data: pending } = useQuery({
    queryKey: ["emergency-pending", messId, userId],
    enabled: !!messId && !!userId,
    queryFn: async () => {
      // Fetch recent emergency notices (last 7 days). The API has no
      // gte/.in() filters: fetch by mess/user and filter in JS.
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const allNotices = await apiGet<any[]>("notices", { mess_id: messId!, order: "created_at.desc" });
      const notices = allNotices.filter(
        (n: any) => n.is_emergency && String(n.created_at ?? "") >= since
      );

      const ids = (notices ?? []).map((n: any) => n.id);
      if (ids.length === 0) return [];

      const allAcks = await apiGet<any[]>("notice-acks", { user_id: userId! });
      const ackedSet = new Set(allAcks.filter((a: any) => ids.includes(a.notice_id)).map((a: any) => a.notice_id));
      return (notices ?? []).filter((n: any) => !ackedSet.has(n.id));
    },
  });

  // Realtime channel replaced by 15s polling: refresh when a new
  // emergency notice arrives.
  useEffect(() => {
    if (!messId) return;
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["emergency-pending", messId, userId] });
    }, 15000);
    return () => clearInterval(t);
  }, [messId, userId, qc]);

  const current = pending?.[0];

  // Play alarm when a new emergency popup is shown
  useEffect(() => {
    if (current) play("emergency");
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ack = async () => {
    if (!current || !userId) return;
    setAcking(current.id);
    try {
      await apiPost("notice-acks", { notice_id: current.id, user_id: userId });
    } catch {
      // Original code ignored insert errors; keep that behaviour.
    }
    setAcking(null);
    qc.invalidateQueries({ queryKey: ["emergency-pending", messId, userId] });
  };

  if (!current) return null;

  return (
    <Dialog open={true}>
      <DialogContent className="max-w-lg border-destructive/60 bg-card">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/15 text-destructive flex items-center justify-center animate-pulse">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <DialogTitle className="text-center text-destructive text-xl">
            🚨 জরুরি নোটিশ
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <h3 className="font-bold text-lg text-center">{current.title}</h3>
          <p className="text-sm whitespace-pre-wrap text-foreground/90 bg-destructive/5 border border-destructive/20 rounded-xl p-4">
            {current.content}
          </p>
          <p className="text-xs text-muted-foreground text-center">
            {formatDistanceToNow(new Date(current.created_at), { addSuffix: true })}
          </p>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button onClick={ack} disabled={!!acking} size="lg" className="min-w-32">
            {acking ? "..." : "বুঝেছি"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
