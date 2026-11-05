import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useNotificationSound } from "@/hooks/useNotificationSound";

/**
 * Polls (15s) for new events in the current user's mess and triggers
 * in-app notification sounds + toast notifications.
 *
 * Events handled:
 *  - new chat messages (skipped if user is on /chat page or sender)
 *  - emergency notices (always)
 *  - meal_request status updated (boarder hears when their request is decided)
 */
export default function NotificationManager() {
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const messId = profile?.mess_id;
  const userId = user?.id;
  const { play } = useNotificationSound();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname || "");
  pathnameRef.current = pathname || "";

  // Realtime channels replaced by 15s polling (see migration contract).
  // First poll seeds the seen-sets so existing rows don't re-toast;
  // later polls toast only for genuinely new/changed rows.
  const seenRef = useRef<{
    seeded: boolean;
    messages: Set<string>;
    notices: Set<string>;
    reqStatus: Map<string, string>;
  }>({ seeded: false, messages: new Set(), notices: new Set(), reqStatus: new Map() });

  useEffect(() => {
    if (!messId || !userId) return;

    const poll = async () => {
      try {
        const [messages, notices, reqs] = await Promise.all([
          apiGet<any[]>("messages", { mess_id: messId, order: "created_at.desc", limit: 50 }),
          apiGet<any[]>("notices", { mess_id: messId, order: "created_at.desc", limit: 50 }),
          apiGet<any[]>("meal-requests", { user_id: userId, order: "created_at.desc", limit: 50 }),
        ]);
        const seen = seenRef.current;
        if (!seen.seeded) {
          messages.forEach((m: any) => seen.messages.add(m.id));
          notices.forEach((n: any) => seen.notices.add(n.id));
          reqs.forEach((r: any) => seen.reqStatus.set(r.id, r.status));
          seen.seeded = true;
          return;
        }
        // New chat messages
        for (const msg of messages) {
          if (seen.messages.has(msg.id)) continue;
          seen.messages.add(msg.id);
          if (msg.sender_id === userId) continue; // own message
          if (pathnameRef.current.endsWith("/chat")) continue; // already on chat
          play("message");
          toast("নতুন মেসেজ এসেছে", {
            description: msg.content?.slice(0, 80) ?? "📷 ছবি",
          });
        }
        // Emergency notices
        for (const n of notices) {
          if (seen.notices.has(n.id)) continue;
          seen.notices.add(n.id);
          if (!n.is_emergency) continue;
          play("emergency");
          toast.error(`🚨 জরুরি: ${n.title}`, {
            description: n.content?.slice(0, 120),
            duration: 10000,
          });
        }
        // Meal request decision (own requests)
        for (const r of reqs) {
          const before = seen.reqStatus.get(r.id);
          seen.reqStatus.set(r.id, r.status);
          if (before === undefined || before === r.status) continue;
          if (r.status === "approved" || r.status === "rejected") {
            play("request");
            const ok = r.status === "approved";
            toast[ok ? "success" : "warning"](
              ok ? "আপনার মিল request approve হয়েছে" : "আপনার মিল request reject হয়েছে",
              { icon: <Megaphone className="w-4 h-4" /> }
            );
          }
        }
      } catch {
        // Poll failures are transient; next tick retries. No toast spam.
      }
    };

    void poll();
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, [messId, userId, play]);

  return null;
}
