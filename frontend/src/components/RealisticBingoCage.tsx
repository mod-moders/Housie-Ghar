"use client";

import React, { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, Sphere, Torus, Cylinder, Text } from "@react-three/drei";
import * as THREE from "three";
import { soundSynthesizer } from "@/lib/soundSynthesizer";
import { useConfigStore } from "@/lib/stores/configStore";

/* ─── Constants ──────────────────────────────────────── */
const CAGE_R = 1.4;
const WIRE = 0.014;
const BALL_R = 0.12; // slightly smaller so 90 balls fit nicely in the cage

/* ─── Cage wireframe ─────────────────────────────────── */
function Cage({ isSpinning }: { isSpinning: boolean }) {
  const innerRef = useRef<THREE.Group>(null);
  const speedRef = useRef(0.08);

  useFrame((_, delta) => {
    if (!innerRef.current) return;
    const target = isSpinning ? 4.0 : 0.08;
    speedRef.current = THREE.MathUtils.lerp(speedRef.current, target, delta * 2.5);
    innerRef.current.rotation.x += delta * speedRef.current;
  });

  const rings = 12;
  const wireMat = <meshPhysicalMaterial metalness={0.95} roughness={0.1} color="#c8a84e" clearcoat={1} />;

  const latitudes = [
    { y: 0, r: CAGE_R },
    { y: 0.6, r: CAGE_R * 0.9 },
    { y: -0.6, r: CAGE_R * 0.9 },
    { y: 1.1, r: CAGE_R * 0.6 },
    { y: -1.1, r: CAGE_R * 0.6 },
  ];

  return (
    <group>
      <group ref={innerRef}>
        {[...Array(rings)].map((_, i) => (
          <Torus key={`v-${i}`} args={[CAGE_R, WIRE, 8, 64]} rotation={[0, (Math.PI / rings) * i, 0]}>
            {wireMat}
          </Torus>
        ))}
        {latitudes.map((l, i) => (
          <Torus key={`h-${i}`} args={[l.r, WIRE, 8, 64]} rotation={[Math.PI / 2, 0, 0]} position={[0, l.y, 0]}>
            {wireMat}
          </Torus>
        ))}
        <Cylinder args={[0.04, 0.04, CAGE_R * 2.6, 8]} rotation={[0, 0, Math.PI / 2]}>
          <meshPhysicalMaterial metalness={0.9} roughness={0.2} color="#b8943e" />
        </Cylinder>
      </group>

      {/* Axle hub caps */}
      {[-1, 1].map((s) => (
        <Sphere key={s} args={[0.12, 16, 16]} position={[s * (CAGE_R + 0.45), 0, 0]}>
          <meshPhysicalMaterial metalness={1} roughness={0.08} color="#c8a84e" clearcoat={1} />
        </Sphere>
      ))}

      {/* Crank */}
      <group position={[CAGE_R + 0.65, 0, 0]}>
        <Cylinder args={[0.035, 0.035, 0.5, 8]} rotation={[0, 0, Math.PI / 2]} position={[0.25, 0, 0]}>
          <meshPhysicalMaterial metalness={0.9} roughness={0.15} color="#b8943e" />
        </Cylinder>
        <Sphere args={[0.07, 10, 10]} position={[0.52, 0, 0]}>
          <meshPhysicalMaterial metalness={0.95} roughness={0.1} color="#c8a84e" />
        </Sphere>
      </group>
    </group>
  );
}

/* ─── Stand ──────────────────────────────────────────── */
function Stand() {
  const legX = CAGE_R + 0.45;
  const mat = <meshPhysicalMaterial metalness={0.9} roughness={0.15} color="#b8943e" clearcoat={0.4} />;
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Cylinder args={[0.08, 0.1, 2.2, 16]} position={[side * legX, -1.1, 0]}>
            {mat}
          </Cylinder>
          <Cylinder args={[0.14, 0.14, 0.04, 16]} position={[side * legX, -2.2, 0]}>
            {mat}
          </Cylinder>
        </group>
      ))}
    </group>
  );
}

