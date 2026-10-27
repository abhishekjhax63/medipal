import { ContactShadows, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { PointerSample } from "@/hooks/usePointer";
import { colors, damp, isTouchOnlyDevice } from "@/lib/motion";

type AISceneProps = {
  /** Container-scoped pointer sample (nx/ny normalised -1..1, `active` while inside). */
  pointerRef: RefObject<PointerSample>;
  reducedMotion: boolean;
  /** True while the assistant is preparing a reply — warms the LEDs and pulses faster. */
  thinking?: boolean;
};

/** Writes emissive colour + intensity onto a mesh's standard material. */
function applyLed(mesh: THREE.Mesh | null, color: THREE.Color, intensity: number) {
  if (!mesh) return;
  const material = mesh.material;
  if (!Array.isArray(material) && material instanceof THREE.MeshStandardMaterial) {
    material.emissive.copy(color);
    material.emissiveIntensity = intensity;
  }
}

function setBasicOpacity(mesh: THREE.Mesh | null, opacity: number) {
  if (!mesh) return;
  const material = mesh.material;
  if (!Array.isArray(material) && material instanceof THREE.MeshBasicMaterial) {
    material.opacity = opacity;
  }
}

type BlinkState = { next: number; progress: number };
const BLINK_DURATION = 0.16;

/** Advances an occasional, damped blink and returns the current eye scale. */
function advanceBlink(state: BlinkState, dt: number): number {
  if (state.progress >= 0) {
    state.progress += dt;
    if (state.progress >= BLINK_DURATION) {
      state.progress = -1;
      state.next = 2.4 + Math.random() * 3.6;
      return 1;
    }
    return 1 - Math.sin((state.progress / BLINK_DURATION) * Math.PI) * 0.92;
  }
  state.next -= dt;
  if (state.next <= 0) state.progress = 0;
  return 1;
}

/** Pearl-white ceramic shell — clearcoat gloss with a soft rose sheen. */
function ShellMaterial() {
  return (
    <meshPhysicalMaterial
      color={colors.pearl}
      roughness={0.3}
      metalness={0.1}
      clearcoat={1}
      clearcoatRoughness={0.16}
      sheen={0.65}
      sheenColor="#D6E9F7"
      sheenRoughness={0.55}
      reflectivity={0.5}
      envMapIntensity={1.15}
    />
  );
}

/** Polished silver metal for the joints, collars and detailing. */
function SilverMaterial() {
  return <meshStandardMaterial color={colors.silver} metalness={0.92} roughness={0.2} envMapIntensity={1.25} />;
}

/** Subtle translucent glass for the visor and the chest aperture. */
function GlassMaterial() {
  return (
    <meshPhysicalMaterial
      color="#C9E3F7"
      transmission={0.9}
      thickness={0.6}
      ior={1.45}
      roughness={0.08}
      metalness={0}
      clearcoat={1}
      clearcoatRoughness={0.08}
      attenuationColor={colors.redSoft}
      attenuationDistance={1.4}
      envMapIntensity={1.2}
    />
  );
}

/** Warm-neutral studio key/fill/rim rig with an aqua accent (no remote assets). */
function Lights() {
  return (
    <>
      <ambientLight intensity={0.55} color="#F6FAFF" />
      <hemisphereLight intensity={0.5} color="#FFFFFF" groundColor="#E7EEF4" />
      {/* Key */}
      <directionalLight position={[3.4, 4.8, 4.2]} intensity={2.1} color="#FFFFFF" />
      {/* Fill */}
      <directionalLight position={[-3.8, 1.4, 2.8]} intensity={0.72} color="#EAF3FF" />
      {/* Blue / aqua rim accents */}
      <pointLight position={[-2.6, 1.6, -2.8]} intensity={12} distance={11} color={colors.redBright} />
      <pointLight position={[3, -0.6, -2.4]} intensity={8} distance={11} color="#7FD8E0" />
      {/* Soft top */}
      <pointLight position={[0, 2.8, 1.2]} intensity={6} distance={12} color="#FFFFFF" />
    </>
  );
}

function RobotModel({ pointerRef, reducedMotion, thinking = false }: AISceneProps) {
  const root = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const eyeGroup = useRef<THREE.Group>(null);
  const eyeLeftBlink = useRef<THREE.Group>(null);
  const eyeRightBlink = useRef<THREE.Group>(null);
  const eyeLeft = useRef<THREE.Mesh>(null);
  const eyeRight = useRef<THREE.Mesh>(null);
  const rimMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const coreMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const tipMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const haloMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const sweep = useRef<THREE.Mesh>(null);
  const faceLight = useRef<THREE.PointLight>(null);
  const attention = useRef(0);
  const blink = useRef<BlinkState>({ next: 2.4 + Math.random() * 3.6, progress: -1 });

  // Mirror the `thinking` prop into a ref so the frame loop always reads the latest.
  const thinkingRef = useRef(thinking);
  useEffect(() => {
    thinkingRef.current = thinking;
  }, [thinking]);

  const { crimsonSoft, brightRed, pink, restColour, idleCore, warmCore } = useMemo(
    () => ({
      crimsonSoft: new THREE.Color(colors.redSoft),
      brightRed: new THREE.Color(colors.redBright),
      pink: new THREE.Color("#6EC5FF"),
      restColour: new THREE.Color(colors.red),
      idleCore: new THREE.Color(colors.red),
      warmCore: new THREE.Color(colors.redBright),
    }),
    [],
  );
  const tint = useMemo(() => new THREE.Color(), []);
  const eyeTint = useMemo(() => new THREE.Color(), []);
  const motionScale = useMemo(
    () => (reducedMotion ? 0.25 : isTouchOnlyDevice() ? 0.5 : 1),
    [reducedMotion],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const time = state.clock.elapsedTime;
    const sample = pointerRef.current;
    const active = Boolean(sample?.active);
    const nx = active ? THREE.MathUtils.clamp(sample.nx, -1, 1) : 0;
    const ny = active ? THREE.MathUtils.clamp(sample.ny, -1, 1) : 0;
    const proximity = active ? Math.max(0, 1 - Math.min(1, Math.hypot(nx, ny) / 1.15)) : 0;
    const isThinking = thinkingRef.current;

    // Attention: a brief, natural pulse while the pointer is close to the robot.
    const attentionTarget = proximity > 0.55 ? 1 : 0;
    attention.current = damp(attention.current, attentionTarget, 2.6, dt);
    const attentionPulse = 1 + Math.sin(time * 6.2) * 0.1 * attention.current;

    // Slower, smoother idle than before.
    const bob = Math.sin(time * 0.75) * 0.055 * motionScale;
    const sway = Math.sin(time * 0.45) * 0.026 * motionScale;

    if (root.current) {
      root.current.position.y = damp(root.current.position.y, bob, 2.6, dt);
      root.current.rotation.z = damp(
        root.current.rotation.z,
        sway - nx * 0.05 * motionScale,
        1.9,
        dt,
      );
      const target = 1 + attention.current * 0.02 * motionScale;
      root.current.scale.setScalar(damp(root.current.scale.x, target, 2.4, dt));
    }

    if (bodyRef.current) {
      bodyRef.current.rotation.y = damp(
        bodyRef.current.rotation.y,
        nx * 0.5 * motionScale + Math.sin(time * 0.42) * 0.045 * motionScale,
        2.8,
        dt,
      );
      bodyRef.current.rotation.x = damp(bodyRef.current.rotation.x, ny * 0.16 * motionScale, 2.8, dt);
    }

    if (headRef.current) {
      headRef.current.rotation.y = damp(headRef.current.rotation.y, nx * 0.42 * motionScale, 4.6, dt);
      headRef.current.rotation.x = damp(headRef.current.rotation.x, ny * 0.3 * motionScale, 4.6, dt);
    }

    if (eyeGroup.current) {
      eyeGroup.current.position.x = damp(eyeGroup.current.position.x, nx * 0.035 * motionScale, 5, dt);
      eyeGroup.current.position.y = damp(eyeGroup.current.position.y, -ny * 0.025 * motionScale, 5, dt);
    }

    // Occasional, damped blink.
    const blinkScale = advanceBlink(blink.current, dt);
    if (eyeLeftBlink.current) eyeLeftBlink.current.scale.y = blinkScale;
    if (eyeRightBlink.current) eyeRightBlink.current.scale.y = blinkScale;

    // Visor rim hue shifts crimson → bright red → pink with the pointer.
    const mix = (nx + 1) / 2;
    tint
      .copy(crimsonSoft)
      .lerp(brightRed, THREE.MathUtils.smoothstep(mix, 0, 0.62))
      .lerp(pink, THREE.MathUtils.smoothstep(mix, 0.58, 1));
    if (!active) tint.lerp(restColour, 0.35);

    if (rimMaterial.current) {
      rimMaterial.current.emissive.copy(tint);
      rimMaterial.current.color.copy(tint);
      rimMaterial.current.emissiveIntensity = (1.5 + proximity * 2.1) * attentionPulse;
    }

    // Chest core LED: gentle idle pulse that quickens and brightens while thinking.
    if (coreMaterial.current) {
      const coreWave = 0.5 + 0.5 * Math.sin(time * (isThinking ? 5.2 : 1.6));
      const coreBase = isThinking ? 2.6 : 1.3 + proximity * 1.2;
      coreMaterial.current.emissive.copy(tint).lerp(warmCore, isThinking ? 0.7 : 0.25);
      coreMaterial.current.color.copy(warmCore);
      coreMaterial.current.emissiveIntensity = coreBase * (0.65 + 0.6 * coreWave);
    }

    if (tipMaterial.current) {
      tipMaterial.current.emissive.copy(tint);
      tipMaterial.current.emissiveIntensity = 1.3 + proximity * 1.4 + (isThinking ? 0.9 : 0);
    }

    // Eyes: crimson LED that warms and flickers while the assistant is thinking.
    eyeTint.copy(idleCore).lerp(warmCore, isThinking ? 0.85 : 0);
    const eyeIntensity = isThinking
      ? 3.2 + 0.6 + 0.5 * Math.sin(time * 5.6)
      : 1.9 + attention.current * 2.2 + proximity * 0.7;
    applyLed(eyeLeft.current, eyeTint, eyeIntensity);
    applyLed(eyeRight.current, eyeTint, eyeIntensity);

    if (halo.current) {
      const haloScale =
        1 + proximity * 0.05 + (isThinking ? 0.02 : 0) + Math.sin(time * 1.7) * 0.01 * motionScale;
      halo.current.scale.setScalar(damp(halo.current.scale.x, haloScale, 2.4, dt));
      halo.current.rotation.z = time * 0.1 * motionScale;
      halo.current.rotation.x = Math.sin(time * 0.3) * 0.2 * motionScale;
    }
    if (haloMaterial.current) {
      haloMaterial.current.color.copy(tint);
      haloMaterial.current.opacity = damp(
        haloMaterial.current.opacity,
        0.08 + proximity * 0.3 + attention.current * 0.08 + (isThinking ? 0.14 : 0),
        2.6,
        dt,
      );
    }

    // A reflection sweeps across the glass visor as the pointer travels.
    if (sweep.current) {
      sweep.current.position.x = damp(sweep.current.position.x, nx * 0.24 * motionScale, 4, dt);
      sweep.current.rotation.z = 0.55 + nx * 0.2;
      setBasicOpacity(sweep.current, 0.06 + proximity * 0.3);
    }

    if (faceLight.current) {
      faceLight.current.color.copy(tint);
      faceLight.current.intensity = damp(
        faceLight.current.intensity,
        (isThinking ? 4.5 : 2.2) + proximity * 5.5,
        2.8,
        dt,
      );
    }

    // Subtle camera framing change on vertical pointer movement.
    const camera = state.camera;
    camera.position.x = damp(camera.position.x, nx * 0.24 * motionScale, 2, dt);
    camera.position.y = damp(camera.position.y, 0.15 + ny * 0.22 * motionScale, 2, dt);
    camera.position.z = damp(camera.position.z, 5.8 - proximity * 0.3, 2, dt);
    camera.lookAt(0, 0.16 + ny * 0.07 * motionScale, 0);
  });

  return (
    <group ref={root} scale={0.92}>
      {/* Body */}
      <group ref={bodyRef} position={[0, -0.32, 0]}>
        {/* Torso — pearl-white ceramic */}
        <mesh>
          <sphereGeometry args={[0.78, 64, 64]} />
          <ShellMaterial />
        </mesh>

        {/* Neck stem + collar */}
        <mesh position={[0, 0.82, 0]}>
          <cylinderGeometry args={[0.13, 0.14, 0.3, 32]} />
          <SilverMaterial />
        </mesh>
        <mesh position={[0, 0.94, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.045, 24, 80]} />
          <SilverMaterial />
        </mesh>

        {/* Shoulders + articulated arms */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.68, 0.14, 0]}>
            {/* Shoulder cap */}
            <mesh>
              <sphereGeometry args={[0.17, 32, 32]} />
              <SilverMaterial />
            </mesh>
            {/* Upper arm */}
            <mesh position={[side * 0.11, -0.2, 0]} rotation={[0, 0, -side * 0.13]}>
              <capsuleGeometry args={[0.11, 0.28, 12, 24]} />
              <ShellMaterial />
            </mesh>
            {/* Elbow joint */}
            <mesh position={[side * 0.18, -0.4, 0]}>
              <sphereGeometry args={[0.12, 24, 24]} />
              <SilverMaterial />
            </mesh>
            {/* Forearm */}
            <mesh position={[side * 0.22, -0.62, 0]} rotation={[0, 0, -side * 0.07]}>
              <capsuleGeometry args={[0.09, 0.28, 12, 24]} />
              <ShellMaterial />
            </mesh>
            {/* Wrist band */}
            <mesh position={[side * 0.24, -0.78, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.095, 0.024, 16, 48]} />
              <SilverMaterial />
            </mesh>
            {/* Hand */}
            <mesh position={[side * 0.24, -0.88, 0]}>
              <sphereGeometry args={[0.115, 24, 24]} />
              <ShellMaterial />
            </mesh>
          </group>
        ))}

        {/* Chest aperture — translucent glass housing */}
        <mesh position={[0, 0.14, 0.72]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.24, 0.14, 48]} />
          <GlassMaterial />
        </mesh>
        {/* Chest core LED */}
        <mesh position={[0, 0.14, 0.78]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.05, 40]} />
          <meshStandardMaterial
            ref={coreMaterial}
            color={colors.redBright}
            emissive={colors.redBright}
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Head — kept round and friendly */}
      <group ref={headRef} position={[0, 1.02, 0]}>
        <mesh scale={[1, 0.96, 0.98]}>
          <sphereGeometry args={[0.56, 64, 64]} />
          <ShellMaterial />
        </mesh>

        {/* Translucent blush glass visor */}
        <RoundedBox args={[0.72, 0.46, 0.24]} radius={0.1} smoothness={4} position={[0, -0.02, 0.34]}>
          <GlassMaterial />
        </RoundedBox>

        {/* Eyes (crimson LED) — each in a group so the blink can scale safely */}
        <group ref={eyeGroup}>
          <group ref={eyeLeftBlink} position={[-0.16, 0, 0.5]}>
            <mesh ref={eyeLeft} scale={[1, 1, 0.44]}>
              <sphereGeometry args={[0.07, 24, 24]} />
              <meshStandardMaterial
                color={colors.red}
                emissive={colors.red}
                emissiveIntensity={2}
                toneMapped={false}
              />
            </mesh>
          </group>
          <group ref={eyeRightBlink} position={[0.16, 0, 0.5]}>
            <mesh ref={eyeRight} scale={[1, 1, 0.44]}>
              <sphereGeometry args={[0.07, 24, 24]} />
              <meshStandardMaterial
                color={colors.red}
                emissive={colors.red}
                emissiveIntensity={2}
                toneMapped={false}
              />
            </mesh>
          </group>
        </group>

        {/* Small mouth / visor line */}
        <RoundedBox args={[0.24, 0.03, 0.05]} radius={0.012} smoothness={3} position={[0, -0.19, 0.5]}>
          <meshStandardMaterial color="#C9CED9" metalness={0.7} roughness={0.3} />
        </RoundedBox>

        {/* Reflection that sweeps across the visor */}
        <mesh ref={sweep} position={[0, 0, 0.52]} rotation={[0, 0, 0.55]}>
          <planeGeometry args={[0.16, 0.62]} />
          <meshBasicMaterial
            color="#FFFFFF"
            transparent
            opacity={0.06}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        {/* Luminous crimson rim framing the visor */}
        <mesh position={[0, -0.02, 0.36]}>
          <torusGeometry args={[0.44, 0.024, 24, 120]} />
          <meshStandardMaterial
            ref={rimMaterial}
            color={colors.redBright}
            emissive={colors.redBright}
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>

        {/* Antenna */}
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.22, 16]} />
          <SilverMaterial />
        </mesh>
        <mesh position={[0, 0.75, 0]}>
          <sphereGeometry args={[0.05, 24, 24]} />
          <meshStandardMaterial
            ref={tipMaterial}
            color={colors.redBright}
            emissive={colors.redBright}
            emissiveIntensity={1.8}
            toneMapped={false}
          />
        </mesh>

        {/* Ear rings */}
        <mesh position={[-0.54, -0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.1, 0.03, 16, 48]} />
          <SilverMaterial />
        </mesh>
        <mesh position={[0.54, -0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.1, 0.03, 16, 48]} />
          <SilverMaterial />
        </mesh>

        <pointLight ref={faceLight} position={[0, 0, 1.1]} intensity={2.2} distance={4} color={colors.redBright} />
      </group>

      {/* Halo rings */}
      <mesh ref={halo}>
        <torusGeometry args={[1.06, 0.014, 16, 120]} />
        <meshBasicMaterial
          ref={haloMaterial}
          color={colors.redBright}
          transparent
          opacity={0.12}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[0.9, 0, 0]}>
        <torusGeometry args={[1.3, 0.006, 12, 96]} />
        <meshBasicMaterial
          color={colors.redBright}
          transparent
          opacity={0.07}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Heavy WebGL scene — loaded lazily via React.lazy from `InteractiveAICharacter`
 * so three.js stays out of the initial bundle.
 *
 * The environment is a hand-built studio rig of `Lightformer`s rendered into a
 * cube map by drei's `Environment` (children branch). That gives the clearcoat
 * and glass something to reflect without downloading an HDR at runtime — no
 * network fetch is performed.
 */
