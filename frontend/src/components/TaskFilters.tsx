import { useState } from "react";
import { useData } from "../data/DataProvider";
import {
  FILTER_ASSIGNEE_KEY,
  FILTER_TYPE_KEY,
  readPref,
  writePref,
} from "../lib/prefs";
import type { Task } from "../data/types";
import { AvatarDot } from "./ui";
import { TypeBadge } from "./TypeBadge";

// Общий фильтр Недели и Ганта: исполнитель («все», «я», человек) + тип.
// Возвращает предикат и готовую панель; состояние — в localStorage.
// Сохранённое значение фильтра валидно, только если указывает на живую
// запись: после удаления человека/типа (или мусора в localStorage)
// фильтр молча прятал бы все задачи без индикации.
export function normalizeFilter(
  saved: string | null,
  liveIds: number[],
): string {
  if (saved === null || saved === "me" || saved === "all") return "all";
  const id = Number(saved);
  return Number.isInteger(id) && liveIds.includes(id) ? saved : "all";
}

export function useTaskFilters() {
  const { people, types } = useData();
  const [assignee, setAssignee] = useState<string>(
    () => readPref(FILTER_ASSIGNEE_KEY) ?? "all",
  );
  const [type, setType] = useState<string>(
    () => readPref(FILTER_TYPE_KEY) ?? "all",
  );
  // валидация после загрузки справочников (и на случай удаления во
  // время сессии — people/types обновляются)
  const validAssignee = normalizeFilter(assignee, [...people.keys()]);
  const validType = normalizeFilter(type, [...types.keys()]);

  const pickAssignee = (v: string) => {
    setAssignee(v);
    writePref(FILTER_ASSIGNEE_KEY, v === "all" ? null : v);
  };
  const pickType = (v: string) => {
    setType(v);
    writePref(FILTER_TYPE_KEY, v === "all" ? null : v);
  };

  const matches = (t: Task): boolean => {
    if (validAssignee !== "all" && t.assigneeId !== Number(validAssignee))
      return false;
    if (validType !== "all" && t.typeId !== Number(validType)) return false;
    return true;
  };

  const active = validAssignee !== "all" || validType !== "all";

  const bar = (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        {[...people.values()]
          .sort((a, b) => a.position - b.position || a.id - b.id)
          .map((p) => {
            const on = validAssignee === String(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={`rounded-full flex ${on ? "" : "opacity-45 hover:opacity-100"}`}
                style={
                  on
                    ? {
                        boxShadow:
                          "0 0 0 2px var(--bg), 0 0 0 4px var(--accent)",
                      }
                    : undefined
                }
                title={on ? `${p.name} — снять фильтр` : p.name}
                onClick={() => pickAssignee(on ? "all" : String(p.id))}
              >
                <AvatarDot name={p.name} color={p.color} size={20} />
              </button>
            );
          })}
      </div>
      {types.size > 0 && people.size > 0 && <span className="filter-divider" />}
      {types.size > 0 && (
        <div className="flex items-center gap-1">
          {[...types.values()]
            .sort((a, b) => a.position - b.position || a.id - b.id)
            .map((t) => {
              const on = validType === String(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`w-[26px] h-[24px] rounded-[8px] flex items-center justify-center ${on ? "bg-asoft" : "opacity-45 hover:opacity-100"}`}
                  style={
                    on ? { outline: "1px solid var(--accent)" } : undefined
                  }
                  title={on ? `${t.name} — снять фильтр` : t.name}
                  onClick={() => pickType(on ? "all" : String(t.id))}
                >
                  <TypeBadge type={t} size={13} />
                </button>
              );
            })}
        </div>
      )}
    </div>
  );

  return { matches, active, bar };
}
