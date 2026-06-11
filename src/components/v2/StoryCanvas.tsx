"use client";
import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import Director from "./scene/Director";
import CameraRig from "./scene/CameraRig";
import AgentSwarm from "./scene/AgentSwarm";
import MarketTerrain from "./scene/MarketTerrain";
import ConvictionCore from "./scene/ConvictionCore";
import Dust from "./scene/Dust";
import Effects from "./scene/Effects";

// 1 = capable but lean (no DoF / chromatic aberration), 2 = full stack.
function detectTier(): 1 | 2 {
  try {
    const cores = navigator.hardwareConcurrency ?? 4;
    const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
    const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (mobile || cores <= 4 || mem <= 4) return 1;
    return 2;
  } catch {
    return 1;
  }
}

export default function StoryCanvas({ onHover }: { onHover: (name: string | null) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  const [ready, setReady] = useState(false);
  const [tier, setTier] = useState<1 | 2>(1);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client capability probe, same pattern as AuthContext
    setTier(detectTier());
    const el = wrapRef.current;
    if (!el) return;
    // Pause the render loop entirely once the pinned story scrolls offscreen.
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      style={{ opacity: ready ? 1 : 0, transition: "opacity 1.2s ease" }}
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop={active ? "always" : "never"}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 42, near: 0.1, far: 70, position: [0, 0.35, 7.6] }}
        onCreated={() => setReady(true)}
      >
        <Director />
        <CameraRig />
        <ambientLight intensity={0.25} />
        <pointLight position={[4, 5, 6]} intensity={18} color="#4d9cf8" />
        <AgentSwarm onHover={onHover} />
        <MarketTerrain />
        <ConvictionCore />
        <Dust />
        <Effects high={tier === 2} />
      </Canvas>
    </div>
  );
}
