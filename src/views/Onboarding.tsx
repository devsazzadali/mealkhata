"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Building2, KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Onboarding() {
  const router = useRouter();
  const { signOut, profile, user, loadProfileAndRoles } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);

  // Create mess
  const [messName, setMessName] = useState("");
  const [address, setAddress] = useState("");

  // Join mess
  const [joinKey, setJoinKey] = useState("");
  const [joinName, setJoinName] = useState(profile?.full_name ?? "");
  const [joinPhone, setJoinPhone] = useState(profile?.phone ?? "");
  const [joinMsg, setJoinMsg] = useState("");
  const [localGuardianName, setLocalGuardianName] = useState("");
  const [localGuardianPhone, setLocalGuardianPhone] = useState("");
  const [nidOrStudentId, setNidOrStudentId] = useState("");
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const createMess = async () => {
    if (!messName.trim()) return toast.error("Enter mess name");
    setSubmitting(true);
    try {
      await apiPost("auth/bootstrap-mess", { mess_name: messName.trim(), address: address || undefined });
      toast.success("Mess created!");
      await loadProfileAndRoles();
      router.push("/app");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const requestJoin = async () => {
    if (!user) return;
    if (!joinKey.trim() || !joinName.trim() || !joinPhone.trim()) {
      return toast.error("সব তথ্য পূরণ করুন");
    }
    setSubmitting(true);
    try {
      let foundMessId: string | null;
      try {
        foundMessId = await apiGet<string | null>("mess-settings/find-by-join-key", { key: joinKey.trim() });
      } catch (lookupErr) {
        console.error("RPC lookup error:", lookupErr);
        toast.error("Join key যাচাই করা যায়নি");
        return;
      }
      if (!foundMessId) {
        toast.error("ভুল join key — admin এর কাছ থেকে সঠিক key নিন");
        return;
      }

      // Check existing pending request for same mess
      const existingList = await apiGet<any[]>("join-requests", {
        user_id: user.id,
        mess_id: foundMessId as string,
        status: "pending",
      });
      const existing = existingList[0] ?? null;

      if (existing) {
        toast.success("আপনার request আগেই পাঠানো হয়েছে — admin approval এর অপেক্ষায়");
        setRequestSent(true);
        return;
      }

      try {
        await apiPost("join-requests", {
          mess_id: foundMessId as string,
          user_id: user.id,
          requested_name: joinName.trim(),
          requested_phone: joinPhone.trim(),
          message: joinMsg.trim() || null,
          local_guardian_name: localGuardianName.trim() || null,
          local_guardian_phone: localGuardianPhone.trim() || null,
          nid_or_student_id: nidOrStudentId.trim() || null,
          rules_accepted: rulesAccepted,
        });
      } catch (error: any) {
        console.error("Insert error:", error);
        toast.error(error.message || "Request পাঠানো যায়নি");
        return;
      }
      toast.success("Request পাঠানো হয়েছে! Admin approval এর অপেক্ষায় থাকুন।");
      setRequestSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-subtle">
      <div className="w-full max-w-lg space-y-4 animate-fade-in">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold">Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!</h1>
          <p className="text-sm text-muted-foreground mt-1">Create a new mess or join an existing one.</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-md">
          {requestSent ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-6 h-6" />
              </div>
              <p className="font-semibold">Request sent</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your join request is pending. The mess admin will approve you soon.
                Refresh this page after approval.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => typeof window !== 'undefined' && window.location.reload()}>Refresh</Button>
            </div>
          ) : (
            <Tabs defaultValue="join">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="join"><KeyRound className="w-4 h-4 mr-1.5" /> Join Mess</TabsTrigger>
                <TabsTrigger value="create"><Building2 className="w-4 h-4 mr-1.5" /> Create Mess</TabsTrigger>
              </TabsList>

              <TabsContent value="join" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">Enter the 8-char key shared by your mess admin.</p>
                <div className="space-y-1.5">
                  <Label>Join key</Label>
                  <Input value={joinKey} onChange={(e) => setJoinKey(e.target.value)} placeholder="abc12def" maxLength={8} className="font-mono uppercase" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Your name</Label>
                    <Input value={joinName} onChange={(e) => setJoinName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={joinPhone} onChange={(e) => setJoinPhone(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Local guardian name</Label>
                    <Input value={localGuardianName} onChange={(e) => setLocalGuardianName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Local guardian phone</Label>
                    <Input value={localGuardianPhone} onChange={(e) => setLocalGuardianPhone(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>NID / Student ID</Label>
                    <Input value={nidOrStudentId} onChange={(e) => setNidOrStudentId(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 flex items-end gap-2 pb-1">
                    <input id="rules_accepted_join" type="checkbox" checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} className="h-4 w-4" />
                    <Label htmlFor="rules_accepted_join">I accept the mess rules</Label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Message (optional)</Label>
                  <Input value={joinMsg} onChange={(e) => setJoinMsg(e.target.value)} placeholder="Hi, I'd like to join…" />
                </div>
                <Button className="w-full h-11" onClick={requestJoin} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send join request"}
                </Button>
              </TabsContent>

              <TabsContent value="create" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">You'll become the manager of this new mess.</p>
                <div className="space-y-1.5">
                  <Label>Mess name *</Label>
                  <Input value={messName} onChange={(e) => setMessName(e.target.value)} placeholder="Sonali Mess" />
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Mirpur 10, Dhaka" />
                </div>
                <Button className="w-full h-11 gradient-primary text-primary-foreground" onClick={createMess} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create mess"}
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <Button variant="ghost" className="w-full" onClick={() => signOut().then(() => router.push("/login"))}>
          <LogOut className="w-4 h-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}