/* ─── Balls inside cage ──────────────────────────────── */
const BALL_COLORS = ["#e53935", "#1e88e5", "#43a047", "#fdd835", "#8e24aa", "#fb8c00", "#00acc1", "#ec407a", "#7cb342", "#ff7043"];

// Per-ball motion params — random but computed once at module load, so they stay
// fixed for the app's lifetime. Doing this here (not in render/useMemo) keeps the
// impure Math.random out of the render path, which the react-hooks purity rule
// requires, and none of these values depend on component props.
const INNER_BALLS = [...Array(90)].map((_, i) => {
  const num = i + 1;
  return {
    num,
    color: BALL_COLORS[num % BALL_COLORS.length],
    seed: Math.random() * Math.PI * 2,
    freq: {
      x: 0.5 + Math.random() * 1.5,
      y: 0.5 + Math.random() * 1.5,
      z: 0.5 + Math.random() * 1.5,
    },
    spinX: (Math.random() - 0.5) * 5,
    spinY: (Math.random() - 0.5) * 5,
  };
});

function InnerBalls({ isSpinning, drawn }: { isSpinning: boolean; drawn: Set<number> }) {
  const groupRef = useRef<THREE.Group>(null);

  const balls = INNER_BALLS;

  // Pre-calculate dense hemispherical pack layout
  const settlePositions = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const R = CAGE_R - BALL_R - 0.05;
    for (let i = 0; i < 90; i++) {
      const phi = Math.PI - 0.1 - (i / 90) * 0.45; // build upward
      const theta = i * 2.39996; // golden angle
      const r = BALL_R + (i / 90) * (R - BALL_R) * 0.75;
      pts.push(
        new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * r,
          Math.cos(phi) * r,
          Math.sin(phi) * Math.sin(theta) * r
        )
      );
    }
    return pts;
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const R = CAGE_R - BALL_R - 0.05;

    let undrawnIdx = 0;

    groupRef.current.children.forEach((child) => {
      const num = child.userData.num;
      if (drawn.has(num)) {
        child.visible = false;
        return;
      }
      child.visible = true;

      const b = balls[num - 1];

      if (isSpinning) {
        // High-energy tumbling
        const tt = t * 3.4 + b.seed;
        // Limit X-axis swing along the axle to keep them centered, while tumbling fully in Y-Z plane
        let tx = Math.sin(tt * b.freq.x) * R * 0.45;
        let ty = Math.cos(tt * b.freq.y) * R * 0.9;
        let tz = Math.sin(tt * b.freq.z + b.seed) * R * 0.9;
        
        // Enforce strict spherical boundary constraint (convex sphere constraint)
        const dist = Math.sqrt(tx * tx + ty * ty + tz * tz);
        const maxDist = R * 0.88; // Keep center of ball within 88% of cage radius to avoid wire clipping
        if (dist > maxDist) {
          tx = (tx / dist) * maxDist;
          ty = (ty / dist) * maxDist;
          tz = (tz / dist) * maxDist;
        }

        child.position.x = THREE.MathUtils.lerp(child.position.x, tx, 0.12);
        child.position.y = THREE.MathUtils.lerp(child.position.y, ty, 0.12);
        child.position.z = THREE.MathUtils.lerp(child.position.z, tz, 0.12);
      } else {
        // Slide / fall down cleanly into pile
        const target = settlePositions[undrawnIdx] || settlePositions[0];
        const vx = target.x + Math.sin(t * 1.5 + b.seed) * 0.005;
        const vy = target.y + Math.cos(t * 1.2 + b.seed) * 0.005;
        const vz = target.z + Math.sin(t * 1.8 + b.seed) * 0.005;
        child.position.x = THREE.MathUtils.lerp(child.position.x, vx, 0.05);
        child.position.y = THREE.MathUtils.lerp(child.position.y, vy, 0.05);
        child.position.z = THREE.MathUtils.lerp(child.position.z, vz, 0.05);
        undrawnIdx++;
      }

      child.rotation.x += b.spinX * (isSpinning ? 0.03 : 0.002);
      child.rotation.y += b.spinY * (isSpinning ? 0.03 : 0.002);
    });
  });

  return (
    <group ref={groupRef}>
      {balls.map((b) => (
        <group key={b.num} userData={{ num: b.num }}>
          <Sphere args={[BALL_R, 8, 8]}>
            <meshPhysicalMaterial color={b.color} metalness={0.05} roughness={0.12} clearcoat={1.0} clearcoatRoughness={0.04} />
          </Sphere>
          <Cylinder args={[BALL_R * 0.52, BALL_R * 0.52, 0.01, 10]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, BALL_R - 0.01]}>
            <meshPhysicalMaterial color="#fff" metalness={0} roughness={0.15} />
          </Cylinder>
          <Text position={[0, 0, BALL_R + 0.002]} fontSize={BALL_R * 0.6} color="#111" anchorX="center" anchorY="middle" fontWeight="bold">
            {b.num}
          </Text>
        </group>
      ))}
    </group>
  );
}

