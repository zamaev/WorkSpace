import { useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { Check } from "../components/ui";
import { useData } from "../data/DataProvider";
import { breadcrumb } from "../data/selectors";
import type { Task } from "../data/types";
import { setDragTask } from "../tree/dnd";

// Карточка задачи в колонке дня. dropBefore приходит от DayColumn —
// подсветка «вставить перед этой карточкой».
export function TaskCard({
  task,
  dropBefore,
  onCardDragOver,
  onCardDrop,
}: {
  task: Task;
  dropBefore: boolean;
  onCardDragOver: (e: DragEvent) => void;
  onCardDrop: (e: DragEvent) => void;
}) {
  const { tasks, patch } = useData();
  const [openDetail, setOpenDetail] = useState(false);
  const crumb = breadcrumb(tasks, task.id);

  return (
    <div
      className={`task-card ${task.done ? "task-card-done" : ""} ${dropBefore ? "card-drop-before" : ""}`}
      draggable
      onDragStart={(e) => setDragTask(e, task.id)}
      onDragOver={onCardDragOver}
      onDrop={onCardDrop}
    >
      <div className="flex items-start gap-2">
        <Check
          size="sm"
          done={task.done}
          label={task.done ? "Снять отметку" : "Отметить сделанной"}
          onClick={() => void patch(task.id, { done: !task.done })}
        />
        <button
          type="button"
          className="task-title flex-1 min-w-0 text-left"
          onClick={() => setOpenDetail((v) => !v)}
          title="Детали"
        >
          {task.title}
        </button>
      </div>
      {crumb && <div className="crumb pl-[27px]">{crumb}</div>}
      {openDetail && (
        <div className="pl-[27px] flex flex-col gap-2">
          <textarea
            className="ghost-input border border-line rounded-[10px] px-2.5 py-2 text-[12.5px] min-h-[56px] resize-y"
            placeholder="Описание…"
            defaultValue={task.description}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== task.description) void patch(task.id, { description: v });
            }}
          />
          <Link to={`/?focus=${task.id}`} className="mmeta !text-accent self-start">
            в дереве →
          </Link>
        </div>
      )}
    </div>
  );
}
