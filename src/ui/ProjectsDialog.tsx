import { useRef, useState } from 'react';
import { Download, FilePlus, FolderOpen, Pencil, Trash2, Upload, X } from 'lucide-react';
import { useCad } from '../store/cadStore';
import { deleteProject, listProjects, loadProject, renameProject } from '../storage/projectStorage';
import { createNewProject, importProjectFile, openStoredProject } from '../storage/projectActions';
import { exportProjectJson } from '../export/exporters';
import { ToolButton } from './controls';

export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const currentId = useCad((s) => s.projectId);
  const [projects, setProjects] = useState(listProjects);
  const [renaming, setRenaming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = () => setProjects(listProjects());

  const iconBtn = 'rounded p-1 text-muted hover:bg-panel-3 hover:text-text';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[80vh] w-[560px] flex-col rounded-lg border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold">Projects</h2>
          <button className={iconBtn} onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1.5 border-b border-line px-4 py-2">
          <ToolButton
            icon={FilePlus}
            label="New project"
            onClick={() => {
              createNewProject();
              onClose();
            }}
          />
          <ToolButton icon={Upload} label="Import JSON" onClick={() => fileInput.current?.click()} />
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) {
                await importProjectFile(file);
                onClose();
              }
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {projects.length === 0 && (
            <p className="p-6 text-center text-[12px] text-muted">
              No saved projects yet. Press <b>Save</b> (Ctrl+S) to store the current project in this browser.
            </p>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              className={`group flex items-center gap-3 rounded px-3 py-2 hover:bg-panel-2 ${p.id === currentId ? 'ring-1 ring-accent/50' : ''}`}
            >
              <div className="min-w-0 flex-1">
                {renaming === p.id ? (
                  <input
                    autoFocus
                    defaultValue={p.name}
                    maxLength={100}
                    className="w-full rounded border border-accent bg-panel-2 px-2 py-0.5 text-[12px] outline-none"
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name) {
                        renameProject(p.id, name);
                        if (p.id === currentId) useCad.setState({ projectName: name });
                      }
                      setRenaming(null);
                      refresh();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <div className="truncate text-[13px]">
                    {p.name}
                    {p.id === currentId && <span className="ml-2 text-[10px] text-sky-300">current</span>}
                  </div>
                )}
                <div className="text-[11px] text-muted">
                  {p.objectCount} object{p.objectCount === 1 ? '' : 's'} · saved {new Date(p.updatedAt).toLocaleString()}
                </div>
              </div>
              <button
                className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[12px] text-white hover:bg-blue-500"
                onClick={() => {
                  openStoredProject(p.id);
                  onClose();
                }}
              >
                <FolderOpen size={13} /> Open
              </button>
              <button className={iconBtn} title="Rename" onClick={() => setRenaming(p.id)}>
                <Pencil size={14} />
              </button>
              <button
                className={iconBtn}
                title="Export JSON"
                onClick={() => {
                  const file = loadProject(p.id);
                  if (file) exportProjectJson(file);
                }}
              >
                <Download size={14} />
              </button>
              <button
                className={`${iconBtn} hover:text-red-400`}
                title="Delete"
                onClick={() => {
                  if (!window.confirm(`Delete "${p.name}" permanently?`)) return;
                  deleteProject(p.id);
                  if (p.id === currentId) useCad.setState({ dirty: true });
                  refresh();
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
