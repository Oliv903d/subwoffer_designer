import { useEffect, useState } from 'react';
import { TransformControls } from '@react-three/drei';
import type * as THREE from 'three';
import type { Transform, Vec3 } from '../types/cad';
import { useCad } from '../store/cadStore';
import { applyTransform, radToDeg } from '../geometry/buildGeometry';
import { round } from '../utils/units';
import { objectRegistry } from './ObjectMesh';

/** Timestamp of the last gizmo interaction, so a gizmo click is not treated as "click on empty space". */
export const gizmoInteraction = { lastUp: 0 };

const SNAP = { translation: 1, rotation: Math.PI / 36, scale: 0.05 };

function readTransform(o: THREE.Object3D): Transform {
  const r = (v: number, d = 3) => round(v, d);
  return {
    position: [r(o.position.x), r(o.position.y), r(o.position.z)],
    rotation: [r(radToDeg(o.rotation.x)), r(radToDeg(o.rotation.y)), r(radToDeg(o.rotation.z))],
    scale: [r(o.scale.x, 4), r(o.scale.y, 4), r(o.scale.z, 4)],
  };
}

const sameVec = (a: Vec3, b: Vec3) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

export function TransformGizmo() {
  const mode = useCad((s) => s.mode);
  const tool = useCad((s) => s.transformTool);
  const selected = useCad((s) => s.objects.find((o) => o.id === s.selectedId) ?? null);
  const setTransform = useCad((s) => s.setTransform);
  const [target, setTarget] = useState<THREE.Object3D | null>(null);

  const active =
    mode === 'model' &&
    tool !== 'select' &&
    !!selected &&
    selected.kind !== 'sketch' &&
    !(selected.kind === 'enclosure' && tool === 'scale') &&
    selected.visible;

  useEffect(() => {
    setTarget(active && selected ? (objectRegistry.get(selected.id) ?? null) : null);
  }, [active, selected]);

  if (!active || !target || !selected) return null;

  const commit = () => {
    gizmoInteraction.lastUp = performance.now();
    const next = readTransform(target);
    const prev = selected.transform;
    if (sameVec(next.position, prev.position) && sameVec(next.rotation, prev.rotation) && sameVec(next.scale, prev.scale)) {
      applyTransform(target, prev);
      return;
    }
    setTransform(selected.id, next);
  };

  return (
    <TransformControls
      object={target}
      mode={tool}
      size={0.9}
      translationSnap={SNAP.translation}
      rotationSnap={SNAP.rotation}
      scaleSnap={SNAP.scale}
      onMouseDown={() => (gizmoInteraction.lastUp = performance.now())}
      onMouseUp={commit}
    />
  );
}
