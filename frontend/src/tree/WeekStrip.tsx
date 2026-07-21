import { useState, type DragEvent } from "react";
import { useData } from "../data/DataProvider";
import { tasksOn } from "../data/selectors";
import { addDays, fmtDayChip, mondayOf, todayISO, weekDays } from "../lib/dates";
import { getDragTask, hasDragTask } from "./dnd";

// Полоска недели внизу дерева: дроп-зона «раскидать по дням» + счётчики.
export function WeekStrip() {
  const { tasks, patch } = useData();
  const today = todayISO();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [over, setOver] = useState<string | null>(null);

  const onDrop = (day: string) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = getDragTask(e);
    if (id !== null) void patch(id, { scheduledOn: day });
  };

  return (
    <div className="weekstrip">
      <button type="button" className="icon-btn self-center" onClick={() => setMonday(addDays(monday, -7))} aria-label="Предыдущая неделя">
        ◂
      </button>
      {weekDays(monday).map((day) => {
        const count = tasksOn(tasks, day).length;
        return (
          <div
            key={day}
            className={`wcell ${day === today ? "wcell-today" : ""} ${over === day ? "wcell-drop" : ""}`}
            onDragOver={(e) => {
              if (!hasDragTask(e)) return;
              e.preventDefault();
              setOver(day);
            }}
            onDragLeave={() => setOver((v) => (v === day ? null : v))}
            onDrop={onDrop(day)}
          >
            <span className="font-medium">{fmtDayChip(day)}</span>
            <span className="mmeta">{count > 0 ? count : "·"}</span>
          </div>
        );
      })}
      <button type="button" className="icon-btn self-center" onClick={() => setMonday(addDays(monday, 7))} aria-label="Следующая неделя">
        ▸
      </button>
      {monday !== mondayOf(today) && (
        <button type="button" className="seg self-center whitespace-nowrap" onClick={() => setMonday(mondayOf(today))}>
          Сегодня
        </button>
      )}
    </div>
  );
}
