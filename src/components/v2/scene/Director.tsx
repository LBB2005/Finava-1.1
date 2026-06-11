"use client";
 
import { useFrame } from "@react-three/fiber";
import { story } from "../story";

// Damps the raw scroll/pointer targets once per frame so every other scene
// component reads the same smoothed values. Rendered first inside the Canvas.
export default function Director() {
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    const kScroll = 1 - Math.exp(-d * 5.5);
    const kPointer = 1 - Math.exp(-d * 3);
    story.ps += (story.p - story.ps) * kScroll;
    story.pxS += (story.px - story.pxS) * kPointer;
    story.pyS += (story.py - story.pyS) * kPointer;
  });
  return null;
}
