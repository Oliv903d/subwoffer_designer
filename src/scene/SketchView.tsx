import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { SketchObject, Vec3 } from '../types/cad';
import { planeOrigin, planeQuaternion } from '../geometry/planes';
import { entityPolyline } from '../sketch/entities';
import { sketchShapes } from '../sketch/profiles';
import { useCad } from '../store/cadStore';

interface Props {
  sketch: SketchObject;
  active: boolean;
  selected: boolean;
  interactive: boolean;
}

const LINE_COLORS = {
  active: '#e6edf7',
  selected: '#ffb454',
  idle: '#6fb3ff',
  entitySelected: '#ffb454',
};

/** Draws a sketch's curves and filled closed profiles on its plane. */
export function SketchView({ sketch, active, selected, interactive }: Props) {
  const select = useCad((s) => s.select);
  const selectedEntityId = useCad((s) => (active ? s.selectedEntityId : null));
  const quaternion = useMemo(() => planeQuaternion(sketch.plane), [sketch.plane]);
  const position = planeOrigin(sketch.plane, sketch.offset);

  const fill = useMemo(() => {
    const shapes = sketchShapes(sketch.entities);
    return shapes.length ? new THREE.ShapeGeometry(shapes) : null;
  }, [sketch.entities]);
  useEffect(() => () => fill?.dispose(), [fill]);

  const onClick = interactive
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.nativeEvent.button !== 0) return;
        e.stopPropagation();
        select(sketch.id);
      }
    : undefined;

  const color = active ? LINE_COLORS.active : selected ? LINE_COLORS.selected : LINE_COLORS.idle;

  return (
    <group position={position} quaternion={quaternion} userData={{ cadId: sketch.id }}>
      {fill && (
        <mesh geometry={fill} onClick={onClick} renderOrder={1}>
          <meshBasicMaterial
            color={selected && !active ? '#ffb454' : '#4d8ef7'}
            transparent
            opacity={active ? 0.12 : selected ? 0.28 : 0.14}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {sketch.entities.map((e) => {
        const isSel = e.id === selectedEntityId;
        return (
          <Line
            key={e.id}
            points={entityPolyline(e).map((p): Vec3 => [p[0], p[1], 0.02])}
            color={isSel ? LINE_COLORS.entitySelected : color}
            lineWidth={isSel ? 3 : active ? 2 : 1.6}
            depthTest={!active}
            renderOrder={2}
            onClick={onClick}
          />
        );
      })}
    </group>
  );
}
