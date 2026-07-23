import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../data/DataProvider";
import type { Task } from "../data/types";
import { AnchoredPopover } from "./AnchoredPopover";
import { MLabel } from "./ui";

// Секция «Заметки» в инспекторе задачи: прикреплённые заметки + пикер
// «＋ прикрепить» (поиск заметки по названию). Клик по заметке ведёт в неё.
export function TaskNotes({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const { notes, taskNotes, createTaskNote, removeTaskNote } = useData();
  const navigate = useNavigate();
  const addRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);

  const linked = taskNotes.filter((tn) => tn.taskId === task.id);

  const goTo = (noteId: number) => {
    onClose();
    navigate(`/notes/${noteId}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between pb-1">
        <MLabel>Заметки</MLabel>
        <button
          ref={addRef}
          type="button"
          className="mmeta !text-accent"
          onClick={() => setPicking((v) => !v)}
        >
          ＋ прикрепить
        </button>
      </div>

      {linked.length === 0 ? (
        <p className="text-[12px] text-dim m-0 pb-1">Заметок нет.</p>
      ) : (
        <div className="flex flex-col gap-0.5 pb-1">
          {linked.map((tn) => {
            const note = notes.get(tn.noteId);
            return (
              <div key={tn.id} className="link-row">
                <button
                  type="button"
                  className="flex-1 min-w-0 truncate text-left text-[13px]"
                  title="Открыть заметку"
                  onClick={() => goTo(tn.noteId)}
                >
                  {note?.title?.trim() || "Без названия"}
                </button>
                <button
                  type="button"
                  className="row-btn row-btn-danger"
                  title="Открепить заметку"
                  onClick={() => void removeTaskNote(tn.id)}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {picking && (
        <AnchoredPopover anchorRef={addRef} onClose={() => setPicking(false)}>
          <NotePicker
            existing={new Set(linked.map((tn) => tn.noteId))}
            onPick={async (noteId) => {
              await createTaskNote(task.id, noteId);
              setPicking(false);
            }}
          />
        </AnchoredPopover>
      )}
    </div>
  );
}

function NotePicker({
  existing,
  onPick,
}: {
  existing: Set<number>;
  onPick: (noteId: number) => Promise<void>;
}) {
  const { notes } = useData();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches =
    q === ""
      ? []
      : [...notes.values()]
          .filter(
            (n) => !existing.has(n.id) && (n.title || "").toLowerCase().includes(q),
          )
          .slice(0, 12);

  return (
    <div className="w-[240px]">
      <div className="mlabel pb-1.5">Прикрепить заметку</div>
      <input
        className="ghost-input border border-line rounded-[8px] px-2 py-1 text-[13px] w-full"
        name="note-link-search"
        aria-label="Поиск заметки"
        placeholder="Найти заметку…"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex flex-col gap-0.5 pt-1.5 max-h-[240px] overflow-y-auto">
        {matches.map((n) => (
          <button
            key={n.id}
            type="button"
            className="pop-item"
            onClick={() => void onPick(n.id)}
          >
            <span className="truncate">{n.title.trim() || "Без названия"}</span>
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
