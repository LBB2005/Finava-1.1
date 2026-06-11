"use client";
 
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  DepthOfField,
  Noise,
  Vignette,
  ChromaticAberration,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { focusTarget } from "./focus";

// Postprocessing stack. `high` adds depth of field (focus racks to the camera
// subject each frame) and very light radial chromatic aberration. On weaker
// GPUs we keep only bloom + vignette + grain; under reduced motion the whole
// composer never mounts (the canvas itself doesn't).
export default function Effects({ high }: { high: boolean }) {
  const dofRef = useRef<{ target: THREE.Vector3 | null }>(null);
  const caOffset = useMemo(() => new THREE.Vector2(0.0006, 0.0004), []);

  useFrame(() => {
    if (dofRef.current) dofRef.current.target = focusTarget;
  });

  if (!high) {
    return (
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.34} luminanceSmoothing={0.3} radius={0.5} />
        <Vignette offset={0.22} darkness={0.72} />
        <Noise premultiply opacity={0.055} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.72} luminanceThreshold={0.34} luminanceSmoothing={0.3} radius={0.5} />
      <DepthOfField ref={dofRef as never} focalLength={0.014} bokehScale={1.0} focusDistance={0.02} />
      <Vignette offset={0.22} darkness={0.74} />
      <Noise premultiply opacity={0.055} />
      <ChromaticAberration offset={caOffset} radialModulation modulationOffset={0.55} />
    </EffectComposer>
  );
}
