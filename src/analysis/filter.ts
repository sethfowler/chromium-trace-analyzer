import {
  AnyTask,
  AnyTaskTrace,
  TaskTraceWithAddedData,
  TaskWithData
} from './taskgraph';

export type TaskFilterResult = {
  // Should we keep the task itself? Ancestors are implicitly kept as well.
  keepTask: boolean;

  // Should we keep the descendants of this task?
  keepDescendants?: boolean;

  // Should we keep the siblings of this task?
  keepSiblings?: boolean;

  // Should we keep the descendants of the siblings of this task?
  keepSiblingDescendants?: boolean;
};

type HasFilterMark = {
  filterMark: boolean;
};

export function markTasks(
  tasks: TaskWithData<HasFilterMark>[],
  filter: (task: AnyTask) => TaskFilterResult,
  keptByAncestor: boolean = false
): boolean {
  let keepSiblings = false;
  let keepSiblingDescendants = false;

  // First pass: check for keepSiblings*.
  for (const task of tasks) {
    const filterResult = filter(task);
    keepSiblings = keepSiblings ||
      filterResult.keepSiblings === true ||
      filterResult.keepSiblingDescendants === true;
    keepSiblingDescendants = keepSiblingDescendants ||
      filterResult.keepSiblingDescendants === true;

    if (keepSiblings && keepSiblingDescendants) {
      break;  // No need to scan further.
    }
  }

  // Second pass: mark the tasks and recursively mark descendants.
  let keptAny: boolean = false;
  for (const task of tasks) {
    const filterResult = filter(task);
    const keepDescendants = keptByAncestor ||
      keepSiblingDescendants ||
      filterResult.keepDescendants;
    const keptDescendant = markTasks(task.children, filter, keepDescendants);

    task.metadata.filterMark = keptByAncestor ||
      filterResult.keepTask ||
      keptDescendant ||
      keepSiblings;
    keptAny = keptAny || task.metadata.filterMark;
  }

  return keptAny;
}

export function sweepTasks(
  tasks: TaskWithData<HasFilterMark>[]
): TaskWithData<HasFilterMark>[] {
  const keptTasks = tasks.filter(task => task.metadata.filterMark !== false);
  for (const task of keptTasks) {
    delete task.metadata.filterMark;
    task.children = sweepTasks(task.children);
  }
  return keptTasks;
}

export function filterTasks<T extends AnyTaskTrace>(
  trace: T,
  filter: (task: NonNullable<T['_TaskType']>) => TaskFilterResult
): void {
  const traceWithAddedData =
    trace as TaskTraceWithAddedData<T, HasFilterMark, {}>;
  markTasks(
    traceWithAddedData.tasks,
    filter as ((task: AnyTask) => TaskFilterResult)
  );
  traceWithAddedData.tasks = sweepTasks(traceWithAddedData.tasks);
}
