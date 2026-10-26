import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useViewportPointer } from "@/hooks/usePointer";
import { colors, damp } from "@/lib/motion";

const HELIX_RADIUS = 1.12;
const HELIX_HEIGHT = 5.2;
const TURNS = 2.4;

export type BloodDnaSceneProps = {
  /** Smaller screens get fewer beads/particles and a lower pixel ratio. */
  compact?: boolean;
};

type BeadTone = "crimson" | "bright" | "silver";

type Bead = {
  key: string;
  position: [number, number, number];
  tone: BeadTone;
  scale: number;
};

type Rung = {
  key: string;
  position: [number, number, number];
  rotation: [number, number, number];
  length: number;
  tone: "crimson" | "silver";
};

type HelixAssets = {
  beadGeometry: THREE.SphereGeometry;
  rungGeometry: THREE.CylinderGeometry;
  beadCrimson: THREE.MeshPhysicalMaterial;
  beadBright: THREE.MeshPhysicalMaterial;
  beadSilver: THREE.MeshPhysicalMaterial;
  rungCrimson: THREE.MeshStandardMaterial;
  rungSilver: THREE.MeshStandardMaterial;
  particleGeometry: THREE.BufferGeometry;
};

/** Procedurally build the double-helix bead + rung layout (runs once). */
function buildHelix(strandBeads: number): { beads: Bead[]; rungs: Rung[] } {
  const beads: Bead[] = [];
  const rungs: Rung[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  const euler = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();

  for (let i = 0; i < strandBeads; i += 1) {
    const t = i / (strandBeads - 1);
    const angle = t * Math.PI * 2 * TURNS;
    const y = (t - 0.5) * HELIX_HEIGHT;

    a.set(Math.cos(angle) * HELIX_RADIUS, y, Math.sin(angle) * HELIX_RADIUS);
    b.set(Math.cos(angle + Math.PI) * HELIX_RADIUS, y, Math.sin(angle + Math.PI) * HELIX_RADIUS);

    const accent = i % 3 === 0;
    const bright = i % 6 === 0;

    const toneA: BeadTone = bright ? "bright" : accent ? "crimson" : "silver";
    const toneB: BeadTone = bright ? "silver" : accent ? "bright" : "crimson";

    beads.push({
      key: `a-${i}`,
      position: [a.x, a.y, a.z],
      tone: toneA,
      scale: accent ? 1 : 0.82,
    });
    beads.push({
      key: `b-${i}`,
      position: [b.x, b.y, b.z],
      tone: toneB,
      scale: accent ? 0.86 : 1,
    });

    mid.copy(a).add(b).multiplyScalar(0.5);
    dir.copy(b).sub(a);
    const length = dir.length();
    quaternion.setFromUnitVectors(up, dir.normalize());
    euler.setFromQuaternion(quaternion);

    rungs.push({
      key: `r-${i}`,
      position: [mid.x, mid.y, mid.z],
      rotation: [euler.x, euler.y, euler.z],
      length,
      tone: accent ? "crimson" : "silver",
    });
  }

  return { beads, rungs };
}

function createAssets(particleCount: number): HelixAssets {
  const beadGeometry = new THREE.SphereGeometry(0.2, 24, 24);
  const rungGeometry = new THREE.CylinderGeometry(0.032, 0.032, 1, 14, 1, true);

  const beadCrimson = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colors.red),
    emissive: new THREE.Color(colors.redSoft),
    emissiveIntensity: 0.5,
    roughness: 0.22,
    metalness: 0.14,
    transparent: true,
    opacity: 0.82,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
  });

  const beadBright = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colors.redBright),
    emissive: new THREE.Color(colors.redBright),
    emissiveIntensity: 0.9,
    roughness: 0.18,
    metalness: 0.1,
    transparent: true,
    opacity: 0.78,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
  });

  const beadSilver = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colors.silver),
    emissive: new THREE.Color(colors.silver),
    emissiveIntensity: 0.14,
    roughness: 0.3,
    metalness: 0.55,
    transparent: true,
    opacity: 0.66,
    clearcoat: 1,
    clearcoatRoughness: 0.24,
  });

  const rungCrimson = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colors.redSoft),
    emissive: new THREE.Color(colors.red),
    emissiveIntensity: 0.55,
    roughness: 0.35,
    metalness: 0.3,
    transparent: true,
    opacity: 0.5,
  });

  const rungSilver = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colors.silver),
    roughness: 0.32,
    metalness: 0.6,
    transparent: true,
    opacity: 0.4,
  });

  const particleGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 7;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
  }
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  return {
    beadGeometry,
    rungGeometry,
    beadCrimson,
    beadBright,
    beadSilver,
    rungCrimson,
    rungSilver,
    particleGeometry,
  };
}

/**
 * The helix itself. Pointer input is read from a ref inside `useFrame`, so
 * moving the mouse never triggers a React render — the group simply damps
 * towards a pointer-derived target each frame.
 */
