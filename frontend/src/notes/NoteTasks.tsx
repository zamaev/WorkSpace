import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../data/DataProvider";
import { AnchoredPopover } from "../components/AnchoredPopover";

// Строка «Задачи» в заметке: прикреплённые задачи чипами + пикер «＋ задача».
// Клик по чипу ведёт к задаче — ?task открывает её в инспекторе; раскрытие
// пути и подсветку в дереве шлём разовым сигналом в navigation state.
export function NoteTasks({ noteId }: { noteId: number }) {
  const { tasks, taskNotes, createTaskNote, removeTaskNote } = useData();
  const navigate = useNavigate();
  const addRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);

  const linked = taskNotes.filter((tn) => tn.noteId === noteId);

  const goTo = (taskId: number) => {
    const t = tasks.get(taskId);
    if (!t) return;
    navigate(`/projects/${t.projectId}?task=${taskId}`, {
      state: { focus: taskId },
    });
  };

  return (
    <div className="note-tasks">
      <span className="mmeta flex-none">Задачи</span>
      {linked.map((tn) => {
        const t = tasks.get(tn.taskId);
        return (
          <span key={tn.id} className="note-task-chip">
            <button
              type="button"
              className="min-w-0 truncate"
              title="Перейти к задаче"
              onClick={() => goTo(tn.taskId)}
            >
              {t?.title?.trim() || "—"}
            </button>
            <button
              type="button"
              className="note-task-chip-x"
              title="Открепить"
              onClick={() => void removeTaskNote(tn.id)}
            >
              ✕
            </button>
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
            existing={new Set(linked.map((tn) => tn.taskId))}
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
  const matches =
    q === ""
      ? []
      : [...tasks.values()]
          .filter((t) => !existing.has(t.id) && t.title.toLowerCase().includes(q))
          .slice(0, 12);

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
