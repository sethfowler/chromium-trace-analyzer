import {  HasAttributionInfo } from '../attributions';
import {
  Breakdown,
  HasBreakdown,
  sumOfBreakdowns
} from '../breakdowns';
import { log } from '../log';
import {
  HasTaskId,
  TaskTrace,
  TaskTraceWithAddedData,
  TaskWithData
} from '../taskgraph';

function gatherBreakdowns(
  tasks: TaskWithData<HasAttributionInfo & HasBreakdown & HasTaskId>[]
): Breakdown {
  const allSubtreeBreakdowns: Breakdown[] = [];

  for (const task of tasks) {
    // Gather a breakdown of all descendant tasks. This is the "other" time for
    // this task.
    const subtreeBreakdown = gatherBreakdowns(task.children);

    // Compute the "self" time for this task - this is the portion of this
    // task's duration that was not explained by descendant tasks.
    if (task.group.id in subtreeBreakdown) {
      let selfTime = task.duration - subtreeBreakdown.total;
      if (selfTime < 0) {
        log.warn(
          `Task %d has duration %d, but its descendants have a greater ` +
          `total duration %d`,
          task.metadata.taskId,
          task.duration,
          subtreeBreakdown.total
        );
      }
      selfTime = Math.max(selfTime, 0);

      log.debug(
        `Task %d has self time %d and other time %d`,
        task.metadata.taskId,
        selfTime,
        subtreeBreakdown.total
      );

      subtreeBreakdown[task.group.id] += selfTime;
      subtreeBreakdown.total += selfTime;
    } else {
      log.warn(`Omitting unknown task group id '${task.group.id}' from breakdown`);
    }

    task.metadata.breakdown = subtreeBreakdown;
    allSubtreeBreakdowns.push(subtreeBreakdown);
  }

  // Return the breakdown for all subtrees at this level; this will end up
  // making up the parent task's "other" time.
  return sumOfBreakdowns(...allSubtreeBreakdowns);
}

// A pass that computes a breakdown for each task - in other words, a high level
// summary of where the task is spending its time.
export function computeBreakdowns<
  T extends TaskTrace<HasAttributionInfo & HasTaskId, {}>
>(
  trace: T
): asserts trace is TaskTraceWithAddedData<T, HasBreakdown, {}> {
  log.debug(`Starting computeBreakdowns pass.`);

  const traceWithAddedData = trace as TaskTraceWithAddedData<T, HasBreakdown, {}>
  gatherBreakdowns(traceWithAddedData.tasks);
}
