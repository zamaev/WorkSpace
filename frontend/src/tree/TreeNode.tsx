import { useEffect, useRef, useState, type DragEvent } from "react";
import { Check, SBar } from "../components/ui";
import { DateMenu } from "../components/DateMenu";
import { useData } from "../data/DataProvider";
import { childrenOf, childStats, subtreeIds } from "../data/selectors";
import type { Task } from "../data/types";
import { fmtDayChip, todayISO } from "../lib/dates";
import { plural } from "../lib/plural";
import { getDragTask, hasDragTask, setDragTask } from "./dnd";

type DropZone = "before" | "into" | "after" | null;

export function TreeNode({
  task,
  depth,
  color,
  isOpen,
  toggleOpen,
  flashId,
}: {
  task: Task;
  depth: number;
  color: string;
  isOpen: (id: number) => boolean;
  toggleOpen: (id: number) => void;
  flashId: number | null;
}) {
  const { tasks, create, patch, remove } = useData();
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dateMenu, setDateMenu] = useState(false);
  const [detail, setDetail] = useState(false);
  const [zone, setZone] = useState<DropZone>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const children = childrenOf(tasks, task.id);
  const stats = childStats(tasks, task.id);
  const open = isOpen(task.id);
  const today = todayISO();
  const chipOverdue = task.scheduledOn !== null && !task.done && task.scheduledOn < today;

  useEffect(() => {
    if (flashId === task.id) {
      rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [flashId, task.id]);

  const computeZone = (e: DragEvent): DropZone => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    if (y < 0.25) return "before";
    if (y > 0.75) return "after";
    return "into";
  };

  const canAccept = (dragId: number | null): boolean => {
    // во время dragover данные недоступны (защита браузера) — тогда
    // разрешаем визуально, а финальную проверку делает drop + сервер
    if (dragId === null) return true;
    if (dragId === task.id) return false;
    return !subtreeIds(tasks, dragId).includes(task.id);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dragId = getDragTask(e);
    const z = computeZone(e);
    setZone(null);
    if (dragId === null || dragId === task.id) return;
    if (subtreeIds(tasks, dragId).includes(task.id)) return;
    if (z === "into") {
      void patch(dragId, { parentId: task.id, position: childrenOf(tasks, task.id).length });
      return;
    }
    // сиблинг до/после: позиция — индекс в списке сиблингов БЕЗ перетаскиваемой
    const sibs = childrenOf(tasks, task.parentId).filter((t) => t.id !== dragId);
    const idx = sibs.findIndex((t) => t.id === task.id);
    const at = z === "before" ? idx : idx + 1;
    void patch(dragId, { parentId: task.parentId, position: at });
  };

  const onDelete = () => {
    const count = subtreeIds(tasks, task.id).length;
    const msg =
      count > 1
        ? `Удалить «${task.title}» вместе с вложенными — всего ${plural(count, ["задача", "задачи", "задач"])}?`
        : `Удалить «${task.title}»?`;
    if (window.confirm(msg)) void remove(task.id);
  };

  const zoneCls =
    zone === "into" ? "drop-into" : zone === "before" ? "drop-before" : zone === "after" ? "drop-after" : "";

  return (
    <div>
      <div
        ref={rowRef}
        className={`tree-row ${zoneCls} ${flashId === task.id ? "bg-asoft" : ""}`}
        style={{ marginLeft: depth * 22 }}
        draggable={!renaming}
        onDragStart={(e) => setDragTask(e, task.id)}
        onDragOver={(e) => {
          if (!hasDragTask(e)) return;
          if (!canAccept(null)) return;
          e.preventDefault();
          e.stopPropagation();
          setZone(computeZone(e));
        }}
        onDragLeave={() => setZone(null)}
        onDrop={onDrop}
      >
        <button
          type="button"
          className={`chevron ${open ? "chevron-open" : ""} ${children.length === 0 ? "chevron-empty" : ""}`}
          onClick={() => toggleOpen(task.id)}
          aria-label={open ? "Свернуть" : "Развернуть"}
          tabIndex={children.length === 0 ? -1 : 0}
        >
          ▶
        </button>
        <SBar color={color} />
        <Check done={task.done} label={task.done ? "Снять отметку" : "Отметить сделанной"} onClick={() => void patch(task.id, { done: !task.done })} />
        {renaming ? (
          <RenameInput
            initial={task.title}
            onDone={(title) => {
              setRenaming(false);
              if (title && title !== task.title) void patch(task.id, { title });
            }}
          />
        ) : (
          <button
            type="button"
            className={`flex-1 min-w-0 text-left text-[13.5px] truncate ${depth === 0 ? "font-semibold" : ""} ${task.done ? "text-dim line-through" : ""}`}
            onClick={() => setRenaming(true)}
            title="Переименовать"
          >
            {task.title}
          </button>
        )}
        {stats.total > 0 && (
          <span className="mmeta whitespace-nowrap" title="Сделано из прямых подзадач">
            {stats.done}/{stats.total}
          </span>
        )}
        <div className="relative">
          {task.scheduledOn ? (
            <button
              type="button"
              className={`chip ${chipOverdue ? "date-chip-over" : "chip-accent"}`}
              onClick={() => setDateMenu((v) => !v)}
              title={chipOverdue ? "Просрочена" : "Изменить дату"}
            >
              {fmtDayChip(task.scheduledOn)}
            </button>
          ) : null}
          {dateMenu && (
            <DateMenu
              current={task.scheduledOn}
              onPick={(iso) => void patch(task.id, { scheduledOn: iso })}
              onClose={() => setDateMenu(false)}
            />
          )}
        </div>
        <div className="row-actions">
          {!task.scheduledOn && (
            <button type="button" className="row-btn" title="Назначить дату" onClick={() => setDateMenu((v) => !v)}>
              ◷
            </button>
          )}
          <button
            type="button"
            className={`row-btn ${task.description ? "!text-accent" : ""}`}
            title="Описание"
            onClick={() => setDetail((v) => !v)}
          >
            ≡
          </button>
          <button
            type="button"
            className="row-btn"
            title="Добавить подзадачу"
            onClick={() => {
              setAdding(true);
              if (!open) toggleOpen(task.id);
            }}
          >
            ＋
          </button>
          <button type="button" className="row-btn row-btn-danger" title="Удалить" onClick={onDelete}>
            ✕
          </button>
        </div>
      </div>

      {detail && (
        <div style={{ marginLeft: depth * 22 + 54 }} className="pb-2 pr-4">
          <textarea
            className="ghost-input border border-line rounded-[10px] px-3 py-2 text-[13px] min-h-[64px] resize-y"
            name="task-description"
            aria-label="Описание задачи"
            placeholder="Описание…"
            defaultValue={task.description}
            autoFocus
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== task.description) void patch(task.id, { description: v });
            }}
          />
        </div>
      )}

      {open &&
        children.map((c) => (
          <TreeNode
            key={c.id}
            task={c}
            depth={depth + 1}
            color={color}
            isOpen={isOpen}
            toggleOpen={toggleOpen}
            flashId={flashId}
          />
        ))}

      {open && adding && (
        <NewTaskInput
          depth={depth + 1}
          onSubmit={async (title) => {
            await create({ title, parentId: task.id });
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (title: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className="ghost-input flex-1 text-[13.5px]"
      name="task-title"
      aria-label="Название задачи"
      value={value}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(value.trim());
        if (e.key === "Escape") onDone(initial);
      }}
    />
  );
}

// Инпут новой задачи: Enter создаёт и оставляет фокус для следующей.
export function NewTaskInput({
  depth,
  placeholder = "Новая задача…",
  onSubmit,
  onClose,
}: {
  depth: number;
  placeholder?: string;
  onSubmit: (title: string) => Promise<void>;
  onClose?: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="tree-row" style={{ marginLeft: depth * 22 }}>
      <span className="chevron chevron-empty">▶</span>
      <span className="check opacity-40" aria-hidden="true" />
      <input
        className="ghost-input flex-1 text-[13.5px]"
        name="new-task"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        autoFocus={onClose !== undefined}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!value.trim()) onClose?.();
        }}
        onKeyDown={async (e) => {
          if (e.key === "Escape") {
            setValue("");
            onClose?.();
          }
          if (e.key === "Enter" && value.trim()) {
            setBusy(true);
            await onSubmit(value.trim());
            setBusy(false);
            setValue("");
          }
        }}
      />
    </div>
  );
}
