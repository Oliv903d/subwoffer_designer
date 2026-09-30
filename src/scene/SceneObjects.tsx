import { useCad } from '../store/cadStore';
import { ObjectMesh } from './ObjectMesh';
import { SketchView } from './SketchView';
import { EnclosureParts } from './EnclosureParts';

export function SceneObjects() {
  const objects = useCad((s) => s.objects);
  const selectedId = useCad((s) => s.selectedId);
  const hoveredId = useCad((s) => s.hoveredId);
  const mode = useCad((s) => s.mode);
  const activeSketchId = useCad((s) => s.activeSketchId);
  const interactive = mode === 'model';

  return (
    <>
      {objects.map((o) => {
        if (o.kind === 'sketch') {
          const active = mode === 'sketch' && o.id === activeSketchId;
          if (!o.visible && !active) return null;
          return (
            <SketchView
              key={o.id}
              sketch={o}
              active={active}
              selected={o.id === selectedId}
              interactive={interactive}
            />
          );
        }
        if (!o.visible) return null;
        return (
          <ObjectMesh
            key={o.id}
            obj={o}
            selected={o.id === selectedId && mode !== 'sketch'}
            hovered={interactive && o.id === hoveredId}
            interactive={interactive}
            ghost={mode === 'sketch'}
          >
            {o.kind === 'enclosure' && (
              <EnclosureParts obj={o} selected={o.id === selectedId && interactive} interactive={interactive} />
            )}
          </ObjectMesh>
        );
      })}
    </>
  );
}
