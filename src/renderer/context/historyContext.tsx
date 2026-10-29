import type { JSX } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectData } from '../../shared/domain/projectTypes';

export type HistoryMutationMode = 'record' | 'coalesce' | 'commit-coalesced' | 'replace';

export type HistoryOptions = {
  mode?: HistoryMutationMode;
  label?: string;
};

type HistoryContextValue = {
  project: ProjectData | null;
  canUndo: boolean;
  canRedo: boolean;
  pastCount: number;
  futureCount: number;
  historyLimit: number;
  setProject: (next: ProjectData, options?: HistoryOptions) => void;
  replaceProject: (next: ProjectData | null) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
};

const HistoryContext = createContext<HistoryContextValue | null>(null);
const DEFAULT_HISTORY_LIMIT = 100;

type Props = { initialProject: ProjectData | null; children: React.ReactNode; historyLimit?: number };

function cloneProject(project: ProjectData): ProjectData {
  return typeof structuredClone === 'function'
    ? structuredClone(project)
    : JSON.parse(JSON.stringify(project)) as ProjectData;
}

export function HistoryProvider({ initialProject, children, historyLimit = DEFAULT_HISTORY_LIMIT }: Props): JSX.Element {
  const [project, setCurrentProject] = useState<ProjectData | null>(initialProject ? cloneProject(initialProject) : null);
  const [past, setPast] = useState<ProjectData[]>([]);
  const [future, setFuture] = useState<ProjectData[]>([]);
  const coalescedBaseRef = useRef<ProjectData | null>(null);
  const limit = Math.max(1, Math.floor(historyLimit));

  const replaceProjectInternal = (next: ProjectData | null): void => {
    setCurrentProject(next ? cloneProject(next) : null);
    setPast([]);
    setFuture([]);
    coalescedBaseRef.current = null;
  };

  const replaceProject = useCallback((next: ProjectData | null): void => {
    replaceProjectInternal(next);
  }, []);

  const setProject = useCallback((next: ProjectData, options: HistoryOptions = {}): void => {
    const mode = options.mode ?? 'record';
    const nextSnapshot = cloneProject(next);

    if (!project) {
      setCurrentProject(nextSnapshot);
      return;
    }

    if (mode === 'replace') {
      setCurrentProject(nextSnapshot);
      coalescedBaseRef.current = null;
      return;
    }

    if (mode === 'coalesce') {
      if (!coalescedBaseRef.current) { coalescedBaseRef.current = cloneProject(project); setFuture([]); }
      setCurrentProject(nextSnapshot);
      return;
    }

    if (mode === 'commit-coalesced') {
      const base = coalescedBaseRef.current;
      coalescedBaseRef.current = null;
      if (!base) {
        setCurrentProject(nextSnapshot);
        return;
      }
      if (JSON.stringify(base) === JSON.stringify(nextSnapshot)) {
        setCurrentProject(nextSnapshot);
        return;
      }
      setPast((items) => [...items, base].slice(-limit));
      setFuture([]);
      setCurrentProject(nextSnapshot);
      return;
    }

    const pendingBase = coalescedBaseRef.current;
    coalescedBaseRef.current = null;
    setPast((items) => [...items, ...(pendingBase && JSON.stringify(pendingBase) !== JSON.stringify(project) ? [pendingBase, cloneProject(project)] : [cloneProject(project)])].slice(-limit));
    setFuture([]);
    setCurrentProject(nextSnapshot);
  }, [limit, project]);

  const undo = useCallback((): void => {
    if (!project) return;
    const pendingBase = coalescedBaseRef.current;
    if (pendingBase) {
      coalescedBaseRef.current = null;
      if (JSON.stringify(pendingBase) !== JSON.stringify(project)) {
        setFuture((items) => [...items, cloneProject(project)].slice(-limit));
        setCurrentProject(cloneProject(pendingBase));
        return;
      }
    }
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [...items, cloneProject(project)].slice(-limit));
    setCurrentProject(cloneProject(previous));
  }, [limit, past, project]);

  const redo = useCallback((): void => {
    if (!project) return;
    if (coalescedBaseRef.current) {
      const base = coalescedBaseRef.current;
      coalescedBaseRef.current = null;
      if (JSON.stringify(base) !== JSON.stringify(project)) setPast((items) => [...items, cloneProject(base)].slice(-limit));
      setFuture([]);
      return;
    }
    if (future.length === 0) return;
    const next = future[future.length - 1];
    if (!next) return;
    setFuture((items) => items.slice(0, -1));
    setPast((items) => [...items, cloneProject(project)].slice(-limit));
    setCurrentProject(cloneProject(next));
  }, [future, limit, project]);

  const clearHistory = useCallback((): void => {
    setPast([]);
    setFuture([]);
    coalescedBaseRef.current = null;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      // Asset editor owns an isolated undo stack only while focus is inside it.
      if (target?.closest('.mrp-asset-editor')) return;
      // Preserve native history for editable text, but app undo must work for
      // ranges, checkboxes, color pickers, selects, buttons and canvas controls.
      const textInput = target?.closest('textarea, [contenteditable="true"], input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="password"], input[type="tel"]');
      if (textInput) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  const value = useMemo<HistoryContextValue>(() => ({
    project,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    pastCount: past.length,
    futureCount: future.length,
    historyLimit: limit,
    setProject,
    replaceProject,
    undo,
    redo,
    clearHistory,
  }), [clearHistory, future.length, limit, past.length, project, redo, replaceProject, setProject, undo]);

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useProjectHistory(): HistoryContextValue {
  const value = useContext(HistoryContext);
  if (!value) throw new Error('useProjectHistory must be used inside HistoryProvider.');
  return value;
}
