import { useEffect } from 'react';
import { useCad, type SketchTool, type TransformTool } from '../store/cadStore';
import { saveCurrentProject } from '../storage/projectActions';

const TRANSFORM_KEYS: Record<string, TransformTool> = { v: 'select', m: 'translate', r: 'rotate', s: 'scale' };
const SKETCH_KEYS: Record<string, SketchTool> = { v: 'select', l: 'line', r: 'rect', c: 'circle', a: 'arc', p: 'polygon' };

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function useKeyboardShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useCad.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Save works everywhere, including while typing.
      if (ctrl && key === 's') {
        e.preventDefault();
        saveCurrentProject();
        return;
      }
      if (isTyping(e.target)) return;

      if (ctrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        s.redo();
      } else if (ctrl && key === 'd') {
        e.preventDefault();
        if (s.selectedId && s.mode === 'model') s.duplicateObject(s.selectedId);
      } else if (e.key === 'Delete') {
        if (s.mode === 'sketch' && s.selectedEntityId) s.deleteEntity(s.selectedEntityId);
        else if (s.mode === 'model' && s.selectedId) s.deleteObject(s.selectedId);
      } else if (e.key === 'Escape') {
        if (s.mode === 'pickPlane') s.cancelPickPlane();
        else if (s.mode === 'extrude') s.cancelExtrude();
        else if (s.mode === 'sketch') {
          if (s.draft) s.setDraft(null);
          else if (s.sketchTool !== 'select') s.setSketchTool('select');
          else s.selectEntity(null);
        } else if (s.transformTool !== 'select') s.setTransformTool('select');
        else s.select(null);
      } else if (e.key === 'Enter' && s.mode === 'extrude') {
        s.confirmExtrude();
      } else if (!ctrl && !e.altKey) {
        if (s.mode === 'sketch' && SKETCH_KEYS[key]) s.setSketchTool(SKETCH_KEYS[key]);
        else if (s.mode === 'model' && TRANSFORM_KEYS[key]) s.setTransformTool(TRANSFORM_KEYS[key]);
        else if (s.mode === 'model' && key === 'f') s.requestView('fit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
