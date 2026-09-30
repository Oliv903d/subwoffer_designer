import { useEffect, useMemo } from 'react';
import { Edges } from '@react-three/drei';
import { findSketch, useCad } from '../store/cadStore';
import { buildExtrudeGeometry } from '../geometry/buildGeometry';

export function ExtrudePreview() {
  const extrude = useCad((s) => s.extrude);
  const sketch = useCad((s) => findSketch(s.objects, s.extrude?.sketchId ?? null));

  const geometry = useMemo(
    () => (sketch && extrude ? buildExtrudeGeometry(sketch.plane, sketch.offset, sketch.entities, extrude.distance) : null),
    [sketch, extrude],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#4d8ef7" transparent opacity={0.45} depthWrite={false} />
      <Edges threshold={20} color="#ffb454" />
    </mesh>
  );
}
