import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useData } from "../data/DataProvider";
import { rootTasks } from "../data/selectors";
import type { Project } from "../data/types";
import { MLabel } from "../components/ui";
import { NewTaskInput, TreeNode } from "./TreeNode";

const CLOSED_KEY = "workspace-closed";

function loadClosed(): Set<number> {
  try {
    const raw = localStorage.getItem(CLOSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {
    // битый localStorage — просто стартуем со всем раскрытым
  }
  return new Set();
}

// Дерево задач одного проекта (центральная панель раздела «Проекты»).
export function TreeView({
  project,
  selectedId,
  onSelect,
}: {
  project: Project;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const { tasks, create } = useData();
  // храним свёрнутые (а не раскрытые): новые узлы по умолчанию раскрыты
  const [closed, setClosed] = useState<Set<number>>(loadClosed);
  const [params, setParams] = useSearchParams();
  const [flashId, setFlashId] = useState<number | null>(null);

  const isOpen = useCallback((id: number) => !closed.has(id), [closed]);
  const toggleOpen = useCallback((id: number) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]));
      } catch {
        // недоступный localStorage — состояние живёт до перезагрузки
      }
      return next;
    });
  }, []);

  // переход «в дереве →» из недели: раскрыть путь, подсветить, проскроллить
  useEffect(() => {
    const focus = params.get("focus");
    if (!focus) return;
    const id = Number(focus);
    if (!tasks.has(id)) return;
    setClosed((prev) => {
      const next = new Set(prev);
      let cur = tasks.get(id)?.parentId ?? null;
      while (cur !== null) {
        next.delete(cur);
        cur = tasks.get(cur)?.parentId ?? null;
      }
      return next;
    });
    setFlashId(id);
    onSelect(id);
    const timer = setTimeout(() => {
      setFlashId(null);
      setParams({}, { replace: true });
    }, 2200);
    return () => clearTimeout(timer);
  }, [params, tasks, setParams, onSelect]);

  const roots = rootTasks(tasks, project.id);

  return (
    <div className="flex-1 min-w-0 panel px-3 py-3">
      <MLabel className="px-3 pb-2">{project.name}</MLabel>
      {roots.length === 0 && (
        <p className="px-3 py-2 text-[13px] text-dim">В проекте пусто. Добавь первую задачу.</p>
      )}
      {roots.map((t) => (
        <TreeNode
          key={t.id}
          task={t}
          depth={0}
          color={project.color}
          isOpen={isOpen}
          toggleOpen={toggleOpen}
          flashId={flashId}
          selectedId={selectedId}
          onSelect={(id) => onSelect(id)}
        />
      ))}
      <NewTaskInput
        depth={0}
        color={project.color}
        placeholder="Новая задача…"
        onSubmit={async (title) => void (await create({ title, projectId: project.id }))}
      />
    </div>
  );
}
