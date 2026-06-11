"use client";
/* eslint-disable react-hooks/immutability -- R3F idiom: useFrame mutates three.js objects imperatively, outside React render */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { story, smoothstep } from "../story";

// Act 4 — everything resolves into one glowing point of conviction behind the
// frosted briefing card.
export default function ConvictionCore() {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  const coreMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#0b1120"),
        emissive: new THREE.Color("#7cc0ff"),
        emissiveIntensity: 3.4,
        roughness: 0.3,
        transparent: true,
      }),
    []
  );
  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#4d9cf8"),
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  useEffect(
    () => () => {
      coreMat.dispose();
      ringMat.dispose();
    },
    [coreMat, ringMat]
  );

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.elapsedTime;
    const s = smoothstep(0.8, 0.92, story.ps);
    group.visible = s > 0.002;
    if (!group.visible) return;
    const pulse = 1 + Math.sin(t * 1.8) * 0.06;
    group.scale.setScalar(s * pulse);
    coreMat.opacity = s;
    coreMat.emissiveIntensity = 3.4 + Math.sin(t * 1.8) * 0.5;
    ringMat.opacity = 0.35 * s;
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.25;
      ringRef.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.3) * 0.25;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = -t * 0.18;
      ring2Ref.current.rotation.x = Math.PI / 2.6 + Math.cos(t * 0.22) * 0.25;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.95, 0]} visible={false}>
      <mesh>
        <sphereGeometry args={[0.22, 32, 32]} />
        <primitive object={coreMat} attach="material" />
      </mesh>
      <mesh ref={ringRef}>
        <torusGeometry args={[0.58, 0.006, 8, 96]} />
        <primitive object={ringMat} attach="material" />
      </mesh>
      <mesh ref={ring2Ref}>
        <torusGeometry args={[0.86, 0.004, 8, 96]} />
        <primitive object={ringMat} attach="material" />
      </mesh>
    </group>
  );
}
