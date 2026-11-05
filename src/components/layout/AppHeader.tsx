import { useRouter } from "next/navigation";
import { Bell, LogOut, Moon, Sun, UtensilsCrossed } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useTheme } from "@/providers/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const router = useRouter();
  const { profile, signOut, roles } = useAuthStore();
  const { theme, toggle } = useTheme();
  const initials =
    profile?.full_name
      ?.split(" ")
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "U";

  const roleLabel = roles.includes("super_admin")
    ? "Super Admin"
    : roles.includes("mess_admin")
    ? "Mess Admin"
    : "Boarder";

  return (
    <header className="h-16 border-b bg-background/70 backdrop-blur-md sticky top-0 z-20">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="md:hidden flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shadow-md">
            <UtensilsCrossed className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold">Meal<span className="text-gradient">Khata</span></span>
        </div>
        <div className="hidden md:block flex-1" />

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 px-2 gap-2">
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start">
                  <span className="text-xs font-medium leading-none">{profile?.full_name ?? "User"}</span>
                  <span className="text-[10px] text-muted-foreground">{roleLabel}</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">
                <div className="font-medium">{profile?.full_name}</div>
                <div className="text-muted-foreground">{profile?.phone}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut().then(() => router.push("/login"))} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
