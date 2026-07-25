"use client";

import React, { useRef, useEffect } from "react";
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
  const physicsStateRef = useRef<{ x: number; y: number; z: number; vx: number; vy: number; vz: number }[] | null>(null);

  const balls = INNER_BALLS;

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (!physicsStateRef.current) {
      physicsStateRef.current = balls.map(() => {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.4;
        return {
          x: (Math.random() - 0.5) * 0.6,
          y: -0.6 - Math.random() * 0.4,
          z: Math.sin(angle) * r,
          vx: (Math.random() - 0.5) * 0.1,
          vy: (Math.random() - 0.5) * 0.1,
          vz: (Math.random() - 0.5) * 0.1,
        };
      });
    }

    const physics = physicsStateRef.current;
    const dt = Math.min(delta, 0.03); // cap step to prevent explosion
    const R_limit = CAGE_R - BALL_R - 0.04;
    const gravity = 9.8;
    const restitution = 0.4;
    const targetOmega = isSpinning ? 4.0 : 0.08;

    // 1. Apply gravity, centrifugal drag from spinning cage, and air resistance
    for (let i = 0; i < 90; i++) {
      const b = balls[i];
      const p = physics[i];

      if (drawn.has(b.num)) {
        p.x = 999;
        p.y = 999;
        p.z = 999;
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
        continue;
      }

      // Gravity pulls down
      p.vy -= gravity * dt;

      // Friction/drag force from the rotating wire cap (around X axle)
      const r_yz = Math.sqrt(p.y * p.y + p.z * p.z);
      if (r_yz > R_limit - 0.15) {
        const targetVy = -p.z * targetOmega;
        const targetVz = p.y * targetOmega;
        const dragFactor = isSpinning ? 18.0 : 6.0;
        p.vy += (targetVy - p.vy) * dragFactor * dt;
        p.vz += (targetVz - p.vz) * dragFactor * dt;
      }

      // Air friction
      const airFriction = isSpinning ? 0.3 : 1.2;
      p.vx *= (1 - airFriction * dt);
      p.vy *= (1 - airFriction * dt);
      p.vz *= (1 - airFriction * dt);

      // Noise to keep it lively
      if (isSpinning) {
        p.vx += (Math.random() - 0.5) * 1.5 * dt;
        p.vy += (Math.random() - 0.5) * 1.5 * dt;
        p.vz += (Math.random() - 0.5) * 1.5 * dt;
      }

      // Integrate position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }

    // 2. Ball-on-Ball Collisions
    const min_dist = 2 * BALL_R;
    const min_dist_sq = min_dist * min_dist;
    for (let i = 0; i < 90; i++) {
      if (drawn.has(balls[i].num)) continue;
      const pi = physics[i];

      for (let j = i + 1; j < 90; j++) {
        if (drawn.has(balls[j].num)) continue;
        const pj = physics[j];

        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const dz = pj.z - pi.z;
        const dist_sq = dx * dx + dy * dy + dz * dz;

        if (dist_sq < min_dist_sq && dist_sq > 0.0001) {
          const dist = Math.sqrt(dist_sq);
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;

          const overlap = min_dist - dist;
          pi.x -= nx * overlap * 0.5;
          pi.y -= ny * overlap * 0.5;
          pi.z -= nz * overlap * 0.5;

          pj.x += nx * overlap * 0.5;
          pj.y += ny * overlap * 0.5;
          pj.z += nz * overlap * 0.5;

          const rvx = pj.vx - pi.vx;
          const rvy = pj.vy - pi.vy;
          const rvz = pj.vz - pi.vz;
          const velAlongNormal = rvx * nx + rvy * ny + rvz * nz;

          if (velAlongNormal < 0) {
            const impulse = -(1 + restitution) * velAlongNormal * 0.5;
            pi.vx -= nx * impulse;
            pi.vy -= ny * impulse;
            pi.vz -= nz * impulse;

            pj.vx += nx * impulse;
            pj.vy += ny * impulse;
            pj.vz += nz * impulse;
          }
        }
      }
    }

    // 3. Boundary Collisions (Perfect spherical wire barrel cage constraint)
    for (let i = 0; i < 90; i++) {
      if (drawn.has(balls[i].num)) continue;
      const p = physics[i];

      const r_sph = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      if (r_sph > R_limit) {
        const nx = p.x / r_sph;
        const ny = p.y / r_sph;
        const nz = p.z / r_sph;

        p.x = nx * R_limit;
        p.y = ny * R_limit;
        p.z = nz * R_limit;

        const dot = p.vx * nx + p.vy * ny + p.vz * nz;
        if (dot > 0) {
          p.vx -= (1 + restitution) * dot * nx;
          p.vy -= (1 + restitution) * dot * ny;
          p.vz -= (1 + restitution) * dot * nz;
        }
      }

      // Strict capsule cap constraints
      const xLim = 0.58;
      if (Math.abs(p.x) > xLim) {
        p.x = Math.sign(p.x) * xLim;
        p.vx = -p.vx * restitution;
      }
    }

    // 4. Update Three.js objects
    groupRef.current.children.forEach((child) => {
      const num = child.userData.num;
      if (drawn.has(num)) {
        child.visible = false;
        return;
      }
      child.visible = true;

      const p = physics[num - 1];
      child.position.x = p.x;
      child.position.y = p.y;
      child.position.z = p.z;

      const b = balls[num - 1];
      child.rotation.x += b.spinX * (isSpinning ? 0.05 : 0.005);
      child.rotation.y += b.spinY * (isSpinning ? 0.05 : 0.005);
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
  numberRevealed = true,
  drawn = new Set<number>(),
  compact = false,
  muted = false,
}: {
  lastDrawn: number | null;
  isTeasing: boolean;
  numberRevealed?: boolean;
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
          <span
            style={{
              opacity: numberRevealed ? 1 : 0,
              transform: numberRevealed ? "scale(1)" : "scale(0.8)",
              transition: "opacity 0.7s ease-out, transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)",
              display: "inline-block",
            }}
          >
            {lastDrawn}
          </span>
        </div>
      </div>
    </div>
  );
}
