import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewcube } from '@react-three/drei';
import { useActiveSketch, useCad } from '../store/cadStore';
import { CameraRig } from './CameraRig';
import { Axes, GroundGrid, SceneLights } from './SceneEnvironment';
import { SceneObjects } from './SceneObjects';
import { TransformGizmo, gizmoInteraction } from './TransformGizmo';
import { PlanePicker } from './PlanePicker';
import { SketchEditor } from './SketchEditor';
import { ExtrudePreview } from './ExtrudePreview';

export function Viewport() {
  const mode = useCad((s) => s.mode);
  const select = useCad((s) => s.select);
  const activeSketch = useActiveSketch();

  const onPointerMissed = (e: MouseEvent) => {
    if (e.button !== 0 || mode !== 'model') return;
    if (performance.now() - gizmoInteraction.lastUp < 300) return;
    select(null);
  };

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onPointerMissed={onPointerMissed}
      onContextMenu={(e) => e.preventDefault()}
    >
      <color attach="background" args={['#1a1e25']} />
      <CameraRig />
      <SceneLights />
      {mode !== 'sketch' && <GroundGrid />}
      <Axes />
      <SceneObjects />
      {mode === 'pickPlane' && <PlanePicker />}
      {mode === 'sketch' && activeSketch && <SketchEditor sketch={activeSketch} />}
      {mode === 'extrude' && <ExtrudePreview />}
      <TransformGizmo />
      {mode !== 'sketch' && (
        <GizmoHelper alignment="top-right" margin={[70, 70]}>
          <GizmoViewcube
            color="#2a313c"
            textColor="#d7dce4"
            strokeColor="#4a5566"
            hoverColor="#3b82f6"
            opacity={0.95}
          />
        </GizmoHelper>
      )}
    </Canvas>
  );
}
