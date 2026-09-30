import { useRef } from 'react';
import {
  ArrowUpFromLine,
  Box,
  Download,
  FileBraces,
  FilePlus,
  FolderOpen,
  PencilRuler,
  Redo2,
  Save,
  Undo2,
  Upload,
} from 'lucide-react';
import { useCad } from '../store/cadStore';
import type { Units } from '../types/cad';
import {
  createNewProject,
  exportCurrentJson,
  exportCurrentStl,
  importProjectFile,
  saveCurrentProject,
} from '../storage/projectActions';
import { Divider, TextField, ToolButton } from './controls';

export function TopBar({ onOpenProjects }: { onOpenProjects: () => void }) {
  const projectName = useCad((s) => s.projectName);
  const dirty = useCad((s) => s.dirty);
  const units = useCad((s) => s.units);
  const mode = useCad((s) => s.mode);
  const canUndo = useCad((s) => s.history.past.length > 0);
  const canRedo = useCad((s) => s.history.future.length > 0);
  const extrudable = useCad((s) => s.findExtrudableSketch());
  const { undo, redo, setProjectName, setUnits, startNewSketch, startExtrude } = useCad.getState();
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = mode === 'extrude' || mode === 'pickPlane';

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <div className="mr-2 flex items-center gap-2 pr-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-accent">
          <Box size={15} className="text-white" />
        </div>
        <span className="text-[13px] font-semibold tracking-wide">MiniCAD</span>
      </div>

      <TextField value={projectName} onCommit={setProjectName} className="w-44" />
      <span className={`mx-1 text-[11px] ${dirty ? 'text-amber-400' : 'text-muted'}`} title={dirty ? 'Unsaved changes' : 'All changes saved'}>
        {dirty ? '● Unsaved' : 'Saved'}
      </span>
      <Divider />

      <ToolButton icon={FilePlus} label="New" onClick={createNewProject} title="New project" />
      <ToolButton icon={FolderOpen} label="Open" onClick={onOpenProjects} title="Open, rename or delete saved projects" />
      <ToolButton icon={Save} label="Save" onClick={saveCurrentProject} shortcut="Ctrl+S" title="Save project in this browser" />
      <Divider />
      <ToolButton icon={Undo2} label="Undo" compact onClick={undo} disabled={!canUndo} shortcut="Ctrl+Z" />
      <ToolButton icon={Redo2} label="Redo" compact onClick={redo} disabled={!canRedo} shortcut="Ctrl+Y" />
      <Divider />
      <ToolButton
        icon={PencilRuler}
        label="Sketch"
        onClick={startNewSketch}
        disabled={mode !== 'model'}
        title="Create a new sketch on a plane"
      />
      <ToolButton
        icon={ArrowUpFromLine}
        label="Extrude"
        onClick={() => startExtrude()}
        disabled={busy || !extrudable}
        title={extrudable ? `Extrude ${extrudable.name}` : 'Draw a closed sketch profile first'}
      />

      <div className="flex-1" />

      <label className="flex items-center gap-1.5 text-[12px] text-muted" title="Display units (models are stored in mm)">
        Units
        <select
          className="rounded border border-line bg-panel-2 px-1.5 py-1 text-[12px] text-text outline-none focus:border-accent"
          value={units}
          onChange={(e) => setUnits(e.target.value as Units)}
        >
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="in">inches</option>
        </select>
      </label>
      <Divider />
      <ToolButton icon={Upload} label="Import" onClick={() => fileInput.current?.click()} title="Import project from JSON" />
      <ToolButton icon={FileBraces} label="JSON" onClick={exportCurrentJson} title="Export project as JSON" />
      <ToolButton icon={Download} label="STL" onClick={exportCurrentStl} title="Export visible solids as STL" />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importProjectFile(file);
        }}
      />
    </header>
  );
}
