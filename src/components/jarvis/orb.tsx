import { Shdr11 } from "@/components/ui/shdr-11";
import { StatusPill } from "@/components/common";
import { useWare, type OrbState } from "@/store";

// Shdr11 props from docs/design-handoff.md §5. Shdr11 only has idle/thinking/speaking,
// so the prototype's `listening` maps to `idle`.
const PARAMS = { speed: 1.1 };
const STATE_PRESETS = { idle: { speed: 0.9 }, thinking: { speed: 1.1 }, speaking: { speed: 1.3 } };
const STATE_VOLUMES = {
  idle: { input: 0, output: 0.2 },
  thinking: { input: 0.1, output: 0.45 },
  speaking: { input: 0.2, output: 0.8 },
};
const VOLUMES = { input: 0, output: 0.6 };

export function JarvisOrb({ size }: { size: number }) {
  const orb = useWare((s) => s.orb);
  return (
    <span className="flex-none leading-none text-muted-foreground">
      <Shdr11
        size={size}
        state={orb === "listening" ? "idle" : orb}
        wrapper="ring"
        wrapperColor="currentColor"
        params={PARAMS}
        statePresets={STATE_PRESETS}
        stateVolumes={STATE_VOLUMES}
        volumes={VOLUMES}
        pauseOffscreen
        maxDpr={1.5}
        ariaLabel="Assistant status"
      />
    </span>
  );
}

const ORB_STATUS: Record<OrbState, { label: string; color: string; bg: string; border: string }> = {
  idle: { label: "Idle", color: "#a1a1aa", bg: "rgba(39,39,42,.6)", border: "#3f3f46" },
  listening: { label: "Listening", color: "#8db1f3", bg: "rgba(79,139,234,.12)", border: "rgba(79,139,234,.4)" },
  thinking: { label: "Thinking", color: "#E3BD78", bg: "rgba(227,189,120,.12)", border: "rgba(227,189,120,.4)" },
  speaking: { label: "Speaking", color: "#4ade80", bg: "rgba(34,197,94,.12)", border: "rgba(34,197,94,.4)" },
};

export function OrbStatus() {
  const orb = useWare((s) => s.orb);
  const o = ORB_STATUS[orb];
  return <StatusPill label={o.label} color={o.color} bg={o.bg} border={o.border} blink={orb !== "idle"} />;
}
