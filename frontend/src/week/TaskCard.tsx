import { type DragEvent } from "react";
import { AvatarDot, Check, RepeatIcon } from "../components/ui";
import { TypeBadge } from "../components/TypeBadge";
import { useData } from "../data/DataProvider";
import { breadcrumb } from "../data/selectors";
import type { Task } from "../data/types";
import { setDragGhost, setDragTask } from "../tree/dnd";
import { dayDiff, fmtDayChip, todayISO } from "../lib/dates";
import { duePhase, duePhaseColor } from "../lib/due";

// Карточка задачи в колонке дня. dropBefore приходит от DayColumn —
// подсветка «вставить перед этой карточкой».
//
// ghost=true — будущее вхождение повторяющейся задачи: то же наполнение
// (родитель, смайлик типа, исполнитель), отличие только визуальное —
// пунктирная рамка (.ghost-card). Отметить/перетащить будущее вхождение
// нельзя, поэтому слева вместо чекбокса — иконка повтора, а перетаскивание
// выключено.
export function TaskCard({
  task,
  ghost = false,
  dropBefore = false,
  onCardDragOver,
  onCardDrop,
  onOpen,
}: {
  task: Task;
  ghost?: boolean;
  dropBefore?: boolean;
  onCardDragOver?: (e: DragEvent) => void;
  onCardDrop?: (e: DragEvent) => void;
  onOpen: (id: number) => void;
}) {
  const { tasks, projects, types, people, patch } = useData();
  const crumb = breadcrumb(tasks, task.id);
  const color = projects.get(task.projectId)?.color ?? "var(--check)";
  const due = ghost ? null : duePhase(task.softDueOn, task.dueOn, todayISO());

  return (
    <div
      className={`task-card cursor-pointer ${ghost ? "ghost-card" : task.done ? "task-card-done" : ""} ${dropBefore ? "card-drop-before" : ""}`}
      style={{ borderLeft: `3px solid ${color}` }}
      draggable={!ghost}
      title={ghost ? "Будущее вхождение повторяющейся задачи" : undefined}
      onClick={() => onOpen(task.id)}
      onDragStart={
        ghost
          ? undefined
          : (e) => {
              setDragTask(e, task.id);
              setDragGhost(e, e.currentTarget as HTMLElement);
            }
      }
      onDragOver={ghost ? undefined : onCardDragOver}
      onDrop={ghost ? undefined : onCardDrop}
    >
      <div className="flex items-start gap-2">
        {ghost ? (
          <span
            className="flex-none flex items-center justify-center text-dim"
            style={{ width: 19, height: 19 }}
            aria-hidden="true"
          >
            <RepeatIcon size={12} />
          </span>
        ) : (
          <Check
            size="sm"
            done={task.done}
            label={task.done ? "Снять отметку" : "Отметить сделанной"}
            onClick={(e) => {
              e.stopPropagation();
              void patch(task.id, { done: !task.done });
            }}
          />
        )}
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
        (task.repeat && !ghost) ||
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
          {task.repeat && !ghost && (
            <span
              className="text-dim flex-none flex items-center"
              title="Повторяется"
            >
              <RepeatIcon size={11} />
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
