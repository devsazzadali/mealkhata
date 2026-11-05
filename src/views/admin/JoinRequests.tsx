import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { apiGet, apiPost } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMessAdmin } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function JoinRequests() {
  const { profile, roles } = useAuthStore();
  // Server rule (auth/approve-join-request): mess_admin / super_admin only.
  const canDecide = isMessAdmin(roles);
  const messId = profile?.mess_id;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["join-requests", messId],
    enabled: !!messId,
    queryFn: async () => {
      return apiGet<any[]>("join-requests", { mess_id: messId!, order: "created_at.desc" });
    },
  });

  // Realtime channel replaced by polling (see api.ts note).
  useEffect(() => {
    if (!messId) return;
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["join-requests", messId] });
    }, 15000);
    return () => clearInterval(t);
  }, [messId, qc]);

  const decide = async (id: string, action: "approve" | "reject") => {
    try {
      const res = await apiPost<any>("auth/approve-join-request", { request_id: id, action });
      if (res?.error) return toast.error(res.error);
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success(action === "approve" ? "Approved & added as boarder" : "Rejected");
    qc.invalidateQueries({ queryKey: ["join-requests", messId] });
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Join Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">People requesting to join your mess via the join key.</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <UserPlus className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No requests</p>
          <p className="text-sm text-muted-foreground mt-1">Share your join key from Settings.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((r: any) => (
            <div key={r.id} className="rounded-2xl border bg-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.requested_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.requested_phone} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </p>
                {r.message && <p className="text-xs mt-1 italic text-foreground/70">"{r.message}"</p>}
                {(r.local_guardian_name || r.nid_or_student_id) && (
                  <p className="text-xs mt-1 text-muted-foreground">
                    {r.local_guardian_name ? `Local guardian: ${r.local_guardian_name}${r.local_guardian_phone ? ` (${r.local_guardian_phone})` : ""}` : ""}
                    {r.nid_or_student_id ? ` · ID: ${r.nid_or_student_id}` : ""}
                    {r.rules_accepted ? " · Rules accepted" : " · Rules not accepted"}
                  </p>
                )}
              </div>
              {r.status === "pending" && canDecide ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => decide(r.id, "reject")}>
                    <X className="w-4 h-4" />
                  </Button>
                  <Button size="sm" onClick={() => decide(r.id, "approve")}>
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                </div>
              ) : (
                <Badge variant={r.status === "approved" ? "secondary" : "outline"} className={r.status === "approved" ? "bg-success/15 text-success" : ""}>
                  {r.status}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
