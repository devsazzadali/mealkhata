import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isValidBdPhone, normalizePhone } from "@/lib/phone";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  full_name: z.string().trim().min(2, "Required").max(80),
  phone: z.string().refine(isValidBdPhone, "Valid BD mobile required (017XXXXXXXX)"),
  password: z.string().min(6, "At least 6 characters"),
  guardian_name: z.string().max(80).optional().or(z.literal("")),
  guardian_phone: z.string().optional().or(z.literal("")),
  local_guardian_name: z.string().max(80).optional().or(z.literal("")),
  local_guardian_phone: z.string().optional().or(z.literal("")),
  nid_or_student_id: z.string().max(40).optional().or(z.literal("")),
  rules_accepted: z.boolean().optional(),
  seat_number: z.string().max(20).optional().or(z.literal("")),
  monthly_deposit: z.coerce.number().min(0).optional(),
  rice_balance: z.coerce.number().min(0).optional(),
  notes: z.string().max(300).optional().or(z.literal("")),
});
type Vals = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CreateBoarderDialog({ open, onOpenChange }: Props) {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Vals>({
    resolver: zodResolver(schema),
    defaultValues: { monthly_deposit: 0, rice_balance: 0 },
  });

  const onSubmit = async (vals: Vals) => {
    if (!messId) return toast.error("No mess assigned");
    setSubmitting(true);
    try {
      const json = await apiPost<any>("auth/create-boarder", {
        full_name: vals.full_name,
        phone: normalizePhone(vals.phone),
        password: vals.password,
        guardian_name: vals.guardian_name || undefined,
        guardian_phone: vals.guardian_phone || undefined,
        local_guardian_name: vals.local_guardian_name || undefined,
        local_guardian_phone: vals.local_guardian_phone || undefined,
        nid_or_student_id: vals.nid_or_student_id || undefined,
        rules_accepted: vals.rules_accepted ?? false,
        seat_number: vals.seat_number || undefined,
        monthly_deposit: vals.monthly_deposit ?? 0,
        rice_balance: vals.rice_balance ?? 0,
        notes: vals.notes || undefined,
      });
      if (json?.error) throw new Error(json.error);

      toast.success("Boarder added", {
        description: `Login: ${normalizePhone(vals.phone)} / ${vals.password}`,
      });
      qc.invalidateQueries({ queryKey: ["boarders", messId] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Boarder</DialogTitle>
          <DialogDescription>
            Creates a login account so the boarder can sign in with their mobile number.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="full_name" label="Full Name *" reg={register("full_name")} err={errors.full_name?.message} />
            <Field id="phone" label="Mobile *" placeholder="017XXXXXXXX" reg={register("phone")} err={errors.phone?.message} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="password" type="password" label="Initial Password *" reg={register("password")} err={errors.password?.message} />
            <Field id="seat_number" label="Seat Number" reg={register("seat_number")} err={errors.seat_number?.message} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="guardian_name" label="Guardian Name" reg={register("guardian_name")} err={errors.guardian_name?.message} />
            <Field id="guardian_phone" label="Guardian Phone" reg={register("guardian_phone")} err={errors.guardian_phone?.message} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="local_guardian_name" label="Local Guardian Name" reg={register("local_guardian_name")} err={errors.local_guardian_name?.message} />
            <Field id="local_guardian_phone" label="Local Guardian Phone" reg={register("local_guardian_phone")} err={errors.local_guardian_phone?.message} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="nid_or_student_id" label="NID / Student ID" reg={register("nid_or_student_id")} err={errors.nid_or_student_id?.message} />
            <div className="space-y-2 flex items-end gap-2 pb-1">
              <input id="rules_accepted" type="checkbox" {...register("rules_accepted")} className="h-4 w-4" />
              <Label htmlFor="rules_accepted">Mess rules accepted</Label>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="monthly_deposit" type="number" label="Monthly Deposit (৳)" reg={register("monthly_deposit")} err={errors.monthly_deposit?.message} />
            <Field id="rice_balance" type="number" label="Initial Rice (Gram)" reg={register("rice_balance")} err={errors.rice_balance?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} {...register("notes")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting} className="gradient-primary text-primary-foreground">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Boarder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, type = "text", placeholder, reg, err }: any) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} placeholder={placeholder} {...reg} />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
