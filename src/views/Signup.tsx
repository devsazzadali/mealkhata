"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, UtensilsCrossed, ArrowLeft } from "lucide-react";
import { isValidBdPhone, normalizePhone } from "@/lib/phone";
import { apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().refine(isValidBdPhone, "Enter a valid mobile (017XXXXXXXX)"),
  password: z.string().min(6, "At least 6 characters"),
});
type Vals = z.infer<typeof schema>;

export default function Signup() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Vals>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (vals: Vals) => {
    setSubmitting(true);
    try {
      const phone = normalizePhone(vals.phone);

      await apiPost("auth/signup", { full_name: vals.full_name, phone, password: vals.password });
      await apiPost("auth/login", { phone, password: vals.password });

      toast.success("Account created!");
      router.push("/onboarding");
    } catch (e: any) {
      toast.error(e.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-subtle flex items-center justify-center p-4">
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-primary-glow/20 blur-3xl" />

      <div className="w-full max-w-md animate-fade-in">
        <Link href="/login" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to login
        </Link>

        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-glow mb-3">
            <UtensilsCrossed className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-foreground mt-1">Then create or join a mess</p>
        </div>

        <div className="glass rounded-2xl p-6 sm:p-7 shadow-lg space-y-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field id="full_name" label="Your Name" placeholder="Md. Karim" reg={register("full_name")} err={errors.full_name?.message} />
            <Field id="phone" label="Mobile Number" placeholder="017XXXXXXXX" reg={register("phone")} err={errors.phone?.message} />
            <Field id="password" type="password" label="Password" placeholder="••••••••" reg={register("password")} err={errors.password?.message} />

            <Button type="submit" disabled={submitting} className="w-full h-11 gradient-primary text-primary-foreground font-medium shadow-md hover:shadow-glow transition-all">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create account & continue"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, placeholder, type = "text", reg, err }: any) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} placeholder={placeholder} className="h-11" {...reg} />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
