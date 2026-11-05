import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, UserPlus } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Skeleton } from "@/components/ui/skeleton";

type CheckItem = { key: string; label: string; done: boolean };

function checklistFor(b: Record<string, unknown>): CheckItem[] {
  return [
    { key: "name", label: "নাম ও ফোন", done: !!b.full_name && !!b.phone },
    { key: "guardian", label: "গার্ডিয়ান (নাম ও ফোন)", done: !!b.guardian_name && !!b.guardian_phone },
    { key: "local_guardian", label: "লোকাল গার্ডিয়ান (নাম ও ফোন)", done: !!b.local_guardian_name && !!b.local_guardian_phone },
    { key: "nid", label: "NID / স্টুডেন্ট আইডি", done: !!b.nid_or_student_id },
    { key: "rules", label: "মেসের নিয়মে সম্মতি (rules_accepted)", done: b.rules_accepted === true },
    { key: "seat", label: "রুম / সিট", done: !!b.room_id || !!b.seat_number },
    { key: "deposit", label: "মাসিক ডিপোজিট সেট", done: Number(b.monthly_deposit ?? 0) > 0 },
    { key: "join_date", label: "যোগদানের তারিখ", done: !!b.join_date },
  ];
}

export default function OnboardingChecklist() {
  const messId = useAuthStore((s) => s.profile?.mess_id);
  const { data: boarders, isLoading } = useQuery({
    queryKey: ["boarders", "onboarding-checklist", messId],
    enabled: !!messId,
    queryFn: async () => apiGet<Record<string, unknown>[]>("boarders", { mess_id: messId! }),
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">অনবোর্ডিং চেকলিস্ট</h1>
        <p className="text-sm text-muted-foreground mt-1">
          প্রতিটি সদস্যের যোগদানের তথ্য কতটা সম্পূর্ণ, তা এখানে দেখা যাবে। অসম্পূর্ণ তথ্য
          থাকলে সদস্যকে জানিয়ে পূরণ করান — rules_accepted ছাড়া নতুন সদস্য তৈরি/অনুমোদন করা যাবে না।
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : !boarders || boarders.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <UserPlus className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">কোনো সদস্য নেই</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {boarders.map((b) => {
            const items = checklistFor(b);
            const done = items.filter((i) => i.done).length;
            const pct = Math.round((done / items.length) * 100);
            return (
              <div key={String(b.id)} className="rounded-2xl border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{String(b.full_name)}</h3>
                    <p className="text-xs text-muted-foreground">{String(b.phone ?? "")} · {String(b.status ?? "")}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <ul className="space-y-1 pt-1">
                  {items.map((it) => (
                    <li key={it.key} className="flex items-center gap-2 text-sm">
                      {it.done ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                      <span className={it.done ? "" : "text-muted-foreground"}>{it.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
