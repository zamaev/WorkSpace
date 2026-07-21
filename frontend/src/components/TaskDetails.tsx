import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../data/DataProvider";
import { breadcrumb, subtreeIds } from "../data/selectors";
import { fmtDayChip, todayISO } from "../lib/dates";
import { plural } from "../lib/plural";
import { AvatarDot, Check, MLabel, SDot, TrashIcon } from "./ui";
import { ConfirmButton } from "./ConfirmButton";
import { AnchoredPopover } from "./AnchoredPopover";
import { DatePicker } from "./DatePicker";
import { TypeBadge } from "./TypeBadge";

type PickerKind = "plan" | "due" | "type" | "assignee" | null;

// Детали задачи: панель-инспектор в «Проектах» и модал в «Неделе»/«Ганте».
// Все меню — маленькие fixed-попапы у якорной кнопки: ничего не смещают
// и не обрезаются в модале.
export function TaskDetails({
  taskId,
  variant,
  showCrumb = false,
  onClose,
}: {
  taskId: number;
  variant: "panel" | "modal";
  showCrumb?: boolean;
  onClose: () => void;
}) {
  const { tasks, projects, types, people, patch, remove } = useData();
  const task = tasks.get(taskId);
  const [title, setTitle] = useState(task?.title ?? "");
  const [picker, setPicker] = useState<PickerKind>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const planRef = useRef<HTMLButtonElement>(null);
  const dueRef = useRef<HTMLButtonElement>(null);
  const typeRef = useRef<HTMLButtonElement>(null);
  const assigneeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setPicker(null);
  }, [taskId, task?.title]);

  // автовысота описания: поле растёт под содержимое, без скролла
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [taskId, task?.description]);

  if (!task) return null;
  const project = projects.get(task.projectId);
  const crumb = breadcrumb(tasks, task.id);
  const today = todayISO();
  const planOverdue = task.scheduledOn !== null && !task.done && task.scheduledOn < today;
  const dueOverdue = task.dueOn !== null && !task.done && task.dueOn < today;
  const type = task.typeId !== null ? types.get(task.typeId) : undefined;
  const assignee = task.assigneeId !== null ? people.get(task.assigneeId) : undefined;

  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== task.title) void patch(task.id, { title: v });
    else setTitle(task.title);
  };

  const subtreeCount = subtreeIds(tasks, task.id).length;
  const toggle = (kind: PickerKind) => setPicker((v) => (v === kind ? null : kind));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Check
          done={task.done}
          label={task.done ? "Снять отметку" : "Отметить сделанной"}
          onClick={() => void patch(task.id, { done: !task.done })}
        />
        <input
          className={`ghost-input flex-1 text-[15px] font-semibold ${task.done ? "text-dim line-through" : ""}`}
          name="task-title"
          aria-label="Название задачи"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveTitle();
            if (e.key === "Escape") setTitle(task.title);
          }}
        />
        <button type="button" className="row-btn" title="Закрыть" onClick={onClose}>
          ✕
        </button>
      </div>

      {showCrumb && project && (
        <div className="flex items-center gap-2 min-w-0">
          <SDot color={project.color} />
          <span className="crumb">{crumb ? `${project.name} / ${crumb}` : project.name}</span>
        </div>
      )}

      {/* одна линия чипов: план · дедлайн · тип · исполнитель */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={planRef}
          type="button"
          className={`chip ${picker === "plan" ? "chip-accent-border" : task.scheduledOn ? (planOverdue ? "date-chip-over" : "chip-accent") : ""}`}
          onClick={() => toggle("plan")}
          title="План работы"
        >
          {task.scheduledOn
            ? `${fmtDayChip(task.scheduledOn)}${task.endOn ? ` → ${fmtDayChip(task.endOn)}` : ""}`
            : "＋ план"}
        </button>
        <button
          ref={dueRef}
          type="button"
          className={`chip ${picker === "due" ? "chip-accent-border" : task.dueOn ? (dueOverdue ? "date-chip-over" : "") : ""}`}
          onClick={() => toggle("due")}
          title="Дедлайн"
        >
          {task.dueOn ? `⚑ ${fmtDayChip(task.dueOn)}` : "⚑"}
        </button>
        <button
          ref={typeRef}
          type="button"
          className={`chip ${picker === "type" ? "chip-accent-border" : ""} flex items-center gap-1.5`}
          onClick={() => toggle("type")}
          title="Тип задачи"
        >
          {type ? (
            <>
              <TypeBadge type={type} />
              <span className="text-[12px]">{type.name}</span>
            </>
          ) : (
            "тип"
          )}
        </button>
        <button
          ref={assigneeRef}
          type="button"
          className={`chip ${picker === "assignee" ? "chip-accent-border" : ""} flex items-center gap-1.5`}
          onClick={() => toggle("assignee")}
          title="Исполнитель (пусто — делаю я)"
        >
          {assignee ? (
            <>
              <AvatarDot name={assignee.name} color={assignee.color} size={15} />
              <span className="text-[12px]">{assignee.name}</span>
            </>
          ) : (
            "я"
          )}
        </button>
      </div>

      {picker === "plan" && (
        <AnchoredPopover anchorRef={planRef} onClose={() => setPicker(null)}>
          <DatePicker
            value={task.scheduledOn}
            endValue={task.endOn}
            title="План"
            allowRange
            onPick={(iso) => void patch(task.id, { scheduledOn: iso })}
            onPickEnd={(iso) => void patch(task.id, { endOn: iso })}
            onClose={() => setPicker(null)}
          />
        </AnchoredPopover>
      )}
      {picker === "due" && (
        <AnchoredPopover anchorRef={dueRef} onClose={() => setPicker(null)}>
          <DatePicker
            value={task.dueOn}
            title="Дедлайн"
            onPick={(iso) => void patch(task.id, { dueOn: iso })}
            onClose={() => setPicker(null)}
          />
        </AnchoredPopover>
      )}
      {picker === "type" && (
        <AnchoredPopover anchorRef={typeRef} onClose={() => setPicker(null)}>
          <div className="flex flex-col gap-0.5 min-w-[180px]">
            {[...types.values()]
              .sort((a, b) => a.position - b.position || a.id - b.id)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="pop-item"
                  onClick={() => {
                    void patch(task.id, { typeId: t.id });
                    setPicker(null);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <TypeBadge type={t} />
                    {t.name}
                  </span>
                  {task.typeId === t.id && <span className="mmeta">✓</span>}
                </button>
              ))}
            {types.size === 0 && <p className="text-[12px] text-dim px-2.5 py-1 m-0">Создай типы в разделе «Типы».</p>}
            {task.typeId !== null && (
              <button
                type="button"
                className="pop-item !text-over"
                onClick={() => {
                  void patch(task.id, { typeId: null });
                  setPicker(null);
                }}
              >
                убрать тип
              </button>
            )}
          </div>
        </AnchoredPopover>
      )}
      {picker === "assignee" && (
        <AnchoredPopover anchorRef={assigneeRef} onClose={() => setPicker(null)}>
          <div className="flex flex-col gap-0.5 min-w-[190px]">
            <button
              type="button"
              className="pop-item"
              onClick={() => {
                void patch(task.id, { assigneeId: null });
                setPicker(null);
              }}
            >
              <span>я (без исполнителя)</span>
              {task.assigneeId === null && <span className="mmeta">✓</span>}
            </button>
            {[...people.values()]
              .sort((a, b) => a.position - b.position || a.id - b.id)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="pop-item"
                  onClick={() => {
                    void patch(task.id, { assigneeId: p.id });
                    setPicker(null);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <AvatarDot name={p.name} color={p.color} size={16} />
                    {p.name}
                  </span>
                  {task.assigneeId === p.id && <span className="mmeta">✓</span>}
                </button>
              ))}
            {people.size === 0 && <p className="text-[12px] text-dim px-2.5 py-1 m-0">Добавь людей в «Команде».</p>}
          </div>
        </AnchoredPopover>
      )}

      <div>
        <MLabel className="pb-1">Описание</MLabel>
        <textarea
          key={task.id}
          ref={descRef}
          className="desc-input"
          rows={2}
          name="task-description"
          aria-label="Описание задачи"
          placeholder="Описание…"
          defaultValue={task.description}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== task.description) void patch(task.id, { description: v });
          }}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <ConfirmButton
          className="seg flex items-center gap-1.5"
          armedClassName="!text-over !border-over"
          confirmLabel={subtreeCount > 1 ? `удалить ${plural(subtreeCount, ["задачу", "задачи", "задач"])}?` : "точно удалить?"}
          onConfirm={() => {
            void remove(task.id);
            onClose();
          }}
        >
          <TrashIcon /> Удалить
        </ConfirmButton>
        {variant === "modal" && (
          <Link to={`/projects/${task.projectId}?focus=${task.id}`} className="mmeta !text-accent" onClick={onClose}>
            в дереве →
          </Link>
        )}
      </div>
    </div>
  );
}

// Модальная обёртка (идиома sheet из space, десктоп-вариант).
export function TaskModal({
  taskId,
  showCrumb = false,
  onClose,
}: {
  taskId: number;
  showCrumb?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <TaskDetails taskId={taskId} variant="modal" showCrumb={showCrumb} onClose={onClose} />
      </div>
    </>
  );
}
