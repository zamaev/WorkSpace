import { useEffect, useRef } from "react";
import { addDays, fmtDayChip, mondayOf, todayISO, weekDays } from "../lib/dates";

// Поповер выбора даты: Сегодня · Завтра · дни текущей недели · календарь · Снять.
export function DateMenu({
  current,
  onPick,
  onClose,
}: {
  current: string | null;
  onPick: (iso: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
      <div className="mlabel mb-2">Дата</div>
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
      <input
        type="date"
        className="ghost-input border border-line rounded-[8px] px-2 py-1.5 text-[13px] [color-scheme:dark] [data-theme='light']:[color-scheme:light]"
        defaultValue={current ?? ""}
        onChange={(e) => {
          if (e.target.value) pick(e.target.value);
        }}
      />
      {current && (
        <button type="button" className="pop-item mt-2 !text-over" onClick={() => pick(null)}>
          Снять дату
        </button>
      )}
    </div>
  );
}
