"use client";
/* eslint-disable react-hooks/immutability -- R3F idiom: useFrame mutates three.js objects imperatively, outside React render */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { story, smoothstep } from "../story";

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uFlatten;
  varying float vH;
  varying vec2 vUv;
  varying vec3 vPos;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    float t = uTime * 0.18;

    // Rolling market field
    float n = fbm(position.xy * 0.32 + vec2(t, t * 0.6));
    float h = n * 1.7 - 0.85;

    // Candlestick ridges: quantised columns along x with triangular caps
    float col = floor(position.x * 1.6);
    float candle = (hash(vec2(col, 17.0)) - 0.5) * 2.0;
    float ridge = 1.0 - abs(2.0 * fract(position.x * 1.6) - 1.0);
    h += candle * ridge * 0.4 * (0.5 + 0.5 * noise(vec2(col * 0.7, t * 2.0)));

    h *= uReveal * (1.0 - uFlatten);
    vH = h;
    pos.z += h;
    vPos = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  varying float vH;
  varying vec2 vUv;
  varying vec3 vPos;

  void main() {
    vec3 deep = vec3(0.020, 0.034, 0.072);
    vec3 base = vec3(0.043, 0.067, 0.122);
    vec3 accent = vec3(0.302, 0.612, 0.973);
    vec3 bull = vec3(0.204, 0.827, 0.600);
    vec3 bear = vec3(0.973, 0.443, 0.443);

    float hN = clamp(vH * 0.85 + 0.5, 0.0, 1.0);
    vec3 col = mix(base, deep, vUv.y);
    col = mix(col, bear * 0.5, smoothstep(0.40, 0.04, hN) * 0.65);
    col = mix(col, bull * 0.55, smoothstep(0.62, 0.95, hN));

    // Glowing grid flow-lines drifting forward
    vec2 g = abs(fract(vPos.xy * vec2(1.6, 1.2) - vec2(0.0, uTime * 0.12)) - 0.5);
    float line = smoothstep(0.5, 0.484, max(g.x, g.y));
    col += accent * line * 0.2 * (0.35 + 0.65 * hN);

    // Signal peaks burn bright (caught by bloom)
    col += bull * smoothstep(0.84, 1.0, hN) * 0.45;
    col += bear * smoothstep(0.16, 0.0, hN) * 0.35;

    // Soft fade at the plane's borders so it never ends with a hard edge
    float fade = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.84, vUv.y)
               * smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
    float alpha = uReveal * fade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha * 0.96);
  }
`;

export default function MarketTerrain() {
  const meshRef = useRef<THREE.Mesh>(null);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uReveal: { value: 0 },
          uFlatten: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    []
  );

  useEffect(() => () => mat.dispose(), [mat]);

  useFrame(({ clock }) => {
    const ps = story.ps;
    const reveal = smoothstep(0.5, 0.68, ps);
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uReveal.value = reveal;
    mat.uniforms.uFlatten.value = smoothstep(0.8, 0.95, ps) * 0.85;
    if (meshRef.current) meshRef.current.visible = reveal > 0.002;
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.25, -2]} visible={false}>
      <planeGeometry args={[46, 30, 200, 110]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}
