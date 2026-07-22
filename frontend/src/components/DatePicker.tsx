import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  addMonths,
  firstOfMonth,
  fmtDayChip,
  fmtMonthTitle,
  monthCells,
  todayISO,
} from "../lib/dates";
import { MLabel } from "./ui";

// Месячная сетка с навигацией — общая часть всех календарей.
function CalGrid({
  initial,
  isSel,
  isRange,
  onPick,
}: {
  initial: string | null;
  isSel: (iso: string) => boolean;
  isRange?: (iso: string) => boolean;
  onPick: (iso: string) => void;
}) {
  const today = todayISO();
  const [month, setMonth] = useState(() => firstOfMonth(initial ?? today));
  return (
    <>
      <div className="flex items-center justify-between pb-1.5">
        <span className="mmeta">{fmtMonthTitle(month).toUpperCase()}</span>
        <div className="flex gap-1">
          <button
            type="button"
            className="row-btn"
            aria-label="Предыдущий месяц"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            ◂
          </button>
          <button
            type="button"
            className="row-btn"
            aria-label="Следующий месяц"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            ▸
          </button>
        </div>
      </div>

      <div className="cal-grid pb-1">
        {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((d) => (
          <span key={d} className="cal-dow">
            {d}
          </span>
        ))}
        {monthCells(month).map(({ iso, inMonth }) => (
          <button
            key={iso}
            type="button"
            className={`cal-day ${inMonth ? "" : "cal-out"} ${iso === today ? "cal-today" : ""} ${isSel(iso) ? "cal-sel" : ""} ${isRange?.(iso) ? "cal-range" : ""}`}
            onClick={() => onPick(iso)}
          >
            {Number(iso.slice(8))}
          </button>
        ))}
      </div>
    </>
  );
}

// Свой календарь в языке space: сетка месяца, у плана — режим «Диапазон».
// Инлайн в инспекторе/модале, поповером — в строках дерева.
export function DatePicker({
  value,
  endValue,
  title = "Дата",
  allowRange = false,
  onChange,
  onClose,
}: {
  value: string | null;
  endValue?: string | null;
  title?: string;
  allowRange?: boolean;
  // единый колбэк: изменения начала и конца всегда приходят вместе,
  // чтобы вызывающий отправил ОДИН запрос (иначе между двумя PATCH
  // нарушается серверный инвариант end >= start)
  onChange: (start: string | null, end: string | null) => void;
  onClose: () => void;
}) {
  const [rangeMode, setRangeMode] = useState(() => endValue != null);
  const [pendingStart, setPendingStart] = useState<string | null>(null);

  const pickDay = (iso: string) => {
    if (allowRange && rangeMode) {
      // диапазон: первый клик — начало (только превью), второй — конец;
      // клик раньше начала переносит начало
      if (pendingStart === null || iso < pendingStart) {
        setPendingStart(iso);
        return;
      }
      onChange(pendingStart, iso);
      setPendingStart(null);
      onClose();
      return;
    }
    onChange(iso, null);
    onClose();
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-2">
        <MLabel>{title}</MLabel>
        {allowRange && (
          <div className="flex gap-1">
            <button
              type="button"
              className={`seg !px-2 !py-1 !text-[11px] ${rangeMode ? "" : "seg-on"}`}
              onClick={() => {
                setRangeMode(false);
                setPendingStart(null);
              }}
            >
              День
            </button>
            <button
              type="button"
              className={`seg !px-2 !py-1 !text-[11px] ${rangeMode ? "seg-on" : ""}`}
              onClick={() => setRangeMode(true)}
              title="Первый клик — начало, второй — конец"
            >
              Диапазон
            </button>
          </div>
        )}
      </div>

      <CalGrid
        initial={value}
        isSel={(iso) =>
          iso === value || iso === endValue || iso === pendingStart
        }
        isRange={(iso) =>
          value !== null && endValue != null && iso > value && iso < endValue
        }
        onPick={pickDay}
      />

      <div className="flex items-center justify-between pt-1">
        <span className="mmeta">
          {allowRange && rangeMode && pendingStart !== null
            ? `${fmtDayChip(pendingStart)} → выбери конец`
            : ""}
        </span>
        {value && (
          <button
            type="button"
            className="mmeta !text-over"
            onClick={() => {
              onChange(null, null);
              onClose();
            }}
          >
            Снять
          </button>
        )}
      </div>
    </div>
  );
}

// Календарь двойного дедлайна: вкладки «мягкий | жёсткий», в сетке
// подсвечены обе даты. Каждый выбор — отдельный PATCH одного поля
// (инварианты план ≤ мягкий ≤ жёсткий проверяет сервер).
export function DueDatePicker({
  soft,
  hard,
  onPick,
  onClose,
}: {
  soft: string | null;
  hard: string | null;
  onPick: (p: { softDueOn?: string | null; dueOn?: string | null }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"soft" | "hard">(() =>
    soft !== null && hard === null ? "soft" : "hard",
  );
  const cur = tab === "soft" ? soft : hard;

  const pick = (iso: string | null) => {
    onPick(tab === "soft" ? { softDueOn: iso } : { dueOn: iso });
    onClose();
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-2">
        <MLabel>Дедлайн</MLabel>
        <div className="flex gap-1">
          <button
            type="button"
            className={`seg !px-2 !py-1 !text-[11px] ${tab === "soft" ? "seg-on" : ""}`}
            onClick={() => setTab("soft")}
            title="Цель-ориентир: после него чип желтеет"
          >
            мягкий
          </button>
          <button
            type="button"
            className={`seg !px-2 !py-1 !text-[11px] ${tab === "hard" ? "seg-on" : ""}`}
            onClick={() => setTab("hard")}
            title="Крайний срок: после него чип краснеет"
          >
            жёсткий
          </button>
        </div>
      </div>

      {/* key: при смене вкладки сетка перескакивает к месяцу её даты */}
      <CalGrid
        key={tab}
        initial={cur}
        isSel={(iso) => iso === soft || iso === hard}
        onPick={pick}
      />

      <div className="flex items-center justify-between pt-1">
        <span className="mmeta">
          {soft && `мягк ${fmtDayChip(soft)}`}
          {soft && hard && " · "}
          {hard && `жёстк ${fmtDayChip(hard)}`}
        </span>
        {cur && (
          <button
            type="button"
            className="mmeta !text-over"
            onClick={() => pick(null)}
          >
            Снять
          </button>
        )}
      </div>
    </div>
  );
}

// Поповер-обёртка для строк дерева: закрытие по клику мимо и Escape.
function PickerPopover({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="popover popover-left"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function DatePickerPopover(props: Parameters<typeof DatePicker>[0]) {
  return (
    <PickerPopover onClose={props.onClose}>
      <DatePicker {...props} />
    </PickerPopover>
  );
}

export function DueDatePickerPopover(
  props: Parameters<typeof DueDatePicker>[0],
) {
  return (
    <PickerPopover onClose={props.onClose}>
      <DueDatePicker {...props} />
    </PickerPopover>
  );
}
