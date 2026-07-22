export type Project = {
  id: number;
  parentId: number | null;
  name: string;
  color: string;
  startOn: string | null;
  dueOn: string | null;
  archived: boolean;
  position: number;
};

export type TaskType = {
  id: number;
  name: string;
  emoji: string;
  position: number;
};

export type Role = {
  id: number;
  name: string;
  position: number;
};

export type Person = {
  id: number;
  name: string;
  color: string;
  roleId: number | null;
  position: number;
};

export type Task = {
  id: number;
  parentId: number | null;
  projectId: number;
  title: string;
  description: string;
  done: boolean;
  scheduledOn: string | null;
  endOn: string | null;
  softDueOn: string | null;
  dueOn: string | null;
  typeId: number | null;
  assigneeId: number | null;
  position: number;
  dayPosition: number | null;
};

// Частичное обновление; null значим для scheduledOn (снять дату)
// и parentId (сделать корнем).
export type TaskPatch = Partial<{
  title: string;
  description: string;
  done: boolean;
  scheduledOn: string | null;
  endOn: string | null;
  softDueOn: string | null;
  dueOn: string | null;
  typeId: number | null;
  assigneeId: number | null;
  parentId: number | null;
  projectId: number;
  position: number;
  dayPosition: number | null;
}>;

export type ProjectPatch = Partial<{
  name: string;
  color: string;
  parentId: number | null;
  archived: boolean;
  startOn: string | null;
  dueOn: string | null;
  position: number;
}>;

export type CreateTaskReq = {
  title: string;
  description?: string;
  parentId?: number | null;
  projectId?: number;
  scheduledOn?: string | null;
  endOn?: string | null;
  dueOn?: string | null;
};

// Палитра цветов проектов — маркёры, читаемые в обеих темах.
// Порядок согласован с миграцией 0002 на сервере.
export const PALETTE = [
  "#c9a96a",
  "#8fb56b",
  "#6a9bc9",
  "#c9736a",
  "#9a7bc9",
  "#6ac9b8",
  "#c98fb0",
  "#a8c96a",
  "#6a7ec9",
  "#c9836a",
  "#8a8f98",
  "#5fb0c9",
] as const;

export function nextColor(projectCount: number): string {
  return PALETTE[projectCount % PALETTE.length];
}
