import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, UtensilsCrossed, Wallet, Receipt, Package,
  Megaphone, Settings, Calculator, MessageCircle, UserPlus, User,
  Zap, FileText, BarChart3, Image as ImageIcon, CalendarClock,
  MessageSquareHeart, CalendarDays, ShoppingCart, Building2, Wheat
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

const adminItems = [
  { group: "সারসংক্ষেপ", items: [
    { to: "/app", label: "ড্যাশবোর্ড", icon: LayoutDashboard, end: true },
    { to: "/app/reports", label: "রিপোর্ট", icon: BarChart3 },
  ]},
  { group: "সদস্য ও মিল", items: [
    { to: "/app/boarders", label: "সদস্যবৃন্দ", icon: Users },
    { to: "/app/daily-menu", label: "আজকের মেনু", icon: UtensilsCrossed },
    { to: "/app/meals", label: "মিল ব্যবস্থাপনা", icon: Calculator },
    { to: "/app/meal-requests", label: "মিল রিকোয়েস্ট", icon: UtensilsCrossed },
  ]},
  { group: "হিসাব-নিকাশ", items: [
    { to: "/app/balance", label: "ব্যালেন্স", icon: Wallet },
    { to: "/app/expenses", label: "বাজার ও খরচ", icon: ShoppingCart },
    { to: "/app/deposits", label: "টাকা জমা (ডিপোজিট)", icon: Wallet },
    { to: "/app/extra-bills", label: "এক্সট্রা বিল (বিদ্যুৎ/খালা)", icon: Zap },
    { to: "/app/monthly-bills", label: "মাসিক বিল ও পেমেন্ট", icon: Receipt },
    { to: "/app/fines", label: "জরিমানা (Fines)", icon: FileText },
  ]},
  { group: "মেস ব্যবস্থাপনা", items: [
    { to: "/app/mess-profile", label: "মেস প্রোফাইল", icon: Building2 },
    { to: "/app/settings", label: "মেস সেটিংস", icon: Settings },
    { to: "/app/stock", label: "স্টক", icon: Package },
    { to: "/app/rice-management", label: "চাউল ব্যবস্থাপনা", icon: Wheat },
    { to: "/app/bazar-schedule", label: "বাজার শিডিউল", icon: CalendarClock },
    { to: "/app/join-requests", label: "জয়েন রিকোয়েস্ট", icon: UserPlus },
    { to: "/app/onboarding-checklist", label: "অনবোর্ডিং চেকলিস্ট", icon: UserPlus },
  ]},
  { group: "অন্যান্য", items: [
    { to: "/app/chat", label: "গ্রুপ চ্যাট", icon: MessageCircle },
    { to: "/app/notices", label: "নোটিশ বোর্ড", icon: Megaphone },
    { to: "/app/gallery", label: "গ্যালারি", icon: ImageIcon },
    { to: "/app/events", label: "ইভেন্ট", icon: CalendarDays },
    { to: "/app/feedback", label: "ফিডব্যাক", icon: MessageSquareHeart },
    { to: "/app/ads", label: "বিজ্ঞাপন", icon: Megaphone },
  ]},
];

const boarderItems = [
  { group: "আমার ড্যাশবোর্ড", items: [
    { to: "/me", label: "ড্যাশবোর্ড", icon: LayoutDashboard, end: true },
    { to: "/me/bills", label: "আমার বিল", icon: Receipt },
    { to: "/me/deposits", label: "আমার ডিপোজিট", icon: Wallet },
  ]},
  { group: "মেস তথ্য", items: [
    { to: "/me/expenses", label: "মেসের খরচ", icon: ShoppingCart },
    { to: "/me/bazar", label: "বাজার শিডিউল", icon: CalendarClock },
    { to: "/me/daily-menu", label: "আজকের মেনু", icon: UtensilsCrossed },
    { to: "/me/chat", label: "গ্রুপ চ্যাট", icon: MessageCircle },
  ]},
  { group: "অন্যান্য", items: [
    { to: "/me/gallery", label: "গ্যালারি", icon: ImageIcon },
    { to: "/me/events", label: "ইভেন্ট", icon: CalendarDays },
    { to: "/me/feedback", label: "ফিডব্যাক", icon: MessageSquareHeart },
    { to: "/me/profile", label: "প্রোফাইল", icon: User },
  ]},
];

const monitorItems = [
  { group: "দেখুন (read-only)", items: [
    { to: "/app", label: "ড্যাশবোর্ড", icon: LayoutDashboard, end: true },
    { to: "/app/reports", label: "রিপোর্ট", icon: BarChart3 },
    { to: "/app/balance", label: "ব্যালেন্স", icon: Wallet },
    { to: "/app/monthly-bills", label: "মাসিক বিল ও পেমেন্ট", icon: Receipt },
    { to: "/app/extra-bills", label: "এক্সট্রা বিল (বিদ্যুৎ/খালা)", icon: Zap },
  ]},
  { group: "অন্যান্য", items: [
    { to: "/app/chat", label: "গ্রুপ চ্যাট", icon: MessageCircle },
    { to: "/app/notices", label: "নোটিশ বোর্ড", icon: Megaphone },
    { to: "/app/feedback", label: "ফিডব্যাক", icon: MessageSquareHeart },
    { to: "/app/gallery", label: "গ্যালারি", icon: ImageIcon },
    { to: "/app/events", label: "ইভেন্ট", icon: CalendarDays },
  ]},
];

export function isMonitorOnly(roles: string[]): boolean {
  return roles.includes("mess_monitor") && !roles.some((r) =>
    ["mess_admin", "super_admin", "meal_manager", "bazar_manager", "fine_manager"].includes(r));
}

function useNavItems() {
  const roles = useAuthStore((s) => s.roles);
  if (isMonitorOnly(roles)) return monitorItems;
  const isAdmin = roles.includes("mess_admin") || roles.includes("super_admin");
  return isAdmin ? adminItems : boarderItems;
}

export function AppSidebar() {
  const pathname = usePathname();
  const groups = useNavItems();

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground">
      <div className="h-16 flex items-center px-5 border-b shrink-0">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center mr-2 shadow-md">
          <UtensilsCrossed className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-lg">Meal<span className="text-gradient">Khata</span></span>
      </div>
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto custom-scrollbar">
        {groups.map((group) => (
          <div key={group.group} className="space-y-1">
            <h4 className="px-3 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
              {group.group}
            </h4>
            <div className="space-y-1">
              {group.items.map((it) => {
                const isActive = it.end ? pathname === it.to : pathname?.startsWith(it.to);
                return (
                  <Link
                    key={it.to}
                    href={it.to}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all group",
                      isActive
                        ? "bg-primary/10 text-primary shadow-sm"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <it.icon className={cn("w-4 h-4 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                    {it.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const groups = useNavItems();
  
  // Flatten all items and pick 5
  const allItems = groups.flatMap(g => g.items);
  const adminMobile = ["/app", "/app/meals", "/app/chat", "/app/balance", "/app/settings"];
  const boarderMobile = ["/me", "/me/bills", "/me/chat", "/me/daily-menu", "/me/profile"];
  
  const isAdmin = pathname?.startsWith("/app");
  const mobileSet = new Set(isAdmin ? adminMobile : boarderMobile);
  const mobileItems = allItems.filter((i) => mobileSet.has(i.to)).slice(0, 5);

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 glass border-t shadow-lg">
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}>
        {mobileItems.map((it) => {
          const active = it.end ? pathname === it.to : pathname?.startsWith(it.to);
          return (
            <Link
              key={it.to}
              href={it.to}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <it.icon className={cn("w-5 h-5", active && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]")} />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
