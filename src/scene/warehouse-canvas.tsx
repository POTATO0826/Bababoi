import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import * as THREE from "three";
import { FLOOR_D, FLOOR_W } from "@/data/layout";
import { useWare } from "@/store";
import { BaysLayer } from "./bays";
import { CameraRig } from "./camera-rig";
import { FurnitureLayer } from "./furniture/furniture-layer";
import { Structure } from "./structure";

const CENTER = new THREE.Vector3(FLOOR_W / 2, 0, FLOOR_D / 2);

function Lights() {
  return (
    <>
      <hemisphereLight args={["#cfd8ff", "#16161b", 0.6]} />
      <ambientLight intensity={0.2} />
      {/* Key light from the front-left, soft shadows falling back and to the right. */}
      <directionalLight
        position={[CENTER.x - 45, 75, CENTER.z + 60]}
        intensity={2.4}
        color="#fff6ea"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={1}
        shadow-camera-far={260}
      >
        <object3D attach="target" position={CENTER.toArray()} />
      </directionalLight>
      {/* Cool fill from the opposite side. */}
      <directionalLight position={[CENTER.x + 60, 40, CENTER.z - 50]} intensity={0.45} color="#b9c8ff">
        <object3D attach="target" position={CENTER.toArray()} />
      </directionalLight>
      {/* Studio-style reflections without loading an HDR file. */}
      <Environment resolution={128} environmentIntensity={0.35}>
        <Lightformer form="rect" intensity={2} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#c9d6ff" position={[-10, 3, 6]} rotation-y={Math.PI / 2} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#ffe4c4" position={[10, 3, -6]} rotation-y={-Math.PI / 2} scale={[12, 4, 1]} />
      </Environment>
    </>
  );
}

export default function WarehouseCanvas() {
  const floor = useWare((s) => s.floor);
  // Drop resolution and soft shadows if the device can't hold the frame rate.
  const [degraded, setDegraded] = useState(false);

  return (
    <Canvas
      orthographic
      shadows={degraded ? true : "soft"}
      dpr={degraded ? 1 : [1, 2]}
      camera={{ position: [150, 150, 150], zoom: 8, near: 1, far: 1000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <PerformanceMonitor onDecline={() => setDegraded(true)} flipflops={2} />
      <CameraRig />
      <Lights />
      <Structure floor={floor} />
      <BaysLayer floor={floor} />
      <FurnitureLayer floor={floor} />
    </Canvas>
  );
}
