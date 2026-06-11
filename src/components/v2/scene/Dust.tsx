"use client";
 
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Faint ambient starfield — depth at every scroll position, nearly free.
export default function Dust() {
  const ref = useRef<THREE.Points>(null);

  const { geo, mat } = useMemo(() => {
    const COUNT = 520;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      // Deterministic-ish shell distribution (no Math.random needed for SSR — this
      // only ever runs client-side, but keep it stable across StrictMode remounts).
      const a = i * 2.39996;
      const b = (i * 0.7548776662) % 1;
      const r = 9 + b * 15;
      const y = (((i * 0.381966) % 1) - 0.5) * 2;
      const rr = Math.sqrt(Math.max(0.05, 1 - y * y));
      pos[i * 3] = Math.cos(a) * rr * r;
      pos[i * 3 + 1] = y * r * 0.6;
      pos[i * 3 + 2] = Math.sin(a) * rr * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color("#5e87c0"),
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    return { geo, mat };
  }, []);

  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat]
  );

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += Math.min(dt, 0.05) * 0.006;
  });

  return <points ref={ref} geometry={geo} material={mat} />;
}
