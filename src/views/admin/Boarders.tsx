import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Phone, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatBdt } from "@/lib/phone";
import { CreateBoarderDialog } from "@/components/boarders/CreateBoarderDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Boarders() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const roles = useAuthStore((s) => s.roles);
  // Server rule (api-server.ts): a read-only mess_monitor may not write this model.
  const readOnly = isMonitorOnly(roles);

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "due">("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: boarders, isLoading } = useQuery({
    queryKey: ["boarders", messId],
    enabled: !!messId,
    queryFn: async () => {
      return apiGet<any[]>("boarders", { mess_id: messId!, order: "created_at.desc" });
    },
  });

  const filtered = (boarders ?? []).filter((b) => {
    const matchesSearch =
      !search ||
      b.full_name.toLowerCase().includes(search.toLowerCase()) ||
      b.phone.includes(search);
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && b.status === "active") ||
      (filter === "due" && Number(b.balance) < 0);
    return matchesSearch && matchesFilter;
  });

  const handleDelete = async (id: string) => {
    try {
      await apiDelete("boarders", id);
    } catch (e: any) {
      toast.error(e.message);
      return;
    }
    toast.success("Boarder removed");
    qc.invalidateQueries({ queryKey: ["boarders", messId] });
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Boarders</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your mess members</p>
        </div>
        {!readOnly && (
        <Button onClick={() => setOpen(true)} className="gradient-primary text-primary-foreground shadow-md hover:shadow-glow transition-all">
          <Plus className="w-4 h-4 mr-1.5" /> Add Boarder
        </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone…" className="pl-9 h-10" />
        </div>
        <div className="flex gap-1.5">
          {(["all", "active", "due"] as const).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className={filter === f ? "gradient-primary text-primary-foreground" : ""}>
              {f === "all" ? "All" : f === "active" ? "Active" : "Due"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onAdd={() => setOpen(true)} hasAny={(boarders ?? []).length > 0} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((b) => {
            const balance = Number(b.balance);
            const initials = b.full_name.split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase();
            return (
              <div key={b.id} className="rounded-2xl border bg-card p-4 hover:shadow-md transition-all flex items-center gap-4">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{b.full_name}</p>
                    <Badge variant={b.status === "active" ? "default" : "secondary"} className={b.status === "active" ? "bg-success/15 text-success hover:bg-success/15" : ""}>
                      {b.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{b.phone}</span>
                    {b.seat_number && <span>Seat {b.seat_number}</span>}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1 px-2">
                  <div className="flex flex-col items-end">
                    <p className={`font-bold tabular-nums text-sm ${balance < 0 ? "text-destructive" : "text-success"}`}>
                      {formatBdt(balance)}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">টাকা</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <p className="font-bold tabular-nums text-sm text-primary">
                      {Number(b.rice_balance || 0).toLocaleString()} <span className="text-[10px] font-normal">গ্রাম</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">চাউল</p>
                  </div>
                </div>
                {!readOnly && (
                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(b.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateBoarderDialog open={open} onOpenChange={setOpen} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this boarder?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the boarder record and all their meals, deposits, and balance history. This cannot be undone.
              The user account remains so they can no longer log in via this mess.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && handleDelete(confirmDelete)} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ onAdd, hasAny }: { onAdd: () => void; hasAny: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-10 text-center">
      <div className="w-14 h-14 rounded-2xl gradient-primary/20 mx-auto flex items-center justify-center mb-3 bg-primary/10">
        <Users className="w-7 h-7 text-primary" />
      </div>
      <h3 className="font-semibold">{hasAny ? "No boarders match your filters" : "No boarders yet"}</h3>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        {hasAny ? "Try clearing the search or filters." : "Add your first boarder to get started."}
      </p>
      {!hasAny && (
        <Button onClick={onAdd} className="gradient-primary text-primary-foreground">
          <Plus className="w-4 h-4 mr-1.5" /> Add Boarder
        </Button>
      )}
    </div>
  );
}