/* ─── Exported component ─────────────────────────────── */
export function RealisticBingoCage({
  lastDrawn,
  isTeasing,
  drawn = new Set<number>(),
  compact = false,
  muted = false,
}: {
  lastDrawn: number | null;
  isTeasing: boolean;
  drawn?: Set<number>;
  compact?: boolean;
  muted?: boolean;
}) {
  useEffect(() => {
    const config = useConfigStore.getState().config;
    const isSoundEnabled = config?.cage_sound_enabled !== "false";

    if (isTeasing && isSoundEnabled && !muted) {
      soundSynthesizer.startCageSpin();
    } else {
      soundSynthesizer.stopCageSpin();
    }

    return () => {
      soundSynthesizer.stopCageSpin();
    };
  }, [isTeasing, muted]);

  const ballHue = lastDrawn !== null ? (lastDrawn * 37) % 360 : 0;
  const ballColor = lastDrawn !== null ? `hsl(${ballHue}, 75%, 50%)` : "transparent";
  const showBadge = !isTeasing && lastDrawn !== null;
  const cageSize = compact ? "200px" : "420px";
  const badgeSize = compact ? "60px" : "120px";
  const badgeFontSize = compact ? "24px" : "48px";
  const badgeBorder = compact ? "3px" : "6px";

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: cageSize, margin: "0 auto" }}>
      {/* 3D Cage */}
      <div style={{ width: "100%", aspectRatio: "4 / 3" }}>
        <Canvas
          camera={{ position: [0, 0, 5], fov: 38 }}
          gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
          style={{ background: "transparent" }}
        >
          <React.Suspense fallback={null}>
            <ambientLight intensity={0.4} />
            <Environment resolution={256}>
              <group rotation={[-Math.PI / 2, 0, 0]}>
                <Lightformer intensity={6} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={[14, 14, 1]} />
                <Lightformer intensity={2.5} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={[14, 4, 1]} />
                <Lightformer intensity={2.5} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={[14, 4, 1]} />
                <Lightformer type="ring" intensity={3} rotation-y={Math.PI / 2} position={[-0.1, -1, -5]} scale={6} />
              </group>
            </Environment>
            <group position={[0, 0.1, 0]}>
              <Stand />
              <Cage isSpinning={isTeasing} />
              <InnerBalls isSpinning={isTeasing} drawn={drawn} />
            </group>
          </React.Suspense>
        </Canvas>
      </div>

      {/* 2D Number Badge Overlay — pops up over cage when number is called */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <div
          key={lastDrawn}
          style={{
            width: badgeSize,
            height: badgeSize,
            borderRadius: "50%",
            background: "#fff",
            border: `${badgeBorder} solid ${ballColor}`,
            boxShadow: `0 0 30px ${ballColor}44, 0 8px 32px rgba(0,0,0,0.5)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: badgeFontSize,
            fontWeight: 900,
            color: "#111",
            fontFamily: "var(--font-head), sans-serif",
            opacity: showBadge ? 1 : 0,
            transform: showBadge ? "scale(1)" : "scale(0.3)",
            transition: "opacity 0.35s cubic-bezier(.4,0,.2,1), transform 0.35s cubic-bezier(.175,.885,.32,1.275)",
          }}
        >
          {lastDrawn}
        </div>
      </div>
    </div>
  );
}
