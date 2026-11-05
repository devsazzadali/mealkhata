import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, PhoneOff } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";

declare global {
  interface Window { JitsiMeetExternalAPI?: any }
}

const JITSI_DOMAIN = "meet.jit.si";

function loadJitsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve();
    const s = document.createElement("script");
    s.src = `https://${JITSI_DOMAIN}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Jitsi"));
    document.body.appendChild(s);
  });
}

export default function Call() {
  const params = useParams();
  const roomId = params?.roomId as string || "";
  const search = useSearchParams();
  const audioOnly = search?.get("audio") === "1";
  const router = useRouter();
  const { profile, roles } = useAuthStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = roles.includes("mess_admin") || roles.includes("super_admin");
  const backHref = isAdmin ? "/app/chat" : "/me/chat";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadJitsiScript();
        if (cancelled || !containerRef.current) return;
        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName: roomId,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: {
            displayName: profile?.full_name ?? "Guest",
          },
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: audioOnly,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
            DEFAULT_BACKGROUND: "#0F172A",
            TOOLBAR_BUTTONS: [
              "microphone", "camera", "desktop", "fullscreen", "fodeviceselection",
              "hangup", "chat", "raisehand", "videoquality", "tileview", "settings",
            ],
          },
        });
        apiRef.current = api;
        api.addListener("videoConferenceJoined", () => setLoading(false));
        api.addListener("readyToClose", () => router.push(backHref));
      } catch (e: any) {
        setError(e.message ?? "Failed to start call");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      try { apiRef.current?.dispose?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 h-12 bg-background/80 backdrop-blur border-b shrink-0">
        <p className="text-sm font-medium truncate">
          {audioOnly ? "🎙️ Audio Call" : "🎥 Video Call"} · Room: <span className="font-mono">{roomId.slice(-8)}</span>
        </p>
        <Button variant="destructive" size="sm" onClick={() => router.push(backHref)}>
          <PhoneOff className="w-4 h-4 mr-1.5" /> Leave
        </Button>
      </div>
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Connecting…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 p-6 text-center">
            <p className="text-destructive font-semibold">Call failed</p>
            <p className="text-sm opacity-80">{error}</p>
            <Button onClick={() => router.push(backHref)}>Back</Button>
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
