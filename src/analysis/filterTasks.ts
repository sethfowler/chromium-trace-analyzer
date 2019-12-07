import { HasAttributionInfo, isAttributedTo } from '../attributions';
import { log } from '../log';
import {
  AnyTask,
  HasTaskId,
  TaskTrace,
  TaskWithData
} from '../taskgraph';

export function filterTasks<T extends TaskTrace<HasTaskId, {}>>(
  trace: T,
  filter: (task: NonNullable<T['_TaskType']>) => boolean
): void {
  log.debug(`Starting filterTasksSimple pass.`);

  const taskFilter = filter as ((task: AnyTask) => boolean);
  const subtreeFilter = (task: TaskWithData<HasTaskId>) => {
    return taskFilter(task) || task.children.some(subtreeFilter);
  }
  trace.tasks = trace.tasks.filter(subtreeFilter);
}

export function filterTasksByUrlPattern<
  T extends TaskTrace<HasAttributionInfo & HasTaskId, {}>
>(
  trace: T,
  scriptUrlPattern: string,
  lineNumber?: number
): void {
  filterTasks(trace, task => {
    const attr = task.metadata.attribution;
    const context = task.metadata.context;
    return isAttributedTo(attr, context, scriptUrlPattern, lineNumber);
  });
}