export default function AIScene({ pointerRef, reducedMotion, thinking = false }: AISceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.08,
      }}
      camera={{ position: [0, 0.15, 5.8], fov: 30, near: 0.1, far: 50 }}
      style={{ pointerEvents: "none" }}
    >
      <Lights />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#F6FAFF"]} />
        <Lightformer
          form="rect"
          intensity={2.6}
          color="#FFFFFF"
          position={[0, 3.4, 2.6]}
          scale={[7, 4, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.5}
          color="#EAF3FF"
          position={[-4.4, 1, 2.6]}
          scale={[4, 5, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.3}
          color="#CFE6FF"
          position={[4.4, 0.4, 2.4]}
          scale={[4, 5, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="ring"
          intensity={2.2}
          color={colors.redBright}
          position={[-3.4, 1.8, -3.4]}
          scale={3.2}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          color="#FFFFFF"
          position={[0, -3.4, 0.6]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[7, 7, 1]}
          target={[0, 0, 0]}
        />
      </Environment>
      <RobotModel pointerRef={pointerRef} reducedMotion={reducedMotion} thinking={thinking} />
      <ContactShadows
        position={[0, -1.09, 0]}
        opacity={0.32}
        scale={6}
        blur={2.7}
        far={2.4}
        resolution={256}
        color="#B47E90"
      />
    </Canvas>
  );
}
