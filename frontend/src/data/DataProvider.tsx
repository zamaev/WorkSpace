import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as api from "./api";
import { noteSubtreeIds, subtreeIds } from "./selectors";
import type {
  CreateTaskReq,
  Note,
  NotePatch,
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

type Store = {
  tasks: Map<number, Task>;
  projects: Map<number, Project>;
  types: Map<number, TaskType>;
  people: Map<number, Person>;
  roles: Map<number, Role>;
  members: Map<number, number[]>; // projectId → personIds
  notes: Map<number, Note>;
  linkTypes: Map<number, LinkType>;
  taskLinks: TaskLink[];
  loading: boolean;
  offline: boolean;
  error: string | null;
  retry: () => void;
  create: (req: CreateTaskReq) => Promise<Task | null>;
  patch: (id: number, p: TaskPatch) => Promise<void>;
  remove: (id: number) => Promise<void>;
  createProject: (
    name: string,
    color: string,
    parentId: number | null,
  ) => Promise<Project | null>;
  patchProject: (id: number, p: ProjectPatch) => Promise<void>;
  removeProject: (id: number) => Promise<void>;
  createType: (name: string, emoji: string) => Promise<TaskType | null>;
  patchType: (
    id: number,
    p: Partial<{ name: string; emoji: string; position: number }>,
  ) => Promise<void>;
  removeType: (id: number) => Promise<void>;
  createRole: (name: string) => Promise<Role | null>;
  patchRole: (
    id: number,
    p: { name?: string; position?: number },
  ) => Promise<void>;
  removeRole: (id: number) => Promise<void>;
  setMembers: (projectId: number, personIds: number[]) => Promise<void>;
  createPerson: (name: string, color: string) => Promise<Person | null>;
  patchPerson: (
    id: number,
    p: Partial<{
      name: string;
      color: string;
      roleId: number | null;
      position: number;
    }>,
  ) => Promise<void>;
  removePerson: (id: number) => Promise<void>;
  createNote: (title: string, parentId: number | null) => Promise<Note | null>;
  patchNote: (id: number, p: NotePatch) => Promise<void>;
  removeNote: (id: number) => Promise<void>;
  createLink: (fromId: number, toId: number, typeId: number) => Promise<void>;
  removeLink: (id: number) => Promise<void>;
  createLinkType: (name: string, reverseName: string, directed: boolean) => Promise<LinkType | null>;
  patchLinkType: (id: number, p: Partial<{ name: string; reverseName: string; directed: boolean; position: number }>) => Promise<void>;
  removeLinkType: (id: number) => Promise<void>;
  toast: (msg: string) => void;
};

const Ctx = createContext<Store | null>(null);

export function useData(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData вне DataProvider");
  return ctx;
}

function stripTask(t: Task & { createdAt?: string; updatedAt?: string }): Task {
  const {
    id,
    parentId,
    projectId,
    title,
    description,
    done,
    scheduledOn,
    endOn,
    softDueOn,
    dueOn,
    typeId,
    assigneeId,
    position,
    dayPosition,
    repeat,
    seriesId,
  } = t;
  return {
    id,
    parentId,
    projectId,
    title,
    description,
    done,
    scheduledOn,
    endOn,
    softDueOn,
    dueOn,
    typeId,
    assigneeId,
    position,
    dayPosition,
    repeat: repeat ?? null,
    seriesId: seriesId ?? null,
  };
}

function stripNote(n: Note & { createdAt?: string; updatedAt?: string }): Note {
  const { id, parentId, title, body, position } = n;
  return { id, parentId, title, body, position };
}

function stripProject(
  p: Project & { createdAt?: string; updatedAt?: string },
): Project {
  const { id, parentId, name, color, startOn, dueOn, archived, position } = p;
  return { id, parentId, name, color, startOn, dueOn, archived, position };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Map<number, Task>>(new Map());
  const [projects, setProjects] = useState<Map<number, Project>>(new Map());
  const [types, setTypes] = useState<Map<number, TaskType>>(new Map());
  const [people, setPeople] = useState<Map<number, Person>>(new Map());
  const [roles, setRoles] = useState<Map<number, Role>>(new Map());
  const [members, setMembersState] = useState<Map<number, number[]>>(new Map());
  const [notes, setNotes] = useState<Map<number, Note>>(new Map());
  const [linkTypes, setLinkTypes] = useState<Map<number, LinkType>>(new Map());
  const [taskLinks, setTaskLinks] = useState<TaskLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setError(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setError(null), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { tasks: taskList },
        { projects: projectList },
        { types: typeList },
        { people: peopleList },
        { roles: roleList },
        { members: memberList },
        { notes: noteList },
        { linkTypes: linkTypeList },
        { taskLinks: taskLinkList },
      ] = await Promise.all([
        api.fetchTasks(),
        api.fetchProjects(),
        api.fetchTypes(),
        api.fetchPeople(),
        api.fetchRoles(),
        api.fetchMembers(),
        api.fetchNotes(),
        api.fetchLinkTypes(),
        api.fetchTaskLinks(),
      ]);
      setTasks(new Map(taskList.map((t) => [t.id, stripTask(t)])));
      setProjects(new Map(projectList.map((p) => [p.id, stripProject(p)])));
      setTypes(new Map((typeList ?? []).map((t) => [t.id, t])));
      setPeople(new Map((peopleList ?? []).map((p) => [p.id, p])));
      setRoles(new Map((roleList ?? []).map((r) => [r.id, r])));
      const mm = new Map<number, number[]>();
      for (const m of memberList ?? []) {
        mm.set(m.projectId, [...(mm.get(m.projectId) ?? []), m.personId]);
      }
      setMembersState(mm);
      setNotes(new Map((noteList ?? []).map((n) => [n.id, stripNote(n)])));
      setLinkTypes(new Map((linkTypeList ?? []).map((l) => [l.id, l])));
      setTaskLinks(taskLinkList ?? []);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Мутации оптимистичны: применяем локально, при ошибке откатываем снапшот.
  // Ответ сервера — источник истины (каскады done и перенумерации приходят оттуда).

  const mergeTasks = useCallback((updated: Task[]) => {
    setTasks((prev) => {
      const next = new Map(prev);
      for (const t of updated) next.set(t.id, stripTask(t));
      return next;
    });
  }, []);

  const create = useCallback(
    async (req: CreateTaskReq): Promise<Task | null> => {
      try {
        const { task, tasks: affected } = await api.createTask(req);
        mergeTasks(affected);
        return task;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось создать задачу");
        return null;
      }
    },
    [mergeTasks, toast],
  );

  // при ошибке мутации не откатываем снапшотом (он затёр бы параллельно
  // завершившиеся мутации) — перечитываем правду с сервера
  const restoreTasks = useCallback(async () => {
    try {
      const { tasks: fresh } = await api.fetchTasks();
      setTasks(new Map(fresh.map((t) => [t.id, stripTask(t)])));
    } catch {
      // сервер недоступен — состояние поправит следующий успешный запрос
    }
  }, []);

  const patch = useCallback(
    async (id: number, p: TaskPatch) => {
      if (!tasks.has(id)) return;
      // локально применяем только собственные поля задачи; каскады и позиции
      // сиблингов придут из ответа
      setTasks((prev) => {
        const cur = prev.get(id);
        if (!cur) return prev;
        const next = new Map(prev);
        const optimistic = { ...cur, ...p };
        // зеркалим серверный каскад: без плана не бывает диапазона —
        // иначе оптимистичный рендер видит противоречивое состояние
        if (p.scheduledOn === null) optimistic.endOn = null;
        next.set(id, optimistic);
        return next;
      });
      try {
        const { tasks: updated } = await api.patchTask(id, p);
        mergeTasks(updated);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось сохранить");
        void restoreTasks();
      }
    },
    [tasks, mergeTasks, toast, restoreTasks],
  );

  const remove = useCallback(
    async (id: number) => {
      const doomed = new Set(subtreeIds(tasks, id));
      setTasks((prev) => {
        const next = new Map<number, Task>();
        for (const [tid, t] of prev) {
          if (!doomed.has(tid)) next.set(tid, t);
        }
        return next;
      });
      try {
        await api.deleteTask(id);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось удалить");
        void restoreTasks();
      }
    },
    [tasks, toast, restoreTasks],
  );

  const createProject = useCallback(
    async (
      name: string,
      color: string,
      parentId: number | null,
    ): Promise<Project | null> => {
      try {
        const { project } = await api.createProject(name, color, parentId);
        setProjects((prev) =>
          new Map(prev).set(project.id, stripProject(project)),
        );
        return project;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось создать проект");
        return null;
      }
    },
    [toast],
  );

  const patchProject = useCallback(
    async (id: number, p: ProjectPatch) => {
      const snapshot = projects;
      const cur = projects.get(id);
      if (!cur) return;
      setProjects((prev) => {
        const next = new Map(prev);
        next.set(id, { ...cur, ...p });
        return next;
      });
      try {
        const { projects: updated } = await api.patchProject(id, p);
        setProjects((prev) => {
          const next = new Map(prev);
          for (const pr of updated) next.set(pr.id, stripProject(pr));
          return next;
        });
      } catch (e) {
        setProjects(snapshot);
        toast(e instanceof Error ? e.message : "Не удалось сохранить проект");
      }
    },
    [projects, toast],
  );

  // сервер удаляет только пустые проекты — задачи не трогаем
  const removeProject = useCallback(
    async (id: number) => {
      const snapshot = projects;
      setProjects((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      try {
        await api.deleteProject(id);
      } catch (e) {
        setProjects(snapshot);
        toast(e instanceof Error ? e.message : "Не удалось удалить проект");
      }
    },
    [projects, toast],
  );

  const createType = useCallback(
    async (name: string, emoji: string): Promise<TaskType | null> => {
      try {
        const { type } = await api.createType(name, emoji);
        setTypes((prev) => new Map(prev).set(type.id, type));
        return type;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось создать тип");
        return null;
      }
    },
    [toast],
  );

  const removeType = useCallback(
    async (id: number) => {
      const snapТ = types;
      const snapTasks = tasks;
      setTypes((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setTasks((prev) => {
        const next = new Map(prev);
        for (const [tid, t] of next) {
          if (t.typeId === id) next.set(tid, { ...t, typeId: null });
        }
        return next;
      });
      try {
        await api.deleteType(id);
      } catch (e) {
        setTypes(snapТ);
        setTasks(snapTasks);
        toast(e instanceof Error ? e.message : "Не удалось удалить тип");
      }
    },
    [types, tasks, toast],
  );

  const patchType = useCallback(
    async (
      id: number,
      p: Partial<{ name: string; emoji: string; position: number }>,
    ) => {
      const snapshot = types;
      const cur = types.get(id);
      if (!cur) return;
      setTypes((prev) => new Map(prev).set(id, { ...cur, ...p }));
      try {
        const { type } = await api.patchType(id, p);
        setTypes((prev) => new Map(prev).set(id, type));
      } catch (e) {
        setTypes(snapshot);
        toast(e instanceof Error ? e.message : "Не удалось сохранить тип");
        return;
      }
      // перестановка меняет позиции соседей — перечитываем список; сбой
      // догрузки НЕ откатывает уже применённый на сервере PATCH
      if (p.position !== undefined) {
        try {
          const { types: fresh } = await api.fetchTypes();
          setTypes(new Map(fresh.map((t) => [t.id, t])));
        } catch {
          // порядок соседей подтянется при следующей загрузке
        }
      }
    },
    [types, toast],
  );

  const createRole = useCallback(
    async (name: string): Promise<Role | null> => {
      try {
        const { role } = await api.createRole(name);
        setRoles((prev) => new Map(prev).set(role.id, role));
        return role;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось создать роль");
        return null;
      }
    },
    [toast],
  );

  const patchRole = useCallback(
    async (id: number, p: { name?: string; position?: number }) => {
      const snapshot = roles;
      const cur = roles.get(id);
      if (!cur) return;
      setRoles((prev) => new Map(prev).set(id, { ...cur, ...p }));
      try {
        const { role } = await api.patchRole(id, p);
        setRoles((prev) => new Map(prev).set(id, role));
      } catch (e) {
        setRoles(snapshot);
        toast(e instanceof Error ? e.message : "Не удалось сохранить роль");
        return;
      }
      // перестановка меняет позиции соседей — перечитываем список; сбой
      // догрузки НЕ откатывает уже применённый на сервере PATCH
      if (p.position !== undefined) {
        try {
          const { roles: fresh } = await api.fetchRoles();
          setRoles(new Map(fresh.map((r) => [r.id, r])));
        } catch {
          // порядок соседей подтянется при следующей загрузке
        }
      }
    },
    [roles, toast],
  );

  const removeRole = useCallback(
    async (id: number) => {
      const snapR = roles;
      const snapP = people;
      setRoles((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setPeople((prev) => {
        const next = new Map(prev);
        for (const [pid, p] of next) {
          if (p.roleId === id) next.set(pid, { ...p, roleId: null });
        }
        return next;
      });
      try {
        await api.deleteRole(id);
      } catch (e) {
        setRoles(snapR);
        setPeople(snapP);
        toast(e instanceof Error ? e.message : "Не удалось удалить роль");
      }
    },
    [roles, people, toast],
  );

  const setMembers = useCallback(
    async (projectId: number, personIds: number[]) => {
      const snapshot = members;
      setMembersState((prev) => new Map(prev).set(projectId, personIds));
      try {
        await api.setProjectMembers(projectId, personIds);
      } catch (e) {
        setMembersState(snapshot);
        toast(
          e instanceof Error ? e.message : "Не удалось сохранить участников",
        );
      }
    },
    [members, toast],
  );

  const createPerson = useCallback(
    async (name: string, color: string): Promise<Person | null> => {
      try {
        const { person } = await api.createPerson(name, color);
        setPeople((prev) => new Map(prev).set(person.id, person));
        return person;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось добавить человека");
        return null;
      }
    },
    [toast],
  );

  const patchPerson = useCallback(
    async (
      id: number,
      p: Partial<{
        name: string;
        color: string;
        roleId: number | null;
        position: number;
      }>,
    ) => {
      const snapshot = people;
      const cur = people.get(id);
      if (!cur) return;
      setPeople((prev) => new Map(prev).set(id, { ...cur, ...p }));
      try {
        const { person } = await api.patchPerson(id, p);
        setPeople((prev) => new Map(prev).set(id, person));
      } catch (e) {
        setPeople(snapshot);
        toast(e instanceof Error ? e.message : "Не удалось сохранить");
        return;
      }
      if (p.position !== undefined) {
        try {
          const { people: fresh } = await api.fetchPeople();
          setPeople(new Map(fresh.map((x) => [x.id, x])));
        } catch {
          // порядок соседей подтянется при следующей загрузке
        }
      }
    },
    [people, toast],
  );

  const removePerson = useCallback(
    async (id: number) => {
      const snapP = people;
      const snapTasks = tasks;
      setPeople((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setTasks((prev) => {
        const next = new Map(prev);
        for (const [tid, t] of next) {
          if (t.assigneeId === id) next.set(tid, { ...t, assigneeId: null });
        }
        return next;
      });
      try {
        await api.deletePerson(id);
      } catch (e) {
        setPeople(snapP);
        setTasks(snapTasks);
        toast(e instanceof Error ? e.message : "Не удалось удалить");
      }
    },
    [people, tasks, toast],
  );

  const mergeNotes = useCallback((updated: Note[]) => {
    setNotes((prev) => {
      const next = new Map(prev);
      for (const n of updated) next.set(n.id, stripNote(n));
      return next;
    });
  }, []);

  const restoreNotes = useCallback(async () => {
    try {
      const { notes: fresh } = await api.fetchNotes();
      setNotes(new Map(fresh.map((n) => [n.id, stripNote(n)])));
    } catch {
      // сервер недоступен — поправит следующий успешный запрос
    }
  }, []);

  const createNote = useCallback(
    async (title: string, parentId: number | null): Promise<Note | null> => {
      try {
        const { note } = await api.createNote(title, parentId);
        setNotes((prev) => new Map(prev).set(note.id, stripNote(note)));
        return note;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось создать заметку");
        return null;
      }
    },
    [toast],
  );

  const createLink = useCallback(
    async (fromId: number, toId: number, typeId: number) => {
      try {
        const { taskLink } = await api.createTaskLink(fromId, toId, typeId);
        setTaskLinks((prev) => [...prev, taskLink]);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось связать");
      }
    },
    [toast],
  );

  const removeLink = useCallback(
    async (id: number) => {
      const snapshot = taskLinks;
      setTaskLinks((prev) => prev.filter((l) => l.id !== id));
      try {
        await api.deleteTaskLink(id);
      } catch (e) {
        setTaskLinks(snapshot);
        toast(e instanceof Error ? e.message : "Не удалось снять связь");
      }
    },
    [taskLinks, toast],
  );

  const createLinkType = useCallback(
    async (name: string, reverseName: string, directed: boolean): Promise<LinkType | null> => {
      try {
        const { linkType } = await api.createLinkType(name, reverseName, directed);
        setLinkTypes((prev) => new Map(prev).set(linkType.id, linkType));
        return linkType;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось создать тип связи");
        return null;
      }
    },
    [toast],
  );

  const patchNote = useCallback(
    async (id: number, p: NotePatch) => {
      if (!notes.has(id)) return;
      setNotes((prev) => {
        const cur = prev.get(id);
        if (!cur) return prev;
        return new Map(prev).set(id, { ...cur, ...p });
      });
      try {
        const { notes: updated } = await api.patchNote(id, p);
        mergeNotes(updated);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось сохранить");
        void restoreNotes();
      }
    },
    [notes, mergeNotes, toast, restoreNotes],
  );

  const removeNote = useCallback(
    async (id: number) => {
      const doomed = new Set(noteSubtreeIds(notes, id));
      setNotes((prev) => {
        const next = new Map<number, Note>();
        for (const [nid, n] of prev) if (!doomed.has(nid)) next.set(nid, n);
        return next;
      });
      try {
        await api.deleteNote(id);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Не удалось удалить");
        void restoreNotes();
      }
    },
    [notes, toast, restoreNotes],
  );

  const patchLinkType = useCallback(
    async (id: number, p: Partial<{ name: string; reverseName: string; directed: boolean; position: number }>) => {
      const cur = linkTypes.get(id);
      if (!cur) return;
      const snapshot = linkTypes;
      setLinkTypes((prev) => new Map(prev).set(id, { ...cur, ...p }));
      try {
        const { linkType } = await api.patchLinkType(id, p);
        setLinkTypes((prev) => new Map(prev).set(id, linkType));
        if (p.position !== undefined) {
          const { linkTypes: fresh } = await api.fetchLinkTypes();
          setLinkTypes(new Map(fresh.map((l) => [l.id, l])));
        }
      } catch (e) {
        setLinkTypes(snapshot);
        toast(e instanceof Error ? e.message : "Не удалось сохранить тип связи");
      }
    },
    [linkTypes, toast],
  );

  const removeLinkType = useCallback(
    async (id: number) => {
      const typeSnapshot = linkTypes;
      const linkSnapshot = taskLinks;
      setLinkTypes((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      // связи этого типа скрываются на сервере — убираем и локально
      setTaskLinks((prev) => prev.filter((l) => l.typeId !== id));
      try {
        await api.deleteLinkType(id);
      } catch (e) {
        setLinkTypes(typeSnapshot);
        setTaskLinks(linkSnapshot);
        toast(e instanceof Error ? e.message : "Не удалось удалить тип связи");
      }
    },
    [linkTypes, taskLinks, toast],
  );

  const value = useMemo<Store>(
    () => ({
      tasks,
      projects,
      types,
      people,
      roles,
      members,
      loading,
      offline,
      error,
      retry: load,
      create,
      patch,
      remove,
      createProject,
      patchProject,
      removeProject,
      createType,
      patchType,
      removeType,
      createRole,
      patchRole,
      removeRole,
      setMembers,
      createPerson,
      patchPerson,
      removePerson,
      notes,
      createNote,
      patchNote,
      removeNote,
      linkTypes,
      taskLinks,
      createLink,
      removeLink,
      createLinkType,
      patchLinkType,
      removeLinkType,
      toast,
    }),
    [
      tasks,
      projects,
      types,
      people,
      roles,
      members,
      loading,
      offline,
      error,
      load,
      create,
      patch,
      remove,
      createProject,
      patchProject,
      removeProject,
      createType,
      patchType,
      removeType,
      createRole,
      patchRole,
      removeRole,
      setMembers,
      createPerson,
      patchPerson,
      removePerson,
      notes,
      createNote,
      patchNote,
      removeNote,
      linkTypes,
      taskLinks,
      createLink,
      removeLink,
      createLinkType,
      patchLinkType,
      removeLinkType,
      toast,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {error && <div className="toast">{error}</div>}
    </Ctx.Provider>
  );
}
