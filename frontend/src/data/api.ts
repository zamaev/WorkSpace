import type {
  CreateTaskReq,
  LinkType,
  TaskLink,
  Person,
  Project,
  ProjectPatch,
  Role,
  Task,
  TaskPatch,
  TaskType,
} from "./types";

// Ошибка API с человекочитаемым текстом сервера — показывается в toast как есть.
export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      ...init,
    });
  } catch {
    throw new ApiError("Нет связи с сервером");
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError("Сервер ответил не-JSON");
  }
  if (!res.ok) {
    const msg = (body as { error?: string }).error ?? `Ошибка ${res.status}`;
    throw new ApiError(msg);
  }
  return body as T;
}

export function fetchTasks(): Promise<{ tasks: Task[] }> {
  return request("/api/tasks");
}

export function createTask(
  req: CreateTaskReq,
): Promise<{ task: Task; tasks: Task[] }> {
  return request("/api/tasks", { method: "POST", body: JSON.stringify(req) });
}

export function patchTask(
  id: number,
  patch: TaskPatch,
): Promise<{ tasks: Task[] }> {
  return request(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteTask(id: number): Promise<{ deleted: number }> {
  return request(`/api/tasks/${id}`, { method: "DELETE" });
}

export function fetchProjects(): Promise<{ projects: Project[] }> {
  return request("/api/projects");
}

export function createProject(
  name: string,
  color: string,
  parentId: number | null,
): Promise<{ project: Project }> {
  return request("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, color, parentId }),
  });
}

export function patchProject(
  id: number,
  patch: ProjectPatch,
): Promise<{ projects: Project[] }> {
  return request(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteProject(id: number): Promise<{ ok: boolean }> {
  return request(`/api/projects/${id}`, { method: "DELETE" });
}

export function fetchTypes(): Promise<{ types: TaskType[] }> {
  return request("/api/types");
}

export function createType(
  name: string,
  emoji: string,
): Promise<{ type: TaskType }> {
  return request("/api/types", {
    method: "POST",
    body: JSON.stringify({ name, emoji }),
  });
}

export function patchType(
  id: number,
  patch: Partial<{ name: string; emoji: string; position: number }>,
): Promise<{ type: TaskType }> {
  return request(`/api/types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteType(id: number): Promise<{ ok: boolean }> {
  return request(`/api/types/${id}`, { method: "DELETE" });
}

export function fetchLinkTypes(): Promise<{ linkTypes: LinkType[] }> {
  return request("/api/link-types");
}

export function createLinkType(
  name: string,
  reverseName: string,
  directed: boolean,
): Promise<{ linkType: LinkType }> {
  return request("/api/link-types", {
    method: "POST",
    body: JSON.stringify({ name, reverseName, directed }),
  });
}

export function patchLinkType(
  id: number,
  patch: Partial<{ name: string; reverseName: string; directed: boolean; position: number }>,
): Promise<{ linkType: LinkType }> {
  return request(`/api/link-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteLinkType(id: number): Promise<{ ok: boolean }> {
  return request(`/api/link-types/${id}`, { method: "DELETE" });
}

export function fetchTaskLinks(): Promise<{ taskLinks: TaskLink[] }> {
  return request("/api/task-links");
}

export function createTaskLink(
  fromId: number,
  toId: number,
  typeId: number,
): Promise<{ taskLink: TaskLink }> {
  return request("/api/task-links", {
    method: "POST",
    body: JSON.stringify({ fromId, toId, typeId }),
  });
}

export function deleteTaskLink(id: number): Promise<{ ok: boolean }> {
  return request(`/api/task-links/${id}`, { method: "DELETE" });
}

export function fetchPeople(): Promise<{ people: Person[] }> {
  return request("/api/people");
}

export function createPerson(
  name: string,
  color: string,
): Promise<{ person: Person }> {
  return request("/api/people", {
    method: "POST",
    body: JSON.stringify({ name, color }),
  });
}

export function patchPerson(
  id: number,
  patch: Partial<{
    name: string;
    color: string;
    roleId: number | null;
    position: number;
  }>,
): Promise<{ person: Person }> {
  return request(`/api/people/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deletePerson(id: number): Promise<{ ok: boolean }> {
  return request(`/api/people/${id}`, { method: "DELETE" });
}

export function fetchRoles(): Promise<{ roles: Role[] }> {
  return request("/api/roles");
}

export function createRole(name: string): Promise<{ role: Role }> {
  return request("/api/roles", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function patchRole(
  id: number,
  patch: { name?: string; position?: number },
): Promise<{ role: Role }> {
  return request(`/api/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteRole(id: number): Promise<{ ok: boolean }> {
  return request(`/api/roles/${id}`, { method: "DELETE" });
}

export function fetchMembers(): Promise<{
  members: { projectId: number; personId: number }[];
}> {
  return request("/api/members");
}

export function setProjectMembers(
  projectId: number,
  personIds: number[],
): Promise<{ ok: boolean }> {
  return request(`/api/projects/${projectId}/members`, {
    method: "PUT",
    body: JSON.stringify({ personIds }),
  });
}
