import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

// Открытая задача живёт в URL (?task=<id>): адрес отражает состояние вида,
// работают deep-link, перезагрузка и кнопки браузера назад/вперёд (в том
// числе возврат из заметки к открытой задаче). Пишем через replace: выбор
// задачи — состояние вида, а не отдельная запись истории, иначе каждая
// смена выбора (клик, стрелки ↑/↓) спамила бы историю браузера.
export function useTaskParam(): [number | null, (id: number | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("task");
  const selected = raw ? Number(raw) : null;
  const setSelected = useCallback(
    (id: number | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id === null) next.delete("task");
          else next.set("task", String(id));
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [selected, setSelected];
}
