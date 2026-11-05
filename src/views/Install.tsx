"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Smartphone, Bell, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferred) {
      toast.info("আপনার browser-এ install option চালু নেই। নিচের manual instruction দেখুন।");
      return;
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") toast.success("Install শুরু হয়েছে!");
    setDeferred(null);
  };

  const requestNotifPerm = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("আপনার browser notification support করে না।");
      return;
    }
    const r = await Notification.requestPermission();
    if (r === "granted") toast.success("Notification permission granted!");
    else toast.warning("Permission denied");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/5 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <Link href="/" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
          ← হোমে ফিরুন
        </Link>

        <div className="text-center space-y-3 py-4">
          <div className="w-20 h-20 mx-auto rounded-3xl gradient-primary flex items-center justify-center shadow-glow">
            <Smartphone className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            MealKhata <span className="text-gradient">Install</span> করুন
          </h1>
          <p className="text-muted-foreground">আপনার phone-এ app হিসেবে ব্যবহার করুন — notification, sound, offline সব।</p>
        </div>

        {installed ? (
          <div className="rounded-2xl border-2 border-success/40 bg-success/5 p-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-success" />
            <h2 className="text-xl font-bold">App ইতিমধ্যে install করা আছে! 🎉</h2>
            <p className="text-sm text-muted-foreground">আপনি এখন notification ও sound পাবেন।</p>
            <Button onClick={requestNotifPerm} variant="outline" className="gap-2">
              <Bell className="w-4 h-4" /> Notification permission দিন
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Download className="w-5 h-5 text-primary mt-1 shrink-0" />
              <div className="flex-1">
                <h2 className="font-semibold text-lg">এক ক্লিকে Install</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  নিচের button-এ click করে phone-এ install করুন।
                </p>
                <Button onClick={install} size="lg" className="mt-3 gap-2">
                  <Download className="w-4 h-4" /> এখনই Install করুন
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border bg-card p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> Manual Install
          </h2>

          <div className="space-y-3 text-sm">
            <div className="rounded-xl border bg-background p-4">
              <p className="font-semibold text-primary mb-2">📱 Android (Chrome)</p>
              <ol className="space-y-1.5 text-foreground/90 list-decimal list-inside">
                <li>উপরে ডানদিকের ⋮ menu-তে tap করুন</li>
                <li>"Install app" / "Add to Home screen" সিলেক্ট করুন</li>
                <li>Confirm করুন</li>
              </ol>
            </div>

            <div className="rounded-xl border bg-background p-4">
              <p className="font-semibold text-primary mb-2">🍎 iPhone (Safari)</p>
              <ol className="space-y-1.5 text-foreground/90 list-decimal list-inside">
                <li>নিচে Share button (□↑) tap করুন</li>
                <li>"Add to Home Screen" সিলেক্ট করুন</li>
                <li>"Add" tap করুন</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4" /> Notification & Sound
          </h2>
          <p className="text-sm text-muted-foreground">
            App install করার পর notification permission দিন, যাতে নতুন message, emergency notice, ও call এর sound পান।
          </p>
          <Button onClick={requestNotifPerm} variant="outline" className="gap-2">
            <Bell className="w-4 h-4" /> Permission দিন
          </Button>
        </div>

        <div className="text-center">
          <Link href="/login" passHref legacyBehavior>
            <Button variant="ghost" className="gap-2">
              Login করুন <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
