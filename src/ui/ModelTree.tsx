import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, Layers, Trash2 } from 'lucide-react';
import { useCad } from '../store/cadStore';
import type { CadObject } from '../types/cad';
import { objectIcon } from './icons';

function TreeRow({ obj }: { obj: CadObject }) {
  const selected = useCad((s) => s.selectedId === obj.id);
  const hovered = useCad((s) => s.hoveredId === obj.id);
  const mode = useCad((s) => s.mode);
  const isActiveSketch = useCad((s) => s.mode === 'sketch' && s.activeSketchId === obj.id);
  const { select, setHovered, renameObject, toggleVisibility, deleteObject, editSketch } = useCad.getState();
  const [editing, setEditing] = useState(false);
  const Icon = objectIcon(obj);
  const locked = mode !== 'model';

  return (
    <div
      className={`group flex h-7 cursor-pointer items-center gap-1.5 rounded pl-5 pr-1 ${
        selected || isActiveSketch ? 'bg-accent/25 text-sky-100' : hovered ? 'bg-panel-3' : 'hover:bg-panel-3'
      } ${!obj.visible ? 'opacity-50' : ''}`}
      onClick={() => !locked && select(obj.id)}
      onDoubleClick={() => !locked && setEditing(true)}
      onMouseEnter={() => !locked && setHovered(obj.id)}
      onMouseLeave={() => setHovered(null)}
      title={locked ? undefined : 'Click to select, double-click to rename'}
    >
      <Icon size={14} className={obj.kind === 'sketch' ? 'text-sky-400' : obj.kind === 'extrude' ? 'text-amber-400' : 'text-slate-300'} />
      {editing ? (
        <input
          autoFocus
          defaultValue={obj.name}
          maxLength={100}
          className="min-w-0 flex-1 rounded border border-accent bg-panel-2 px-1 text-[12px] outline-none"
          onFocus={(e) => e.target.select()}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            renameObject(obj.id, e.target.value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[12px]">{obj.name}</span>
      )}
      {isActiveSketch && <span className="text-[10px] text-sky-300">editing</span>}
      {obj.kind === 'sketch' && !locked && (
        <button
          className="hidden rounded px-1 text-[10px] text-sky-300 hover:bg-panel-2 group-hover:block"
          title="Edit sketch"
          onClick={(e) => {
            e.stopPropagation();
            editSketch(obj.id);
          }}
        >
          Edit
        </button>
      )}
      <button
        className="rounded p-0.5 text-muted hover:bg-panel-2 hover:text-text disabled:opacity-30"
        title={obj.visible ? 'Hide' : 'Show'}
        disabled={isActiveSketch}
        onClick={(e) => {
          e.stopPropagation();
          toggleVisibility(obj.id);
        }}
      >
        {obj.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <button
        className="rounded p-0.5 text-muted opacity-0 hover:bg-panel-2 hover:text-red-400 group-hover:opacity-100 disabled:hidden"
        title="Delete"
        disabled={locked}
        onClick={(e) => {
          e.stopPropagation();
          deleteObject(obj.id);
        }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export function ModelTree() {
  const objects = useCad((s) => s.objects);
  const projectName = useCad((s) => s.projectName);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex h-8 items-center gap-1.5 border-b border-line px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <Layers size={13} /> Browser
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        <div className="flex h-7 items-center gap-1 px-1 text-[12px] font-medium">
          <ChevronDown size={13} className="text-muted" />
          <span className="truncate">{projectName}</span>
        </div>
        {objects.map((o) => (
          <TreeRow key={o.id} obj={o} />
        ))}
        {objects.length === 0 && <p className="px-5 py-2 text-[11px] text-muted">No objects yet.</p>}
      </div>
    </aside>
  );
}
