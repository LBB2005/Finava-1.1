"use client";
 
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { story, smoothstep } from "../story";
import { focusTarget } from "./focus";

// Camera path keyframed against story progress. Each segment eases with
// smoothstep so dwell points (the acts) feel composed, not linear.
const KEYS: { t: number; pos: [number, number, number]; look: [number, number, number] }[] = [
  { t: 0.0, pos: [0, 0.35, 7.6], look: [0, 0, 0] }, // hero — swarm head-on
  { t: 0.22, pos: [1.9, 0.95, 6.0], look: [0, 0.05, 0] }, // slow dolly as hero releases
  { t: 0.42, pos: [4.1, 1.7, 3.2], look: [0, 0.2, 0] }, // orbit — constellation 3/4 view
  { t: 0.55, pos: [2.3, -0.5, 5.7], look: [0, -1.5, 0] }, // dive as the network falls
  { t: 0.68, pos: [0, -0.7, 4.7], look: [0, -2.1, -2] }, // approach the terrain
  { t: 0.8, pos: [0, -0.8, 1.5], look: [0, -2.0, -6] }, // low glide over the field
  { t: 1.0, pos: [0, -0.45, 6.1], look: [0, -0.95, 0] }, // pull back to the verdict
];

export default function CameraRig() {
  const a = useRef(new THREE.Vector3());
  const b = useRef(new THREE.Vector3());
  const pos = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());

  useFrame(({ camera, clock }) => {
    const p = story.ps;
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].t) i++;
    const k0 = KEYS[i];
    const k1 = KEYS[i + 1];
    const u = smoothstep(k0.t, k1.t, p);

    pos.current.lerpVectors(a.current.fromArray(k0.pos), b.current.fromArray(k1.pos), u);
    look.current.lerpVectors(a.current.fromArray(k0.look), b.current.fromArray(k1.look), u);

    // Breathing drift — alive even when idle — plus damped pointer parallax.
    const t = clock.elapsedTime;
    pos.current.x += Math.sin(t * 0.33) * 0.05 + story.pxS * 0.38;
    pos.current.y += Math.cos(t * 0.26) * 0.04 + story.pyS * 0.2;
    pos.current.z += Math.sin(t * 0.21) * 0.03;

    camera.position.copy(pos.current);
    focusTarget.copy(look.current);
    camera.lookAt(look.current);
  });

  return null;
}
