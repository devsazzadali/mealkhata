import Link from "next/link";
import {
  UtensilsCrossed,
  Users,
  Wallet,
  ShoppingBasket,
  Bell,
  MessageCircle,
  Video,
  Calendar,
  ShieldCheck,
  Smartphone,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Users, title: "বোর্ডার ম্যানেজমেন্ট", desc: "নতুন বোর্ডার যোগ করুন, রুম/সিট বরাদ্দ দিন, প্রোফাইল ও মাসিক হিসাব এক জায়গায়।" },
  { icon: UtensilsCrossed, title: "মিল ট্র্যাকিং", desc: "প্রতিদিনের সকাল-দুপুর-রাতের মিল এন্ট্রি ও মিল রেট অটো ক্যালকুলেশন।" },
  { icon: Wallet, title: "ডিপোজিট ও ব্যালেন্স", desc: "জমা টাকা, খরচ আর বর্তমান ব্যালেন্স রিয়েল-টাইম। কম ব্যালেন্স হলে অ্যালার্ট।" },
  { icon: ShoppingBasket, title: "স্টক ম্যানেজমেন্ট", desc: "চাল, ডাল, তেল-সব কিছুর স্টক রাখুন। কম হলে নোটিফিকেশন পাবেন।" },
  { icon: Bell, title: "নোটিশ বোর্ড", desc: "মেসের সব সদস্যের কাছে গুরুত্বপূর্ণ ঘোষণা পৌঁছে দিন এক ক্লিকে।" },
  { icon: MessageCircle, title: "গ্রুপ চ্যাট", desc: "মেসের ভেতরে রিয়েল-টাইম চ্যাট, ছবি শেয়ার ও পিনড অ্যানাউন্সমেন্ট।" },
  { icon: Video, title: "ভিডিও/অডিও কল", desc: "চ্যাট থেকেই গ্রুপ ভিডিও কল, স্ক্রিন শেয়ার-সম্পূর্ণ ফ্রি।" },
  { icon: Calendar, title: "মাসিক হিসাব", desc: "অটো মিল রেট, প্রতিটি বোর্ডারের মাসিক সামারি ও PDF রিপোর্ট।" },
];

const benefits = [
  "সম্পূর্ণ বাংলায় ডিজাইন করা",
  "মোবাইল ও ডেস্কটপ-উভয় ডিভাইসে চলে",
  "শুধু মোবাইল নাম্বার দিয়েই রেজিস্ট্রেশন-OTP লাগে না",
  "ম্যানেজার ও বোর্ডার-আলাদা ড্যাশবোর্ড",
  "নিরাপদ ক্লাউড স্টোরেজে সব ডাটা",
  "সম্পূর্ণ ফ্রি-কোনো লুকানো চার্জ নেই",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-background/70 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <UtensilsCrossed className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">
              Meal<span className="text-gradient">Khata</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">লগইন</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="gradient-primary text-primary-foreground">রেজিস্টার</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-primary-glow/20 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
            <ShieldCheck className="w-3.5 h-3.5" /> বাংলাদেশের জন্য তৈরি
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
            মেস ম্যানেজমেন্টের <br />
            <span className="text-gradient">সবচেয়ে সহজ সমাধান</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            মিল, ডিপোজিট, খরচ, স্টক, নোটিশ, চ্যাট-আপনার পুরো মেসের হিসাব এক জায়গায়। কাগজ-কলমের ঝামেলা ভুলে যান।
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button size="lg" className="gradient-primary text-primary-foreground h-12 px-6 shadow-glow">
                ফ্রি অ্যাকাউন্ট খুলুন <ArrowRight className="ml-1 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="h-12 px-6">
                লগইন করুন
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            শুধু মোবাইল নাম্বার ও পাসওয়ার্ড-OTP লাগবে না
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">যা যা পাবেন</h2>
            <p className="text-muted-foreground">একটি অ্যাপেই মেসের সব কাজ</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f) => (
              <div key={f.title} className="glass rounded-2xl p-6 hover:shadow-glow transition-all">
                <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <h3 className="font-semibold mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">কিভাবে শুরু করবেন</h2>
            <p className="text-muted-foreground">মাত্র ৩ ধাপে আপনার মেস চালু করুন</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: "১", t: "অ্যাকাউন্ট খুলুন", d: "নাম, মোবাইল নাম্বার ও পাসওয়ার্ড দিয়ে রেজিস্টার করুন।" },
              { n: "২", t: "মেস তৈরি করুন", d: "আপনার মেসের নাম দিন এবং বোর্ডারদের যোগ করুন।" },
              { n: "৩", t: "হিসাব শুরু", d: "প্রতিদিনের মিল, খরচ ও ডিপোজিট এন্ট্রি করুন। বাকি সব অটো।" },
            ].map((s) => (
              <div key={s.n} className="relative p-6 rounded-2xl border border-border bg-card">
                <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-lg mb-4">
                  {s.n}
                </div>
                <h3 className="font-semibold text-lg mb-2">{s.t}</h3>
                <p className="text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 sm:py-24 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">কেন MealKhata?</h2>
            <p className="text-muted-foreground mb-6">
              বাংলাদেশের ছাত্র, চাকরিজীবী এবং পরিবার-যেকোনো ধরনের মেসের জন্য তৈরি। বাংলায় সহজ, দ্রুত এবং সম্পূর্ণ বিনামূল্যে।
            </p>
            <ul className="space-y-3">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="glass rounded-3xl p-8 text-center">
            <Smartphone className="w-16 h-16 text-primary mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">এখনই শুরু করুন</h3>
            <p className="text-muted-foreground mb-6 text-sm">
              কোনো ক্রেডিট কার্ড লাগবে না। কোনো সেটআপ ফি নেই।
            </p>
            <Link href="/signup">
              <Button size="lg" className="w-full gradient-primary text-primary-foreground shadow-glow">
                ফ্রি রেজিস্টার করুন
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-primary" />
            <span>© {new Date().getFullYear()} MealKhata. বাংলাদেশের জন্য, ভালোবাসায় তৈরি।</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground">লগইন</Link>
            <Link href="/signup" className="hover:text-foreground">রেজিস্টার</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
