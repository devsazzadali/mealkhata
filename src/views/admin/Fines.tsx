import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { canEditFines, canApproveFines } from "@/lib/permissions";
import { FINE_TYPES, fineTypeLabel } from "@/lib/fines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBdt } from "@/lib/phone";

type FormState = { boarder_id: string; type: string; amount: string; year: string; month: string; notes: string };

export default function Fines() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const userId = useAuthStore((s) => s.user?.id);
  const roles = useAuthStore((s) => s.roles);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => {
    const now = new Date();
    return { boarder_id: "", type: "late_payment", amount: "", year: String(now.getFullYear()), month: String(now.getMonth() + 1), notes: "" };
  });
  const canCreate = canEditFines(roles);
  const canApprove = canApproveFines(roles);

  const { data: boarders } = useQuery({
    queryKey: ["boarders-active", messId],
    enabled: !!messId,
    queryFn: async () => {
      const all = await apiGet<any[]>("boarders", { mess_id: messId! });
      return all.filter((b) => b.status === "active").sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  const { data: fines, isLoading } = useQuery({
    queryKey: ["fines", messId],
    enabled: !!messId,
    queryFn: async () => {
      const rows = await apiGet<any[]>("fines", { mess_id: messId!, order: "created_at.desc" });
      const byId = new Map((boarders ?? []).map((b: any) => [b.id, b.full_name]));
      return rows.map((f: any) => ({ ...f, boarder_name: byId.get(f.boarder_id) ?? f.boarder_id }));
    },
  });

  const submit = async () => {
    if (!messId || !form.boarder_id || !form.amount) return toast.error("Boarder and amount are required");
    // Amount is always entered by the manager for this mess: there is no
    // universal tariff in FINE_TYPES (defaultAmount is null by design).
    try {
      await apiPost("fines", {
        mess_id: messId, boarder_id: form.boarder_id, type: form.type,
        amount: Number(form.amount), year: Number(form.year), month: Number(form.month),
        notes: form.notes || null,
      });
    } catch (e: any) { return toast.error(e.message); }
    toast.success("Fine created (pending approval)");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["fines"] });
  };

  const decide = async (f: any, status: "approved" | "rejected" | "waived") => {
    if (status === "approved" && f.created_by === userId) {
      return toast.error("You cannot approve your own fine");
    }
    try { await apiPatch("fines", f.id, { status }); } catch (e: any) { return toast.error(e.message); }
    toast.success(`Fine ${status}`);
    qc.invalidateQueries({ queryKey: ["fines"] });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Fines</h1>
          <p className="text-sm text-muted-foreground mt-1">Fine ledger — approved fines are added to the monthly bill. Amounts are set per mess, not a universal tariff.</p>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> New fine</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New fine</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Boarder</Label>
                  <Select value={form.boarder_id} onValueChange={(v) => setForm({ ...form, boarder_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select boarder" /></SelectTrigger>
                    <SelectContent>{boarders?.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Fine type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FINE_TYPES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Amount (৳)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Year</Label><Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Month</Label><Input type="number" min={1} max={12} value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label>Notes / basis</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={submit}>Create fine (pending)</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {!canCreate && !canApprove && (
        <p className="text-sm rounded-2xl border bg-card p-4">Read-only: only mess_admin, fine_manager (and super_admin) can create or approve fines.</p>
      )}
      {isLoading ? <Skeleton className="h-72 rounded-2xl" /> : !fines?.length ? (
        <div className="rounded-2xl border bg-card p-10 text-center"><p className="font-medium">No fines yet</p></div>
      ) : (
        <div className="space-y-2">
          {fines.map((f: any) => (
            <div key={f.id} className="rounded-2xl border bg-card p-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{f.boarder_name} · {fineTypeLabel(f.type)}</p>
                <p className="text-xs text-muted-foreground">{f.year}/{f.month}{f.notes ? ` · ${f.notes}` : ""}</p>
              </div>
              <span className="font-semibold">{formatBdt(f.amount)}</span>
              <Badge variant={f.status === "approved" ? "secondary" : "outline"}>{f.status}</Badge>
              {f.status === "pending" && canApprove && f.created_by !== userId && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => decide(f, "approved")}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(f, "waived")}>Waive</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(f, "rejected")}>Reject</Button>
                </div>
              )}
              {f.status === "pending" && f.created_by === userId && (
                <span className="text-xs text-muted-foreground">Awaiting another approver (self-approval is blocked)</span>
              )}
              {canCreate && (
                <Button size="icon" variant="outline" onClick={async () => { try { await apiDelete("fines", f.id); qc.invalidateQueries({ queryKey: ["fines"] }); } catch (e: any) { toast.error(e.message); } }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
