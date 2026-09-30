import { useState } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { SketchPlane } from '../types/cad';
import { PLANE_COLORS, planeQuaternion } from '../geometry/planes';
import { useCad } from '../store/cadStore';

const SIZE = 120;
const PLANES: SketchPlane[] = ['XY', 'XZ', 'YZ'];

/** Three clickable origin planes shown when starting a new sketch. */
export function PlanePicker() {
  const createSketch = useCad((s) => s.createSketch);
  const [hover, setHover] = useState<SketchPlane | null>(null);

  return (
    <>
      {PLANES.map((plane) => (
        <group key={plane} quaternion={planeQuaternion(plane)}>
          <mesh
            position={[SIZE / 2, SIZE / 2, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHover(plane);
            }}
            onPointerOut={() => setHover((h) => (h === plane ? null : h))}
            onClick={(e) => {
              if (e.nativeEvent.button !== 0) return;
              e.stopPropagation();
              createSketch(plane);
            }}
          >
            <planeGeometry args={[SIZE, SIZE]} />
            <meshBasicMaterial
              color={PLANE_COLORS[plane]}
              transparent
              opacity={hover === plane ? 0.45 : 0.18}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <Html position={[SIZE - 8, SIZE - 8, 0]} center style={{ pointerEvents: 'none' }}>
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">{plane}</span>
          </Html>
        </group>
      ))}
    </>
  );
}
