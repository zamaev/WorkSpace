import { type DragEvent } from "react";
import { AvatarDot, Check } from "../components/ui";
import { TypeBadge } from "../components/TypeBadge";
import { useData } from "../data/DataProvider";
import { breadcrumb } from "../data/selectors";
import type { Task } from "../data/types";
import { setDragGhost, setDragTask } from "../tree/dnd";
import { dayDiff, fmtDayChip, todayISO } from "../lib/dates";
import { duePhase, duePhaseColor } from "../lib/due";

// Карточка задачи в колонке дня. dropBefore приходит от DayColumn —
// подсветка «вставить перед этой карточкой».
export function TaskCard({
  task,
  dropBefore,
  onCardDragOver,
  onCardDrop,
  onOpen,
}: {
  task: Task;
  dropBefore: boolean;
  onCardDragOver: (e: DragEvent) => void;
  onCardDrop: (e: DragEvent) => void;
  onOpen: (id: number) => void;
}) {
  const { tasks, projects, types, people, patch } = useData();
  const crumb = breadcrumb(tasks, task.id);
  const color = projects.get(task.projectId)?.color ?? "var(--check)";
  const due = duePhase(task.softDueOn, task.dueOn, todayISO());

  return (
    <div
      className={`task-card cursor-pointer ${task.done ? "task-card-done" : ""} ${dropBefore ? "card-drop-before" : ""}`}
      style={{ borderLeft: `3px solid ${color}` }}
      draggable
      onClick={() => onOpen(task.id)}
      onDragStart={(e) => {
        setDragTask(e, task.id);
        setDragGhost(e, e.currentTarget as HTMLElement);
      }}
      onDragOver={onCardDragOver}
      onDrop={onCardDrop}
    >
      <div className="flex items-start gap-2">
        <Check
          size="sm"
          done={task.done}
          label={task.done ? "Снять отметку" : "Отметить сделанной"}
          onClick={(e) => {
            e.stopPropagation();
            void patch(task.id, { done: !task.done });
          }}
        />
        <span className="task-title flex-1 min-w-0 text-left" title="Детали">
          {task.title}
        </span>
        {task.endOn && task.scheduledOn && (
          <span className="mmeta whitespace-nowrap">
            1/{dayDiff(task.scheduledOn, task.endOn) + 1}
          </span>
        )}
      </div>
      {(crumb ||
        due ||
        task.repeat ||
        task.typeId !== null ||
        task.assigneeId !== null) && (
        <div className="flex items-center gap-2 pl-[27px] min-w-0">
          {task.assigneeId !== null && people.get(task.assigneeId) && (
            <AvatarDot
              name={people.get(task.assigneeId)!.name}
              color={people.get(task.assigneeId)!.color}
              size={15}
            />
          )}
          {task.typeId !== null && types.get(task.typeId) && (
            <TypeBadge type={types.get(task.typeId)!} size={13} />
          )}
          {task.repeat && (
            <span className="mmeta flex-none" title="Повторяется">
              ↻
            </span>
          )}
          {due && (
            <span
              className="mmeta whitespace-nowrap"
              style={
                task.done ? undefined : { color: duePhaseColor(due.phase) }
              }
            >
              до {fmtDayChip(due.date)}
            </span>
          )}
          {crumb && <span className="crumb flex-1">{crumb}</span>}
        </div>
      )}
    </div>
  );
}
