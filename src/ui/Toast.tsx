import { useEffect } from 'react';
import { useCad } from '../store/cadStore';

export function Toast() {
  const toast = useCad((s) => s.toast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      if (useCad.getState().toast?.id === toast.id) useCad.setState({ toast: null });
    }, 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div
      role="status"
      className={`pointer-events-none fixed bottom-14 left-1/2 z-50 -translate-x-1/2 rounded-md border px-3 py-2 text-[12px] shadow-2xl ${
        toast.kind === 'error' ? 'border-red-500/50 bg-red-950/95 text-red-100' : 'border-line bg-panel-2/95 text-text'
      }`}
    >
      {toast.message}
    </div>
  );
}
