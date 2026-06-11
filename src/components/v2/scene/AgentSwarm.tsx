"use client";
/* eslint-disable react-hooks/immutability, react-hooks/refs -- R3F idiom: useFrame mutates three.js objects imperatively, outside React render */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { story, smoothstep } from "../story";

export const AGENTS = [
  "Fundamentals",
  "DCF Valuation",
  "Insider Activity",
  "Technicals",
  "Sentiment",
  "Macro Context",
  "Earnings",
  "Options Flow",
  "Risk",
  "Analyst Consensus",
  "Comparables",
  "Graham Value",
  "News & Catalysts",
  "Competitor Analysis",
  "CEO Synthesis",
];

const N = AGENTS.length;
const RADIUS = 2.35;
const CEO = N - 1;

const EDGE_VERT = /* glsl */ `
  attribute float aT;
  attribute float aSeed;
  varying float vT;
  varying float vSeed;
  void main() {
    vT = aT;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EDGE_FRAG = /* glsl */ `
  uniform float uDraw;
  uniform float uTime;
  uniform float uOpacity;
  varying float vT;
  varying float vSeed;
  void main() {
    // Staggered draw-on per edge, soft leading tip.
    float reveal = clamp(uDraw * 1.45 - vSeed * 0.45, 0.0, 1.0);
    float on = smoothstep(vT - 0.06, vT, reveal);
    float base = on * (0.8 + 0.2 * sin(uTime * 1.3 + vSeed * 6.2831));
    // A pulse of light travelling along the edge.
    float ph = fract(uTime * (0.1 + 0.13 * vSeed) + vSeed);
    float d = vT - ph;
    float pulse = exp(-d * d * 240.0) * on;
    vec3 accent = vec3(0.302, 0.612, 0.973);
    vec3 hi = vec3(0.486, 0.753, 1.0);
    vec3 col = mix(accent, hi, pulse);
    float a = (base + pulse * 1.6) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(124,192,255,0.85)");
  grad.addColorStop(0.35, "rgba(77,156,248,0.30)");
  grad.addColorStop(1, "rgba(77,156,248,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export default function AgentSwarm({ onHover }: { onHover: (name: string | null) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreWireRef = useRef<THREE.Mesh>(null);
  const orbRefs = useRef<(THREE.Mesh | null)[]>([]);
  const hovered = useRef<number>(-1);
  const scales = useRef<number[]>(Array(N).fill(1));
  const tmp = useRef(new THREE.Vector3());

  // Fibonacci sphere, slightly squashed vertically for composition.
  const base = useMemo(() => {
    return Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * 2.39996;
      return new THREE.Vector3(Math.cos(th) * r * RADIUS, y * RADIUS * 0.78, Math.sin(th) * r * RADIUS);
    });
  }, []);

  // Brain-like wiring: 2 nearest neighbours per orb plus fixed cross-links.
  const edges = useMemo(() => {
    const list: [number, number][] = [];
    const seen = new Set<string>();
    const add = (x: number, y: number) => {
      if (x === y) return;
      const k = x < y ? `${x}-${y}` : `${y}-${x}`;
      if (seen.has(k)) return;
      seen.add(k);
      list.push(x < y ? [x, y] : [y, x]);
    };
    base.forEach((p, i) => {
      const nearest = base
        .map((q, j) => [p.distanceTo(q), j] as const)
        .filter(([, j]) => j !== i)
        .sort((m, n) => m[0] - n[0]);
      add(i, nearest[0][1]);
      add(i, nearest[1][1]);
    });
    for (const [x, y] of [[0, 7], [2, 11], [4, 13], [1, 9], [5, 12], [3, 14], [6, 10]]) add(x, y);
    return list;
  }, [base]);

  const { lineGeo, edgeMat } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(edges.length * 2 * 3);
    const aT = new Float32Array(edges.length * 2);
    const aSeed = new Float32Array(edges.length * 2);
    edges.forEach(([a, b], e) => {
      base[a].toArray(pos, e * 6);
      base[b].toArray(pos, e * 6 + 3);
      aT[e * 2] = 0;
      aT[e * 2 + 1] = 1;
      const seed = (e * 0.618 + 0.21) % 1;
      aSeed[e * 2] = seed;
      aSeed[e * 2 + 1] = seed;
    });
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: EDGE_VERT,
      fragmentShader: EDGE_FRAG,
      uniforms: { uDraw: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { lineGeo: geo, edgeMat: mat };
  }, [base, edges]);

  // Data sparkles that light up along the wiring in Act 2.
  const { sparkGeo, sparkMat } = useMemo(() => {
    const pts: number[] = [];
    edges.forEach(([a, b], e) => {
      const n = 2;
      for (let s = 0; s < n; s++) {
        const t = ((e * 2.71 + s * 1.37 + 0.5) % 1) * 0.7 + 0.15;
        tmp.current.lerpVectors(base[a], base[b], t);
        pts.push(tmp.current.x, tmp.current.y, tmp.current.z);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color("#7cc0ff"),
      size: 0.045,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { sparkGeo: geo, sparkMat: mat };
  }, [base, edges]);

  const glowTex = useMemo(() => makeGlowTexture(), []);
  const orbMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#0b1120"),
        emissive: new THREE.Color("#4d9cf8"),
        emissiveIntensity: 2.2,
        roughness: 0.4,
        transparent: true,
      }),
    []
  );
  const ceoMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#0b1120"),
        emissive: new THREE.Color("#7cc0ff"),
        emissiveIntensity: 2.8,
        roughness: 0.35,
        transparent: true,
      }),
    []
  );
  const glowMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [glowTex]
  );
  const coreMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#0b1120"),
        emissive: new THREE.Color("#7cc0ff"),
        emissiveIntensity: 3.2,
        roughness: 0.3,
        transparent: true,
      }),
    []
  );
  const coreWireMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#7cc0ff"),
        wireframe: true,
        transparent: true,
        opacity: 0.4,
      }),
    []
  );
  useEffect(() => {
    return () => {
      lineGeo.dispose();
      edgeMat.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      glowTex.dispose();
      orbMat.dispose();
      ceoMat.dispose();
      glowMat.dispose();
      coreMat.dispose();
      coreWireMat.dispose();
    };
  }, [lineGeo, edgeMat, sparkGeo, sparkMat, glowTex, orbMat, ceoMat, glowMat, coreMat, coreWireMat]);

  useFrame(({ clock }, dt) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.elapsedTime;
    const ps = story.ps;

    const draw = smoothstep(0.2, 0.46, ps);
    const collapse = smoothstep(0.5, 0.66, ps);
    const fade = 1 - smoothstep(0.5, 0.62, ps);

    group.position.y = -2.1 * collapse;
    group.scale.setScalar(1 - 0.78 * collapse);
    group.visible = fade > 0.004;
    if (!group.visible) return;

    orbMat.opacity = fade;
    ceoMat.opacity = fade;
    glowMat.opacity = 0.44 * fade;
    coreMat.opacity = fade;
    coreWireMat.opacity = 0.4 * fade;

    edgeMat.uniforms.uDraw.value = draw;
    edgeMat.uniforms.uTime.value = t;
    edgeMat.uniforms.uOpacity.value = fade;
    sparkMat.opacity = smoothstep(0.3, 0.46, ps) * fade * (0.45 + 0.25 * Math.sin(t * 2.2));

    if (coreWireRef.current) {
      coreWireRef.current.rotation.y = t * 0.18;
      coreWireRef.current.rotation.x = Math.sin(t * 0.12) * 0.3;
    }

    const linePos = lineGeo.attributes.position as THREE.BufferAttribute;
    const drifted: THREE.Vector3[] = [];
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 9);
    for (let i = 0; i < N; i++) {
      const v = tmp.current
        .copy(base[i])
        .add(
          new THREE.Vector3(
            Math.sin(t * 0.42 + i * 1.7) * 0.07,
            Math.cos(t * 0.36 + i * 2.3) * 0.06,
            Math.sin(t * 0.31 + i * 3.1) * 0.07
          )
        );
      drifted.push(v.clone());
      const mesh = orbRefs.current[i];
      if (mesh) {
        mesh.position.copy(v);
        const target = hovered.current === i ? 1.5 : 1;
        scales.current[i] += (target - scales.current[i]) * k;
        mesh.scale.setScalar(scales.current[i]);
      }
    }
    edges.forEach(([a, b], e) => {
      drifted[a].toArray(linePos.array as Float32Array, e * 6);
      drifted[b].toArray(linePos.array as Float32Array, e * 6 + 3);
    });
    linePos.needsUpdate = true;
  });

  const over = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (story.ps > 0.4) return; // network has dissolved — no tooltips
    hovered.current = i;
    onHover(AGENTS[i]);
  };
  const out = () => () => {
    hovered.current = -1;
    onHover(null);
  };

  return (
    <group ref={groupRef}>
      {/* Central glowing ticker core */}
      <mesh ref={coreWireRef}>
        <icosahedronGeometry args={[0.42, 1]} />
        <primitive object={coreWireMat} attach="material" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.16, 32, 32]} />
        <primitive object={coreMat} attach="material" />
      </mesh>

      {/* 15 agent orbs */}
      {base.map((p, i) => (
        <mesh
          key={AGENTS[i]}
          ref={(m) => {
            orbRefs.current[i] = m;
          }}
          position={p}
          onPointerOver={over(i)}
          onPointerOut={out()}
        >
          <sphereGeometry args={[i === CEO ? 0.135 : 0.095, 24, 24]} />
          <primitive object={i === CEO ? ceoMat : orbMat} attach="material" />
          <sprite scale={i === CEO ? [0.62, 0.62, 1] : [0.44, 0.44, 1]}>
            <primitive object={glowMat} attach="material" />
          </sprite>
        </mesh>
      ))}

      {/* Neural wiring + data sparkles */}
      <lineSegments geometry={lineGeo}>
        <primitive object={edgeMat} attach="material" />
      </lineSegments>
      <points geometry={sparkGeo}>
        <primitive object={sparkMat} attach="material" />
      </points>
    </group>
  );
}
