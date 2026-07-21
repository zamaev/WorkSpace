import { useEffect, useRef } from "react";
import { addDays, fmtDayChip, mondayOf, todayISO, weekDays } from "../lib/dates";

// Поповер выбора даты: Сегодня · Завтра · дни текущей недели · календарь · Снять.
// Используется и для плана (title «Дата»), и для дедлайна (title «Дедлайн»).
export function DateMenu({
  current,
  title = "Дата",
  endCurrent,
  onPickEnd,
  onPick,
  onClose,
}: {
  current: string | null;
  title?: string;
  endCurrent?: string | null;
  onPickEnd?: (iso: string | null) => void;
  onPick: (iso: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const today = todayISO();

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

  const pick = (iso: string | null) => {
    onPick(iso);
    onClose();
  };

  return (
    <div ref={ref} className="popover" onClick={(e) => e.stopPropagation()}>
      <div className="mlabel mb-2">{title}</div>
      <button type="button" className="pop-item" onClick={() => pick(today)}>
        <span>Сегодня</span>
        <span className="mmeta">{fmtDayChip(today)}</span>
      </button>
      <button type="button" className="pop-item" onClick={() => pick(addDays(today, 1))}>
        <span>Завтра</span>
        <span className="mmeta">{fmtDayChip(addDays(today, 1))}</span>
      </button>
      <div className="mlabel mt-2 mb-1">Эта неделя</div>
      <div className="flex flex-wrap gap-1.5 px-1 pb-1">
        {weekDays(mondayOf(today)).map((d) => (
          <button
            key={d}
            type="button"
            className={`chip ${d === current ? "chip-accent" : ""} ${d === today ? "!border-accent" : ""}`}
            onClick={() => pick(d)}
          >
            {fmtDayChip(d)}
          </button>
        ))}
      </div>
      <div className="mlabel mt-2 mb-1">Другая дата</div>
      <div className="flex gap-2 items-center">
        {/* дата применяется кнопкой, не onChange: date-инпут «валиден» уже
            в процессе набора года, авто-применение ловит недописанную дату */}
        <input
          ref={dateRef}
          type="date"
          name="custom-date"
          aria-label="Произвольная дата"
          className="ghost-input border border-line rounded-[8px] px-2 py-1.5 text-[13px]"
          defaultValue={current ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dateRef.current?.value) pick(dateRef.current.value);
          }}
        />
        <button
          type="button"
          className="seg"
          onClick={() => {
            if (dateRef.current?.value) pick(dateRef.current.value);
          }}
        >
          Ок
        </button>
      </div>
      {onPickEnd && current && (
        <>
          <div className="mlabel mt-2 mb-1">Работаю по…</div>
          <div className="flex gap-2 items-center">
            <input
              ref={endRef}
              type="date"
              name="end-date"
              aria-label="Конец работы"
              className="ghost-input border border-line rounded-[8px] px-2 py-1.5 text-[13px]"
              defaultValue={endCurrent ?? ""}
              min={current}
              onKeyDown={(e) => {
                if (e.key === "Enter" && endRef.current?.value) {
                  onPickEnd(endRef.current.value);
                  onClose();
                }
              }}
            />
            <button
              type="button"
              className="seg"
              onClick={() => {
                if (endRef.current?.value) {
                  onPickEnd(endRef.current.value);
                  onClose();
                }
              }}
            >
              Ок
            </button>
            {endCurrent && (
              <button
                type="button"
                className="seg"
                onClick={() => {
                  onPickEnd(null);
                  onClose();
                }}
              >
                снять
              </button>
            )}
          </div>
        </>
      )}
      {current && (
        <button type="button" className="pop-item mt-2 !text-over" onClick={() => pick(null)}>
          Снять
        </button>
      )}
    </div>
  );
}
