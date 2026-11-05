import { useCallback, useEffect, useRef } from "react";

/**
 * Web-Audio based notification sounds. No external assets needed.
 * Plays short, distinct tones for different events.
 */
export type SoundKind = "message" | "call" | "emergency" | "request";

const STORAGE_KEY = "mk_sounds_enabled";

export function useNotificationSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current?.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const isEnabled = useCallback(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(STORAGE_KEY) !== "0";
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  }, []);

  const tone = useCallback(
    (freq: number, duration: number, when = 0, type: OscillatorType = "sine", gain = 0.18) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    },
    [ensureCtx]
  );

  const play = useCallback(
    (kind: SoundKind) => {
      if (!isEnabled()) return;
      switch (kind) {
        case "message":
          // Two quick rising blips
          tone(880, 0.12, 0, "sine");
          tone(1320, 0.14, 0.09, "sine");
          break;
        case "call":
          // Ringy pattern (will repeat by caller if needed)
          for (let i = 0; i < 2; i++) {
            tone(520, 0.25, i * 0.6, "triangle", 0.22);
            tone(660, 0.25, i * 0.6 + 0.28, "triangle", 0.22);
          }
          break;
        case "emergency":
          // Alarm: alternating high/low
          for (let i = 0; i < 3; i++) {
            tone(1000, 0.18, i * 0.42, "square", 0.2);
            tone(700, 0.18, i * 0.42 + 0.2, "square", 0.2);
          }
          break;
        case "request":
          // Pleasant chord
          tone(660, 0.18, 0, "sine", 0.16);
          tone(880, 0.22, 0.05, "sine", 0.16);
          tone(1100, 0.28, 0.1, "sine", 0.14);
          break;
      }
      // Vibrate on supported devices
      if ("vibrate" in navigator) {
        try {
          if (kind === "emergency") navigator.vibrate([200, 80, 200, 80, 200]);
          else if (kind === "call") navigator.vibrate([300, 200, 300, 200, 300]);
          else navigator.vibrate(60);
        } catch {}
      }
    },
    [tone, isEnabled]
  );

  // Unlock audio on first user gesture (browser policy)
  useEffect(() => {
    const unlock = () => ensureCtx();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureCtx]);

  return { play, isEnabled, setEnabled };
}
