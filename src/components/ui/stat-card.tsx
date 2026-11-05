import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "primary" | "warning" | "success" | "destructive";
  className?: string;
}

const tones: Record<NonNullable<Props["tone"]>, string> = {
  default: "from-muted/40 to-muted/10 text-foreground",
  primary: "from-primary/15 to-primary-glow/5 text-primary",
  warning: "from-warning/15 to-warning/5 text-warning",
  success: "from-success/15 to-success/5 text-success",
  destructive: "from-destructive/15 to-destructive/5 text-destructive",
};

export function StatCard({ label, value, hint, icon: Icon, tone = "default", className }: Props) {
  return (
    <div className={cn("relative rounded-2xl border bg-card p-4 sm:p-5 shadow-sm hover:shadow-md transition-all overflow-hidden", className)}>
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60 pointer-events-none", tones[tone])} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-1.5 tracking-tight">{value}</p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        <div className={cn("w-10 h-10 rounded-xl bg-background/70 flex items-center justify-center shrink-0", tones[tone])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
