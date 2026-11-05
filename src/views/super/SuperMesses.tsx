import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, Users, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { normalizePhone } from "@/lib/phone";

const schema = z.object({
  mess_name: z.string().trim().min(2, "Mess name required").max(100),
  address: z.string().max(200).optional(),
  mess_phone: z.string().max(20).optional(),
  admin_full_name: z.string().trim().min(2, "Name required").max(100),
  admin_phone: z.string().refine((v) => /^01[3-9]\d{8}$/.test(normalizePhone(v)), "Invalid BD mobile"),
  admin_password: z.string().min(6, "At least 6 characters"),
});
type FormVals = z.infer<typeof schema>;

export default function SuperMesses() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: messes, isLoading } = useQuery({
    queryKey: ["super-messes"],
    queryFn: async () => {
      return await apiGet<any[]>("messes", { order: "created_at.desc" });
    },
  });

  // Counts per mess (boarders & admins)
  const { data: stats } = useQuery({
    queryKey: ["super-mess-stats"],
    queryFn: async () => {
      const [boarders, roles] = await Promise.all([
        apiGet<any[]>("boarders"),
        apiGet<any[]>("user-roles", { role: "mess_admin" }),
      ]);
      const map: Record<string, { boarders: number; admins: number }> = {};
      for (const b of boarders ?? []) {
        if (!b.mess_id) continue;
        map[b.mess_id] ??= { boarders: 0, admins: 0 };
        map[b.mess_id].boarders++;
      }
      for (const r of roles ?? []) {
        if (!r.mess_id) continue;
        map[r.mess_id] ??= { boarders: 0, admins: 0 };
        map[r.mess_id].admins++;
      }
      return map;
    },
  });

  const form = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      mess_name: "", address: "", mess_phone: "",
      admin_full_name: "", admin_phone: "", admin_password: "",
    },
  });

  const onSubmit = async (vals: FormVals) => {
    try {
      await apiPost("auth/super-create-mess", { ...vals, admin_phone: normalizePhone(vals.admin_phone) });
    } catch (e: any) {
      toast.error(e.message || "Failed");
      return;
    }
    toast.success("Mess + admin created");
    setOpen(false);
    form.reset();
    qc.invalidateQueries({ queryKey: ["super-messes"] });
    qc.invalidateQueries({ queryKey: ["super-mess-stats"] });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Platform Messes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create new messes and assign their managers.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-glow"><Plus className="w-4 h-4 mr-1" /> New Mess</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Mess + Admin</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Mess</p>
                </div>
                <FormField name="mess_name" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Mess Name *</FormLabel><FormControl><Input {...field} placeholder="Mirpur Boys Mess" /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField name="address" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField name="mess_phone" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Mess Phone</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                </div>

                <div className="space-y-1 pt-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Manager (Mess Admin)</p>
                </div>
                <FormField name="admin_full_name" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Full Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField name="admin_phone" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Mobile *</FormLabel><FormControl><Input {...field} placeholder="017XXXXXXXX" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField name="admin_password" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Initial Password *</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Creating…" : "Create Mess"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : !messes || messes.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No messes yet</p>
          <p className="text-sm text-muted-foreground mt-1">Click "New Mess" to add one.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {messes.map((m) => {
            const s = stats?.[m.id] ?? { boarders: 0, admins: 0 };
            return (
              <div key={m.id} className="rounded-2xl border bg-card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-md">
                    <Building2 className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <Badge variant="secondary" className={m.status === "active" ? "bg-success/15 text-success" : ""}>
                    {m.status}
                  </Badge>
                </div>
                <h3 className="font-semibold mt-3 truncate">{m.name}</h3>
                {m.address && <p className="text-xs text-muted-foreground truncate">{m.address}</p>}
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {s.boarders}</span>
                  <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> {s.admins}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