function HelixScene({ compact = false }: BloodDnaSceneProps) {
  const pointer = useViewportPointer();
  const group = useRef<THREE.Group>(null);
  const redLight = useRef<THREE.PointLight>(null);
  const particles = useRef<THREE.Points>(null);

  const { beads, rungs } = useMemo(() => buildHelix(compact ? 18 : 24), [compact]);
  const assets = useMemo(() => createAssets(compact ? 44 : 90), [compact]);

  const motion = useRef({
    spin: 0,
    spinOffset: 0,
    tiltX: 0,
    tiltZ: 0,
    offsetX: 0,
    offsetY: 0,
    light: 14,
    applied: "",
  });

  useEffect(
    () => () => {
      assets.beadGeometry.dispose();
      assets.rungGeometry.dispose();
      assets.particleGeometry.dispose();
      assets.beadCrimson.dispose();
      assets.beadBright.dispose();
      assets.beadSilver.dispose();
      assets.rungCrimson.dispose();
      assets.rungSilver.dispose();
    },
    [assets],
  );

  useFrame((frameState, delta) => {
    const apply = Math.min(delta, 1 / 30);
    const time = frameState.clock.elapsedTime;
    const node = group.current;
    if (!node) return;

    const sample = pointer.current;
    const active = sample.active ? 1 : 0;
    const m = motion.current;

    // Idle drift.
    m.spin += apply * 0.24;
    m.spinOffset = damp(m.spinOffset, sample.nx * 0.42 * active, 2.1, apply);
    m.tiltX = damp(m.tiltX, -sample.ny * 0.34 * active, 2.6, apply);
    m.tiltZ = damp(m.tiltZ, sample.nx * 0.16 * active, 2.6, apply);
    m.offsetX = damp(m.offsetX, -sample.nx * 0.5 * active, 2.0, apply);
    m.offsetY = damp(m.offsetY, sample.ny * 0.34 * active, 2.0, apply);

    node.rotation.y = m.spin + m.spinOffset;
    node.rotation.x = m.tiltX + Math.sin(time * 0.42) * 0.06;
    node.rotation.z = m.tiltZ;
    node.position.x = m.offsetX;
    node.position.y = Math.sin(time * 0.62) * 0.11 + m.offsetY;

    // Red illumination eases back as the pointer moves away from the centre.
    const distance = Math.min(1.5, Math.hypot(sample.nx, sample.ny));
    const lightTarget = active ? 14 - distance * 4 : 13.5;
    m.light = damp(m.light, lightTarget, 2.2, apply);
    if (redLight.current) redLight.current.intensity = m.light;

    if (particles.current) {
      particles.current.rotation.y = time * 0.035 + m.spinOffset * 0.6;
      particles.current.rotation.x = m.tiltX * 0.4;
    }
  });

  const materialFor = (tone: BeadTone) => {
    if (tone === "bright") return assets.beadBright;
    if (tone === "crimson") return assets.beadCrimson;
    return assets.beadSilver;
  };

  return (
    <>
      <ambientLight intensity={0.95} color={colors.pearl} />
      <hemisphereLight args={[colors.pearl, colors.blink, 0.8]} />
      <pointLight
        ref={redLight}
        color={colors.redBright}
        intensity={14}
        distance={22}
        decay={2}
        position={[2.8, 1.6, 3.4]}
      />
      <pointLight
        color={colors.redSoft}
        intensity={8}
        distance={18}
        decay={2}
        position={[-3.2, -1.8, -2.4]}
      />
      <directionalLight color={colors.pearl} intensity={1.1} position={[-3.6, 4.4, 2.6]} />
      <directionalLight color={colors.redSoft} intensity={0.6} position={[3.4, -3, -2]} />

      <group ref={group}>
        {beads.map((bead) => (
          <mesh
            key={bead.key}
            geometry={assets.beadGeometry}
            material={materialFor(bead.tone)}
            position={bead.position}
            scale={[bead.scale, bead.scale, bead.scale]}
          />
        ))}

        {rungs.map((rung) => (
          <mesh
            key={rung.key}
            geometry={assets.rungGeometry}
            material={rung.tone === "crimson" ? assets.rungCrimson : assets.rungSilver}
            position={rung.position}
            rotation={rung.rotation}
            scale={[1, rung.length, 1]}
          />
        ))}

        <points ref={particles} geometry={assets.particleGeometry}>
          <pointsMaterial
            color={colors.redBright}
            size={0.055}
            sizeAttenuation
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>
    </>
  );
}

/** Lazy-loaded WebGL scene. Default export so it can be used with React.lazy. */
export default function BloodDnaScene({ compact = false }: BloodDnaSceneProps) {
  return (
    <Canvas
      dpr={compact ? [1, 1.25] : [1, 1.75]}
      camera={{ position: [0, 0, 7.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <HelixScene compact={compact} />
    </Canvas>
  );
}
