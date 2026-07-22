import { useEffect, useRef, useState } from "react";
import { addMonths, firstOfMonth, fmtDayChip, fmtMonthTitle, monthCells, todayISO } from "../lib/dates";
import { MLabel } from "./ui";

// Свой календарь в языке space: чипы «Сегодня · Завтра · Пн», сетка месяца,
// у плана — режим «по…» (диапазон работы). Инлайн в инспекторе/модале,
// поповером — в строках дерева (см. DatePickerPopover).
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
  const today = todayISO();
  const [month, setMonth] = useState(() => firstOfMonth(value ?? today));
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

      <div className="flex items-center justify-between pb-1.5">
        <span className="mmeta">{fmtMonthTitle(month).toUpperCase()}</span>
        <div className="flex gap-1">
          <button type="button" className="row-btn" aria-label="Предыдущий месяц" onClick={() => setMonth(addMonths(month, -1))}>
            ◂
          </button>
          <button type="button" className="row-btn" aria-label="Следующий месяц" onClick={() => setMonth(addMonths(month, 1))}>
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
        {monthCells(month).map(({ iso, inMonth }) => {
          const isSel = iso === value || iso === endValue || iso === pendingStart;
          const inRange = value !== null && endValue != null && iso > value && iso < endValue;
          return (
            <button
              key={iso}
              type="button"
              className={`cal-day ${inMonth ? "" : "cal-out"} ${iso === today ? "cal-today" : ""} ${isSel ? "cal-sel" : ""} ${inRange ? "cal-range" : ""}`}
              onClick={() => pickDay(iso)}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="mmeta">
          {allowRange && rangeMode && pendingStart !== null ? `${fmtDayChip(pendingStart)} → выбери конец` : ""}
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

// Поповер-обёртка для строк дерева: закрытие по клику мимо и Escape.
export function DatePickerPopover(props: Parameters<typeof DatePicker>[0]) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose } = props;
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
    <div ref={ref} className="popover popover-left" onClick={(e) => e.stopPropagation()}>
      <DatePicker {...props} />
    </div>
  );
}
