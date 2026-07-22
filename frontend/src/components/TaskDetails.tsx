import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../data/DataProvider";
import { breadcrumb, subtreeIds } from "../data/selectors";
import { fmtDayChip, todayISO } from "../lib/dates";
import { dueChipClass, duePhase } from "../lib/due";
import { DOW_SHORT, fmtRepeatDays } from "../lib/repeat";
import { plural } from "../lib/plural";
import {
  AvatarDot,
  CalendarIcon,
  Check,
  FlagIcon,
  MLabel,
  RepeatIcon,
  SDot,
  TrashIcon,
} from "./ui";
import { ConfirmButton } from "./ConfirmButton";
import { AnchoredPopover } from "./AnchoredPopover";
import { DatePicker, DueDatePicker } from "./DatePicker";
import { TypeBadge } from "./TypeBadge";

type PickerKind = "plan" | "due" | "type" | "assignee" | "repeat" | null;

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
  const repeatRef = useRef<HTMLButtonElement>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setPicker(null);
  }, [taskId, task?.title]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // тихое сохранение через паузу после набора — обновление страницы
  // больше не теряет текст
  const debounced = (fn: () => void) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(fn, 800);
  };

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
  const planEnd = task.endOn ?? task.scheduledOn;
  const planOverdue = planEnd !== null && !task.done && planEnd < today;
  const due = duePhase(task.softDueOn, task.dueOn, today);
  const type = task.typeId !== null ? types.get(task.typeId) : undefined;
  const assignee =
    task.assigneeId !== null ? people.get(task.assigneeId) : undefined;

  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== task.title) void patch(task.id, { title: v });
    else setTitle(task.title);
  };

  const subtreeCount = subtreeIds(tasks, task.id).length;
  const toggle = (kind: PickerKind) =>
    setPicker((v) => (v === kind ? null : kind));

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
          onChange={(e) => {
            const v = e.target.value;
            setTitle(v);
            debounced(() => {
              if (v.trim() && v.trim() !== task.title)
                void patch(task.id, { title: v.trim() });
            });
          }}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveTitle();
            if (e.key === "Escape") setTitle(task.title);
          }}
        />
        {variant === "panel" ? (
          <ConfirmButton
            className="row-btn row-btn-danger"
            armedClassName="!bg-over/15 !text-over"
            confirmLabel="✓"
            title={
              subtreeCount > 1
                ? `Удалить с подзадачами (${subtreeCount}) — второй клик`
                : "Удалить — второй клик"
            }
            onConfirm={() => {
              void remove(task.id);
              onClose();
            }}
          >
            <TrashIcon />
          </ConfirmButton>
        ) : (
          <button
            type="button"
            className="row-btn"
            title="Закрыть"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>

      {showCrumb && project && (
        <div className="flex items-center gap-2 min-w-0">
          <SDot color={project.color} />
          <span className="crumb">
            {crumb ? `${project.name} / ${crumb}` : project.name}
          </span>
        </div>
      )}

      {/* одна линия чипов: план · дедлайн · тип · исполнитель */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={planRef}
          type="button"
          className={`chip flex items-center gap-1.5 ${picker === "plan" ? "chip-accent-border" : task.scheduledOn ? (planOverdue ? "date-chip-over" : "chip-accent") : ""}`}
          onClick={() => toggle("plan")}
          title="План работы"
        >
          <CalendarIcon />
          {task.scheduledOn
            ? `${fmtDayChip(task.scheduledOn)}${task.endOn ? ` → ${fmtDayChip(task.endOn)}` : ""}`
            : "план"}
        </button>
        <button
          ref={dueRef}
          type="button"
          className={`chip flex items-center gap-1.5 ${picker === "due" ? "chip-accent-border" : due && !task.done ? dueChipClass(due.phase) : ""}`}
          onClick={() => toggle("due")}
          title="Дедлайн: мягкий и жёсткий"
        >
          <FlagIcon />
          {task.softDueOn && task.dueOn
            ? `${fmtDayChip(task.softDueOn)} · ${fmtDayChip(task.dueOn)}`
            : due
              ? fmtDayChip(due.date)
              : "дедлайн"}
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
          title="Исполнитель"
        >
          {assignee ? (
            <>
              <AvatarDot
                name={assignee.name}
                color={assignee.color}
                size={15}
              />
              <span className="text-[12px]">{assignee.name}</span>
            </>
          ) : (
            "исполнитель"
          )}
        </button>
        <button
          ref={repeatRef}
          type="button"
          className={`chip ${picker === "repeat" ? "chip-accent-border" : task.repeat ? "chip-accent" : ""}`}
          onClick={() => toggle("repeat")}
          title="Повтор по дням недели"
        >
          {task.repeat ? (
            <>
              <RepeatIcon />
              {fmtRepeatDays(task.repeat)}
            </>
          ) : (
            "повтор"
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
            onChange={(start, end) =>
              void patch(task.id, { scheduledOn: start, endOn: end })
            }
            onClose={() => setPicker(null)}
          />
        </AnchoredPopover>
      )}
      {picker === "due" && (
        <AnchoredPopover anchorRef={dueRef} onClose={() => setPicker(null)}>
          <DueDatePicker
            soft={task.softDueOn}
            hard={task.dueOn}
            onPick={(p) => void patch(task.id, p)}
            onClose={() => setPicker(null)}
          />
        </AnchoredPopover>
      )}
      {picker === "repeat" && (
        <AnchoredPopover anchorRef={repeatRef} onClose={() => setPicker(null)}>
          <div className="w-[230px]">
            <div className="mlabel pb-2">Повтор — дни недели</div>
            {task.scheduledOn === null && (
              <p className="text-[12px] text-dim m-0 pb-2">
                Сначала назначь план-день — от него пойдёт серия.
              </p>
            )}
            <div className="flex gap-1 pb-2">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const on = task.repeat?.days.includes(d) ?? false;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`seg !px-2 !py-1 !text-[11px] ${on ? "seg-on" : ""}`}
                    onClick={() => {
                      const days = on
                        ? (task.repeat?.days ?? []).filter((x) => x !== d)
                        : [...(task.repeat?.days ?? []), d].sort(
                            (a, b) => a - b,
                          );
                      void patch(task.id, {
                        repeat: days.length ? { kind: "weekly", days } : null,
                      });
                    }}
                  >
                    {DOW_SHORT[d]}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <span className="mmeta">отметка ✓ создаст следующую</span>
              {task.repeat && (
                <button
                  type="button"
                  className="mmeta !text-over"
                  onClick={() => {
                    void patch(task.id, { repeat: null });
                    setPicker(null);
                  }}
                >
                  Снять
                </button>
              )}
            </div>
          </div>
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
            {types.size === 0 && (
              <p className="text-[12px] text-dim px-2.5 py-1 m-0">
                Создай типы в разделе «Типы».
              </p>
            )}
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
        <AnchoredPopover
          anchorRef={assigneeRef}
          onClose={() => setPicker(null)}
        >
          <div className="flex flex-col gap-0.5 min-w-[190px]">
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
            {people.size === 0 && (
              <p className="text-[12px] text-dim px-2.5 py-1 m-0">
                Добавь людей в «Команде».
              </p>
            )}
            {task.assigneeId !== null && (
              <button
                type="button"
                className="pop-item !text-over"
                onClick={() => {
                  void patch(task.id, { assigneeId: null });
                  setPicker(null);
                }}
              >
                снять исполнителя
              </button>
            )}
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
            const v = el.value;
            debounced(() => {
              if (v !== task.description)
                void patch(task.id, { description: v });
            });
          }}
          onBlur={(e) => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            const v = e.target.value;
            if (v !== task.description) void patch(task.id, { description: v });
          }}
        />
      </div>

      {variant === "modal" && (
        <div className="flex items-center justify-between pt-1">
          <ConfirmButton
            className="seg flex items-center gap-1.5"
            armedClassName="!text-over !border-over"
            confirmLabel={
              subtreeCount > 1
                ? `удалить ${plural(subtreeCount, ["задачу", "задачи", "задач"])}?`
                : "точно удалить?"
            }
            onConfirm={() => {
              void remove(task.id);
              onClose();
            }}
          >
            <TrashIcon /> Удалить
          </ConfirmButton>
          <Link
            to={`/projects/${task.projectId}?focus=${task.id}`}
            className="mmeta !text-accent"
            onClick={onClose}
          >
            в дереве →
          </Link>
        </div>
      )}
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
        <TaskDetails
          taskId={taskId}
          variant="modal"
          showCrumb={showCrumb}
          onClose={onClose}
        />
      </div>
    </>
  );
}
