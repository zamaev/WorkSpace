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
export function useTaskFilters() {
  const { people, types } = useData();
  // легаси-значение "me" из прежней версии трактуем как «все»
  const [assignee, setAssignee] = useState<string>(() => {
    const v = readPref(FILTER_ASSIGNEE_KEY);
    return v === null || v === "me" ? "all" : v;
  });
  const [type, setType] = useState<string>(
    () => readPref(FILTER_TYPE_KEY) ?? "all",
  );

  const pickAssignee = (v: string) => {
    setAssignee(v);
    writePref(FILTER_ASSIGNEE_KEY, v === "all" ? null : v);
  };
  const pickType = (v: string) => {
    setType(v);
    writePref(FILTER_TYPE_KEY, v === "all" ? null : v);
  };

  const matches = (t: Task): boolean => {
    if (assignee !== "all" && t.assigneeId !== Number(assignee)) return false;
    if (type !== "all" && t.typeId !== Number(type)) return false;
    return true;
  };

  const active = assignee !== "all" || type !== "all";

  const bar = (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        {[...people.values()]
          .sort((a, b) => a.position - b.position || a.id - b.id)
          .map((p) => {
            const on = assignee === String(p.id);
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
              const on = type === String(t.id);
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
