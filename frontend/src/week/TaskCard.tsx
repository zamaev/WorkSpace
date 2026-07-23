import { type DragEvent } from "react";
import { AvatarDot, Check, RepeatIcon } from "../components/ui";
import { TypeBadge } from "../components/TypeBadge";
import { useData } from "../data/DataProvider";
import { breadcrumb } from "../data/selectors";
import type { Task } from "../data/types";
import { setDragGhost, setDragTask } from "../tree/dnd";
import { dayDiff, fmtDayChip, todayISO } from "../lib/dates";
import { duePhase, duePhaseColor } from "../lib/due";

type CardVariant = "live" | "span" | "ghost";

// Карточка задачи в колонке дня. Единый компонент для трёх видов —
// отличаются только рамкой и левым элементом, наполнение одинаковое
// (родитель, смайлик типа, исполнитель), чтобы карточки читались одинаково
// плотно:
//   • live  — стартовый день задачи: чекбокс, «1/N», перетаскивается
//             (drag двигает весь диапазон), принимает drop (переупорядочивание).
//   • span  — продолжение многодневной (дни 2…N): чекбокс есть, но drag
//             выключен (двигать задачу только за первый день), «k/N», пунктир.
//   • ghost — будущее вхождение серии: слева иконка повтора (отметить/тащить
//             нельзя), без счётчика, пунктир.
// dropBefore приходит от DayColumn — подсветка «вставить перед этой карточкой».
export function TaskCard({
  task,
  day,
  variant = "live",
  dropBefore = false,
  onCardDragOver,
  onCardDrop,
  onOpen,
}: {
  task: Task;
  day?: string;
  variant?: CardVariant;
  dropBefore?: boolean;
  onCardDragOver?: (e: DragEvent) => void;
  onCardDrop?: (e: DragEvent) => void;
  onOpen: (id: number) => void;
}) {
  const { tasks, projects, types, people, patch } = useData();
  const crumb = breadcrumb(tasks, task.id);
  const color = projects.get(task.projectId)?.color ?? "var(--check)";
  const isGhost = variant === "ghost";
  const isSpan = variant === "span";
  const isLive = variant === "live";
  const echo = isGhost || isSpan; // пунктирная рамка — «не стартовая ячейка»
  const due = isGhost ? null : duePhase(task.softDueOn, task.dueOn, todayISO());

  // счётчик дня диапазона «k/N»: у live k=1, у продолжения — по дню колонки
  let counter: string | null = null;
  if (!isGhost && task.scheduledOn && task.endOn) {
    const ref = isSpan && day ? day : task.scheduledOn;
    counter = `${dayDiff(task.scheduledOn, ref) + 1}/${dayDiff(task.scheduledOn, task.endOn) + 1}`;
  }

  return (
    <div
      className={`task-card cursor-pointer ${echo ? "card-echo" : task.done ? "task-card-done" : ""} ${dropBefore ? "card-drop-before" : ""}`}
      style={{ borderLeft: `3px solid ${color}` }}
      draggable={isLive}
      title={
        isGhost
          ? "Будущее вхождение повторяющейся задачи"
          : isSpan
            ? "Продолжение многодневной задачи — двигать за первый день"
            : undefined
      }
      onClick={() => onOpen(task.id)}
      onDragStart={
        isLive
          ? (e) => {
              setDragTask(e, task.id);
              setDragGhost(e, e.currentTarget as HTMLElement);
            }
          : undefined
      }
      onDragOver={isLive ? onCardDragOver : undefined}
      onDrop={isLive ? onCardDrop : undefined}
    >
      <div className="flex items-start gap-2">
        {isGhost ? (
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
        {counter && (
          <span className="mmeta whitespace-nowrap">{counter}</span>
        )}
      </div>
      {(crumb ||
        due ||
        (task.repeat && !isGhost) ||
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
          {task.repeat && !isGhost && (
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
