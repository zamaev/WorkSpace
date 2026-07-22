// Фазы двойного дедлайна: мягкий (цель-ориентир) и жёсткий (крайний срок).
// Компактные чипы показывают «ближайший рубеж» — дату, которая грозит
// следующей, с цветом фазы.

export type DuePhase = "soft" | "warn" | "over";

export type DueMark = { phase: DuePhase; date: string };

// soft — до ближайшего рубежа ещё не дошли; warn — мягкий позади (или
// его нет и жёсткого ещё нет — не бывает); over — жёсткий позади.
// Только жёсткий: soft до него, over после (warn-фазы нет).
// Только мягкий: soft до, warn после (over не наступает).
export function duePhase(
  soft: string | null,
  hard: string | null,
  today: string,
): DueMark | null {
  if (soft === null && hard === null) return null;
  if (soft !== null && today < soft) return { phase: "soft", date: soft };
  if (hard !== null && today < hard)
    return { phase: soft !== null ? "warn" : "soft", date: hard };
  if (hard !== null) return { phase: "over", date: hard };
  return { phase: "warn", date: soft! };
}

export function dueChipClass(phase: DuePhase): string {
  return phase === "over"
    ? "chip-due-hard"
    : phase === "warn"
      ? "chip-due-warn"
      : "chip-due-soft";
}

export function duePhaseColor(phase: DuePhase): string {
  return phase === "over"
    ? "var(--over)"
    : phase === "warn"
      ? "var(--due-warn)"
      : "var(--due-soft)";
}
