import { useCad } from '../store/cadStore';
import { exportProjectJson, exportStl } from '../export/exporters';
import { createId } from '../utils/id';
import {
  getLastProjectId,
  listProjects,
  loadProject,
  parseProjectJson,
  saveProject,
  setLastProjectId,
} from './projectStorage';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export function confirmDiscardChanges(): boolean {
  return !useCad.getState().dirty || window.confirm('You have unsaved changes. Discard them?');
}

export function saveCurrentProject(): boolean {
  const s = useCad.getState();
  const file = s.toProjectFile();
  try {
    saveProject(file);
    s.markSaved();
    s.notify(`Saved "${file.name}"`);
    return true;
  } catch {
    s.notify('Could not save: browser storage is full or unavailable.', 'error');
    return false;
  }
}

export function openStoredProject(id: string): void {
  if (id !== useCad.getState().projectId && !confirmDiscardChanges()) return;
  const file = loadProject(id);
  const s = useCad.getState();
  if (!file) {
    s.notify('That project could not be opened.', 'error');
    return;
  }
  s.loadProject(file);
  setLastProjectId(id);
  s.notify(`Opened "${file.name}"`);
}

export function createNewProject(): void {
  if (!confirmDiscardChanges()) return;
  useCad.getState().newProject();
}

export async function importProjectFile(file: File): Promise<void> {
  const s = useCad.getState();
  if (file.size > MAX_IMPORT_BYTES) {
    s.notify('File is too large to import.', 'error');
    return;
  }
  try {
    const project = parseProjectJson(await file.text());
    if (!confirmDiscardChanges()) return;
    // Never overwrite an existing stored project on import.
    if (listProjects().some((p) => p.id === project.id)) project.id = createId();
    s.loadProject(project, { dirty: true });
    s.notify(`Imported "${project.name}". Press Save to keep it.`);
  } catch (err) {
    s.notify(err instanceof Error ? err.message : 'Import failed.', 'error');
  }
}

export function exportCurrentJson(): void {
  exportProjectJson(useCad.getState().toProjectFile());
}

export function exportCurrentStl(): void {
  const s = useCad.getState();
  const count = exportStl(s.objects, s.projectName);
  if (count === 0) s.notify('Nothing to export: add a visible solid first.', 'error');
  else s.notify(`Exported ${count} solid${count === 1 ? '' : 's'} to STL (mm, Z-up).`);
}

export function restoreLastProject(): void {
  const id = getLastProjectId();
  const file = id ? loadProject(id) : null;
  if (file) useCad.getState().loadProject(file);
}
