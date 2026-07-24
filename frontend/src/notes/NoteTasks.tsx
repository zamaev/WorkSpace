import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../data/DataProvider";
import type { Task } from "../data/types";
import { AnchoredPopover } from "../components/AnchoredPopover";
import { ConfirmButton } from "../components/ConfirmButton";

// Строка «Задачи» в заметке: прикреплённые задачи чипами + пикер «＋ задача».
// Привязка живёт на ЛОГИЧЕСКОЙ задаче: чип представляет всю серию повторов —
// показываем последнее живое вхождение, клик ведёт к нему. ?task открывает
// инспектор; раскрытие пути и подсветку шлём сигналом в navigation state.
export function NoteTasks({ noteId }: { noteId: number }) {
  const { tasks, taskNotes, createTaskNote, removeTaskNote } = useData();
  const navigate = useNavigate();
  const addRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);

  const linked = taskNotes.filter((tn) => tn.noteId === noteId);

  // представитель логической задачи — последнее созданное живое вхождение
  const representative = (logicalId: number) => {
    let best: Task | undefined;
    for (const t of tasks.values()) {
      if (t.logicalId === logicalId && (!best || t.id > best.id)) best = t;
    }
    return best;
  };
  const isSeries = (logicalId: number) =>
    [...tasks.values()].filter((t) => t.logicalId === logicalId).length > 1;

  const goTo = (t: Task) => {
    navigate(`/projects/${t.projectId}?task=${t.id}`, {
      state: { focus: t.id },
    });
  };

  return (
    <div className="note-tasks">
      <span className="mmeta flex-none">Задачи</span>
      {linked.map((tn) => {
        const t = representative(tn.logicalId);
        return (
          <span key={tn.id} className="note-task-chip">
            <button
              type="button"
              className="min-w-0 truncate"
              title="Перейти к задаче"
              onClick={() => t && goTo(t)}
            >
              {t?.title?.trim() || "—"}
            </button>
            <ConfirmButton
              className="note-task-chip-x"
              title="Открепить"
              message={
                isSeries(tn.logicalId)
                  ? "Открепить заметку от всей серии повторов?"
                  : "Открепить задачу от заметки?"
              }
              confirmLabel="Открепить"
              onConfirm={() => void removeTaskNote(tn.id)}
            >
              ✕
            </ConfirmButton>
          </span>
        );
      })}
      <button
        ref={addRef}
        type="button"
        className="mmeta !text-accent flex-none"
        onClick={() => setPicking((v) => !v)}
      >
        ＋ задача
      </button>
      {picking && (
        <AnchoredPopover anchorRef={addRef} onClose={() => setPicking(false)}>
          <TaskPicker
            existing={new Set(linked.map((tn) => tn.logicalId))}
            onPick={async (taskId) => {
              await createTaskNote(taskId, noteId);
              setPicking(false);
            }}
          />
        </AnchoredPopover>
      )}
    </div>
  );
}

function TaskPicker({
  existing,
  onPick,
}: {
  existing: Set<number>;
  onPick: (taskId: number) => Promise<void>;
}) {
  const { tasks } = useData();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // серия повторов — одна логическая задача: в результатах только её
  // последнее созданное вхождение, прошлые done-копии не засоряют поиск
  let matches: Task[] = [];
  if (q !== "") {
    const byLogical = new Map<number, Task>();
    for (const t of tasks.values()) {
      if (existing.has(t.logicalId) || !t.title.toLowerCase().includes(q))
        continue;
      const cur = byLogical.get(t.logicalId);
      if (!cur || t.id > cur.id) byLogical.set(t.logicalId, t);
    }
    matches = [...byLogical.values()].sort((a, b) => a.id - b.id).slice(0, 12);
  }

  return (
    <div className="w-[240px]">
      <div className="mlabel pb-1.5">Прикрепить задачу</div>
      <input
        className="ghost-input border border-line rounded-[8px] px-2 py-1 text-[13px] w-full"
        name="task-link-search"
        aria-label="Поиск задачи"
        placeholder="Найти задачу…"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex flex-col gap-0.5 pt-1.5 max-h-[240px] overflow-y-auto">
        {matches.map((t) => (
          <button
            key={t.id}
            type="button"
            className="pop-item"
            onClick={() => void onPick(t.id)}
          >
            <span className="truncate">{t.title}</span>
          </button>
        ))}
        {q !== "" && matches.length === 0 && (
          <p className="text-[12px] text-dim px-2.5 py-1 m-0">
            Ничего не нашлось.
          </p>
        )}
      </div>
    </div>
  );
}
