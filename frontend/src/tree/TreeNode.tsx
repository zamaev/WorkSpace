import { useEffect, useRef, useState, type DragEvent } from "react";
import { AvatarDot, Check, SBar } from "../components/ui";
import { TypeBadge } from "../components/TypeBadge";
import {
  DatePickerPopover,
  DueDatePickerPopover,
} from "../components/DatePicker";
import { useData } from "../data/DataProvider";
import { childrenOf, subtreeIds } from "../data/selectors";
import type { Task } from "../data/types";
import { fmtDayChip, todayISO } from "../lib/dates";
import { dueChipClass, duePhase } from "../lib/due";
import { getDragTask, hasDragTask, setDragGhost, setDragTask } from "./dnd";

type DropZone = "before" | "into" | "after" | null;

export function TreeNode({
  task,
  depth,
  color,
  isOpen,
  toggleOpen,
  flashId,
  selectedId,
  onSelect,
  hideDone = false,
}: {
  task: Task;
  depth: number;
  color: string;
  isOpen: (id: number) => boolean;
  toggleOpen: (id: number) => void;
  flashId: number | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  hideDone?: boolean;
}) {
  const { tasks, types, people, create, patch } = useData();
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dateMenu, setDateMenu] = useState(false);
  const [dueMenu, setDueMenu] = useState(false);
  const [zone, setZone] = useState<DropZone>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const children = childrenOf(tasks, task.id).filter(
    (c) => !hideDone || !c.done,
  );
  const open = isOpen(task.id);
  const today = todayISO();
  // диапазон просрочен по концу работы, не по началу
  const planEnd = task.endOn ?? task.scheduledOn;
  const chipOverdue = planEnd !== null && !task.done && planEnd < today;
  const due = duePhase(task.softDueOn, task.dueOn, today);

  useEffect(() => {
    if (flashId === task.id) {
      rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [flashId, task.id]);

  useEffect(() => {
    if (selectedId === task.id) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId, task.id]);

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
      void patch(dragId, {
        parentId: task.id,
        position: childrenOf(tasks, task.id).length,
      });
      return;
    }
    // сиблинг до/после: позиция — индекс в списке сиблингов БЕЗ перетаскиваемой
    const sibs = childrenOf(tasks, task.parentId).filter(
      (t) => t.id !== dragId,
    );
    const idx = sibs.findIndex((t) => t.id === task.id);
    const at = z === "before" ? idx : idx + 1;
    void patch(dragId, { parentId: task.parentId, position: at });
  };

  const zoneCls =
    zone === "into"
      ? "drop-into"
      : zone === "before"
        ? "drop-before"
        : zone === "after"
          ? "drop-after"
          : "";
  const selCls = selectedId === task.id ? "tree-row-sel" : "";

  return (
    <div>
      <div
        ref={rowRef}
        className={`tree-row ${zoneCls} ${selCls} ${flashId === task.id ? "bg-asoft" : ""}`}
        style={{ marginLeft: depth * 22 }}
        draggable={!renaming}
        onClick={() => onSelect(task.id)}
        onDragStart={(e) => {
          setDragTask(e, task.id);
          setDragGhost(e, e.currentTarget as HTMLElement);
        }}
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
          onClick={(e) => {
            e.stopPropagation();
            toggleOpen(task.id);
          }}
          aria-label={open ? "Свернуть" : "Развернуть"}
          tabIndex={children.length === 0 ? -1 : 0}
        >
          ▶
        </button>
        <SBar color={color} />
        <Check
          done={task.done}
          label={task.done ? "Снять отметку" : "Отметить сделанной"}
          onClick={(e) => {
            e.stopPropagation();
            void patch(task.id, { done: !task.done });
          }}
        />
        {renaming ? (
          <RenameInput
            initial={task.title}
            onDone={(title) => {
              setRenaming(false);
              if (title && title !== task.title) void patch(task.id, { title });
            }}
          />
        ) : (
          <span
            className={`flex-1 min-w-0 text-left text-[13.5px] truncate ${depth === 0 ? "font-semibold" : ""} ${task.done ? "text-dim line-through" : ""}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
            title="Двойной клик — переименовать"
          >
            {task.title}
          </span>
        )}
        {task.repeat && (
          <span className="mmeta flex-none" title="Повторяется">
            ↻
          </span>
        )}
        {task.typeId !== null && types.get(task.typeId) && (
          <TypeBadge type={types.get(task.typeId)!} />
        )}
        {task.assigneeId !== null && people.get(task.assigneeId) && (
          <AvatarDot
            name={people.get(task.assigneeId)!.name}
            color={people.get(task.assigneeId)!.color}
            size={17}
          />
        )}
        <div className="relative">
          {task.scheduledOn ? (
            <button
              type="button"
              className={`chip ${chipOverdue ? "date-chip-over" : "chip-accent"}`}
              onClick={(e) => {
                e.stopPropagation();
                setDateMenu((v) => !v);
              }}
              title={chipOverdue ? "Просрочена" : "Изменить дату"}
            >
              {fmtDayChip(task.scheduledOn)}
              {task.endOn ? ` → ${fmtDayChip(task.endOn)}` : ""}
            </button>
          ) : null}
          {dateMenu && (
            <DatePickerPopover
              value={task.scheduledOn}
              endValue={task.endOn}
              title="План"
              allowRange
              onChange={(start, end) =>
                void patch(task.id, { scheduledOn: start, endOn: end })
              }
              onClose={() => setDateMenu(false)}
            />
          )}
        </div>
        <div className="relative">
          {due ? (
            <button
              type="button"
              className={`chip ${task.done ? "" : dueChipClass(due.phase)}`}
              onClick={(e) => {
                e.stopPropagation();
                setDueMenu((v) => !v);
              }}
              title={
                due.phase === "over"
                  ? "Дедлайн сорван"
                  : due.phase === "warn"
                    ? "Мягкий рубеж позади — жёсткий впереди"
                    : "Ближайший рубеж дедлайна"
              }
            >
              {fmtDayChip(due.date)}
            </button>
          ) : null}
          {dueMenu && (
            <DueDatePickerPopover
              soft={task.softDueOn}
              hard={task.dueOn}
              onPick={(p) => void patch(task.id, p)}
              onClose={() => setDueMenu(false)}
            />
          )}
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="row-btn"
            title="Добавить подзадачу"
            onClick={(e) => {
              e.stopPropagation();
              setAdding(true);
              if (!open) toggleOpen(task.id);
            }}
          >
            ＋
          </button>
        </div>
      </div>

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
            selectedId={selectedId}
            onSelect={onSelect}
            hideDone={hideDone}
          />
        ))}

      {open && adding && (
        <NewTaskInput
          depth={depth + 1}
          color={color}
          onSubmit={async (title) => {
            await create({ title, parentId: task.id });
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (title: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className="ghost-input flex-1 text-[13.5px]"
      name="task-title"
      aria-label="Название задачи"
      value={value}
      autoFocus
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(value.trim());
        if (e.key === "Escape") onDone(initial);
      }}
    />
  );
}

// Инпут новой задачи: та же геометрия, что у настоящей строки (полоска
// цвета на месте) — после Enter ничего не смещается.
export function NewTaskInput({
  depth,
  color,
  placeholder = "Новая задача…",
  onSubmit,
  onClose,
}: {
  depth: number;
  color: string;
  placeholder?: string;
  onSubmit: (title: string) => Promise<void>;
  onClose?: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="tree-row" style={{ marginLeft: depth * 22 }}>
      <span className="chevron chevron-empty">▶</span>
      <SBar color={color} />
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
            // создал одну — временное поле закрывается (не серийный ввод)
            onClose?.();
          }
        }}
      />
    </div>
  );
}
