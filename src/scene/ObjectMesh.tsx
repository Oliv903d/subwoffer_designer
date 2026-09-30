import { useEffect, useMemo, type ReactNode } from 'react';
import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { SolidObject } from '../types/cad';
import { buildObjectGeometry, degToRad, geometryKey } from '../geometry/buildGeometry';
import { buildEnclosureOutline } from '../subwoofer/enclosureGeometry';
import { faceFromNormal } from '../subwoofer/faces';
import { useCad } from '../store/cadStore';

/** Scene objects by CAD id, used to attach the transform gizmo. */
export const objectRegistry = new Map<string, THREE.Object3D>();

interface Props {
  obj: SolidObject;
  selected: boolean;
  hovered: boolean;
  interactive: boolean;
  ghost: boolean;
  children?: ReactNode;
}

const COLORS = {
  base: '#9aa6b6',
  wood: '#b8925f',
  woodHover: '#cba577',
  hover: '#b9c4d3',
  selected: '#4d8ef7',
  edge: '#10141a',
  edgeSelected: '#ffb454',
};

export function ObjectMesh({ obj, selected, hovered, interactive, ghost, children }: Props) {
  const select = useCad((s) => s.select);
  const setHovered = useCad((s) => s.setHovered);
  const key = geometryKey(obj);
  const geometry = useMemo(() => buildObjectGeometry(obj), [key]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  const shapeKey = obj.kind === 'enclosure' ? JSON.stringify(obj.shape) : '';
  const outline = useMemo(() => (obj.kind === 'enclosure' ? buildEnclosureOutline(obj) : null), [shapeKey]);
  useEffect(() => () => outline?.dispose(), [outline]);

  if (!geometry) return null;
  const { position, rotation, scale } = obj.transform;
  const isBox = obj.kind === 'enclosure';
  const see = ghost || (isBox && obj.showInside);
  const opacity = ghost ? 0.25 : 0.35;
  const color = selected
    ? isBox
      ? '#d4ae78'
      : COLORS.selected
    : hovered
      ? isBox
        ? COLORS.woodHover
        : COLORS.hover
      : isBox
        ? COLORS.wood
        : COLORS.base;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    select(obj.id);
    if (isBox && e.face) useCad.getState().setSelectedFace(faceFromNormal(e.face.normal));
  };

  return (
    <mesh
      ref={(m) => {
        if (m) objectRegistry.set(obj.id, m);
        else objectRegistry.delete(obj.id);
      }}
      geometry={geometry}
      position={position}
      rotation={[degToRad(rotation[0]), degToRad(rotation[1]), degToRad(rotation[2])]}
      scale={scale}
      castShadow={!ghost}
      receiveShadow={!ghost}
      userData={{ cadId: obj.id }}
      onClick={interactive ? handleClick : undefined}
      onPointerOver={
        interactive
          ? (e) => {
              e.stopPropagation();
              setHovered(obj.id);
            }
          : undefined
      }
      onPointerOut={interactive ? () => setHovered(null) : undefined}
    >
      <meshStandardMaterial
        key={see ? 'ghost' : 'solid'}
        color={color}
        metalness={0.1}
        roughness={0.55}
        transparent={see}
        opacity={see ? opacity : 1}
        depthWrite={!see}
        side={see ? THREE.DoubleSide : THREE.FrontSide}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
      {outline ? (
        <lineSegments geometry={outline}>
          <lineBasicMaterial color={selected ? COLORS.edgeSelected : COLORS.edge} />
        </lineSegments>
      ) : (
        <Edges
          key={see ? 'ghost-edges' : 'solid-edges'}
          threshold={20}
          color={selected ? COLORS.edgeSelected : COLORS.edge}
          lineWidth={selected ? 2 : 1}
          transparent={see}
          opacity={ghost ? 0.3 : 1}
        />
      )}
      {children}
    </mesh>
  );
}
