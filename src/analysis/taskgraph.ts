import { MainThreadTasks, TaskNode } from 'tracium/lib/main-thread-tasks';
export { TaskNode } from 'tracium/lib/main-thread-tasks';

export interface TaskWithData<Data extends {} = {}> extends TaskNode {
  children: this[];
  parent?: this;
  metadata: Data;
};

export type AnyTask = TaskWithData<{}>;

export type TaskWithAddedData<
  T extends AnyTask,
  NewData extends {}
> = T extends TaskWithData<infer Data>
  ? TaskWithData<Data & NewData>
  : never;

export type TaskTrace<TaskData extends {}, Metadata extends {}> = {
  _TaskType?: TaskWithData<TaskData>;
  tasks: TaskWithData<TaskData>[];
  metadata: Metadata;
};

export type AnyTaskTrace = TaskTrace<{}, {}>;

export type TaskTraceWithAddedData<
  T extends AnyTaskTrace,
  NewTaskData extends {},
  NewMetadata extends {}
> = T extends TaskTrace<infer TaskData, infer Metadata>
  ? T & TaskTrace<TaskData & NewTaskData, Metadata & NewMetadata>
  : never;

export type HasTaskId = {
  taskId: number;
};

export async function computeMainThreadTasks(
  trace: object
): Promise<TaskTrace<HasTaskId, {}>> {
  const traceEvents = 'traceEvents' in trace ? trace : { traceEvents: trace };
  const allTasks = await MainThreadTasks.compute(traceEvents as LH.Trace);

  const result: TaskTrace<HasTaskId, {}> = {
    tasks: [],
    metadata: {}
  };

  // Tag each task with an id to make it easier to correlate the trace with
  // summary output. This also initializes the TaskWithData#metadata field so
  // later passes don't need to check if it exists.
  let nextTaskId = 0;
  for (const task of allTasks as TaskWithData<HasTaskId>[]) {
    task.metadata = {
      taskId: nextTaskId++
    };
    if (!task.parent) {
      result.tasks.push(task);
    }
  }

  return result;
}
