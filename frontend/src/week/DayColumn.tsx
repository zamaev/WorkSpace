import { useState, type DragEvent } from "react";
import { useData } from "../data/DataProvider";
import { tasksOn } from "../data/selectors";
import { fmtDayHeader, todayISO } from "../lib/dates";
import { getDragTask, hasDragTask } from "../tree/dnd";
import { TaskCard } from "./TaskCard";

export function DayColumn({ day }: { day: string }) {
  const { tasks, create, patch } = useData();
  const [colDrop, setColDrop] = useState(false);
  const [dropBeforeId, setDropBeforeId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const list = tasksOn(tasks, day);
  const isToday = day === todayISO();

  const clearDrop = () => {
    setColDrop(false);
    setDropBeforeId(null);
  };

  // drop на пустую часть колонки — в конец дня
  const onColumnDrop = (e: DragEvent) => {
    e.preventDefault();
    clearDrop();
    const id = getDragTask(e);
    if (id === null) return;
    const t = tasks.get(id);
    if (!t) return;
    if (t.scheduledOn === day) {
      // перенос в конец своего же дня
      const rest = list.filter((x) => x.id !== id);
      void patch(id, { dayPosition: rest.length });
      return;
    }
    void patch(id, { scheduledOn: day });
  };

  // drop на карточку — вставить перед ней
  const dropOnCard = (target: number) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearDrop();
    const id = getDragTask(e);
    if (id === null || id === target) return;
    const rest = list.filter((x) => x.id !== id);
    const idx = rest.findIndex((x) => x.id === target);
    if (idx === -1) return;
    const t = tasks.get(id);
    if (!t) return;
    if (t.scheduledOn === day) {
      void patch(id, { dayPosition: idx });
    } else {
      void patch(id, { scheduledOn: day, dayPosition: idx });
    }
  };

  const dragOverCard = (target: number) => (e: DragEvent) => {
    if (!hasDragTask(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setColDrop(false);
    setDropBeforeId(target);
  };

  return (
    <div
      className={`panel day-col ${colDrop ? "day-col-drop" : ""}`}
      onDragOver={(e) => {
        if (!hasDragTask(e)) return;
        e.preventDefault();
        setColDrop(true);
        setDropBeforeId(null);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDrop();
      }}
      onDrop={onColumnDrop}
    >
      <div className={`day-head ${isToday ? "!border-accent" : ""}`}>
        <span className={`text-[13px] font-semibold ${isToday ? "text-accent" : ""}`}>{fmtDayHeader(day)}</span>
        {list.length > 0 && <span className="mmeta">{list.filter((t) => t.done).length}/{list.length}</span>}
      </div>
      {list.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          dropBefore={dropBeforeId === t.id}
          onCardDragOver={dragOverCard(t.id)}
          onCardDrop={dropOnCard(t.id)}
        />
      ))}
      <input
        className="ghost-input text-[13px] px-1 pt-1"
        name="day-quick-add"
        aria-label={`Новая задача на ${fmtDayHeader(day)}`}
        placeholder="＋ задача…"
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && draft.trim()) {
            setBusy(true);
            await create({ title: draft.trim(), scheduledOn: day });
            setBusy(false);
            setDraft("");
          }
          if (e.key === "Escape") setDraft("");
        }}
      />
    </div>
  );
}
