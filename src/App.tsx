import { useEffect, useState } from 'react';
import { Viewport } from './scene/Viewport';
import { TopBar } from './ui/TopBar';
import { ModelTree } from './ui/ModelTree';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { BottomToolbar } from './ui/BottomToolbar';
import { EmptyState, PlanePickerOverlay, SketchBanner, ViewControls } from './ui/ViewportOverlays';
import { ProjectsDialog } from './ui/ProjectsDialog';
import { Toast } from './ui/Toast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { restoreLastProject } from './storage/projectActions';
import { useCad } from './store/cadStore';

export function App() {
  const [projectsOpen, setProjectsOpen] = useState(false);
  useKeyboardShortcuts(!projectsOpen);

  useEffect(() => {
    restoreLastProject();
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (useCad.getState().dirty && useCad.getState().objects.length > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TopBar onOpenProjects={() => setProjectsOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <ModelTree />
        <main className="relative min-w-0 flex-1">
          <Viewport />
          <ViewControls />
          <EmptyState />
          <PlanePickerOverlay />
          <SketchBanner />
        </main>
        <PropertiesPanel />
      </div>
      <BottomToolbar />
      <Toast />
      {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
    </div>
  );
}
