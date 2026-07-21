import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useData } from "../data/DataProvider";
import { rootTasks } from "../data/selectors";
import { MLabel } from "../components/ui";
import { NewTaskInput, TreeNode } from "./TreeNode";
import { WeekStrip } from "./WeekStrip";

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

export function TreeView() {
  const { tasks, loading, offline, retry, create } = useData();
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
    if (!focus || loading) return;
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
    const timer = setTimeout(() => {
      setFlashId(null);
      setParams({}, { replace: true });
    }, 2200);
    return () => clearTimeout(timer);
  }, [params, loading, tasks, setParams]);

  if (loading) {
    return <p className="text-[13px] text-dim">Загрузка…</p>;
  }
  if (offline) {
    return (
      <div className="banner">
        Нет связи с сервером
        <button type="button" className="seg" onClick={retry}>
          Повторить
        </button>
      </div>
    );
  }

  const roots = rootTasks(tasks);

  return (
    <div className="pb-[120px]">
      <div className="panel px-3 py-3">
        <MLabel className="px-3 pb-2">Дерево задач</MLabel>
        {roots.length === 0 && (
          <p className="px-3 py-2 text-[13px] text-dim">Пусто. Создай первую ветку — например «Работа» или «Быт».</p>
        )}
        {roots.map((t) => (
          <TreeNode key={t.id} task={t} depth={0} isOpen={isOpen} toggleOpen={toggleOpen} flashId={flashId} />
        ))}
        <NewTaskInput depth={0} placeholder="Новая ветка…" onSubmit={async (title) => void (await create({ title }))} />
      </div>
      <WeekStrip />
    </div>
  );
}
