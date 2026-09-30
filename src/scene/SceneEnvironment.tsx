import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Vec3 } from '../types/cad';

const AXIS_LENGTH = 2000;

const AXES: { color: string; dir: Vec3 }[] = [
  { color: '#e5484d', dir: [1, 0, 0] },
  { color: '#46a758', dir: [0, 1, 0] },
  { color: '#3e63dd', dir: [0, 0, 1] },
];

export function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#dfe8ff', '#2a2f38', 0.6]} />
      <directionalLight
        position={[400, 800, 300]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-800}
        shadow-camera-right={800}
        shadow-camera-top={800}
        shadow-camera-bottom={-800}
        shadow-camera-near={10}
        shadow-camera-far={3000}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-500, 300, -400]} intensity={0.4} />
    </>
  );
}

const GRID_HALF = 1000;
const GRID_PIECE = 100;

/**
 * Grid lines in the local XZ plane, split into short pieces so lines passing
 * behind the camera are clipped correctly on every renderer.
 */
function gridGeometry(step: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let c = -GRID_HALF; c <= GRID_HALF; c += step) {
    for (let t = -GRID_HALF; t < GRID_HALF; t += GRID_PIECE) {
      pts.push(c, 0, t, c, 0, t + GRID_PIECE);
      pts.push(t, 0, c, t + GRID_PIECE, 0, c);
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}

/** Minor (10 mm) and major (100 mm) grid lines in the local XZ plane. */
export function CadGrid() {
  const minor = useMemo(() => gridGeometry(10), []);
  const major = useMemo(() => gridGeometry(100), []);
  useEffect(
    () => () => {
      minor.dispose();
      major.dispose();
    },
    [minor, major],
  );
  return (
    <>
      <lineSegments geometry={minor} renderOrder={-2}>
        <lineBasicMaterial color="#252c36" depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={major} renderOrder={-1}>
        <lineBasicMaterial color="#3a4454" depthWrite={false} />
      </lineSegments>
    </>
  );
}

export function GroundGrid() {
  return (
    <>
      <CadGrid />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <shadowMaterial opacity={0.28} />
      </mesh>
    </>
  );
}

export function Axes() {
  return (
    <group>
      {AXES.map(({ color, dir }) => (
        <group key={color}>
          <Line
            points={[[0, 0, 0], dir.map((d) => d * AXIS_LENGTH) as Vec3]}
            color={color}
            lineWidth={1.5}
          />
          <Line
            points={[[0, 0, 0], dir.map((d) => -d * AXIS_LENGTH) as Vec3]}
            color={color}
            lineWidth={1}
            transparent
            opacity={0.3}
          />
        </group>
      ))}
    </group>
  );
}
