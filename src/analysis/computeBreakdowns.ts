import { Attribution, HasAttributionInfo } from '../attributions';
import {
  Breakdown,
  HasBreakdown,
  HasGlobalBreakdown,
  mergeBreakdownsByAttribution,
  sumOfBreakdowns,
  updateBreakdownForAttribution
} from '../breakdowns';
import { log } from '../log';
import {
  HasTaskId,
  TaskTrace,
  TaskTraceWithAddedData,
  TaskWithData
} from '../taskgraph';

function gatherBreakdowns(
  tasks: TaskWithData<HasBreakdown & HasTaskId>[]
): Breakdown {
  const allSubtreeBreakdowns: Breakdown[] = [];

  for (const task of tasks) {
    // Gather a breakdown of all descendant tasks. This is the "other" time for
    // this task.
    const subtreeBreakdown = gatherBreakdowns(task.children);

    // Compute the "self" time for this task - this is the portion of this
    // task's duration that was not explained by descendant tasks.
    if (task.group.id in subtreeBreakdown) {
      const selfTime = task.duration - subtreeBreakdown.total;
      if (selfTime < 0) {
        log.warn(
          `Task %d has duration %d, but its descendants have a greater ` +
          `total duration %d`,
          task.metadata.taskId,
          task.duration,
          subtreeBreakdown.total
        );
      }
      subtreeBreakdown.addSelfTime(selfTime, task.group.id);

      log.debug(
        `Task %d has self time %d and other time %d`,
        task.metadata.taskId,
        subtreeBreakdown.self,
        subtreeBreakdown.total - subtreeBreakdown.self
      );
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

function gatherBreakdownsByAttribution(
  tasks: TaskWithData<HasAttributionInfo & HasBreakdown & HasTaskId>[]
): Map<Attribution, Breakdown> {
  const allDescendantBreakdowns = new Map<Attribution, Breakdown>();

  for (const task of tasks) {
    const descendantBreakdowns = gatherBreakdownsByAttribution(task.children);

    // Compute the breakdown for this task's attribution at this point in the
    // tree.
    updateBreakdownForAttribution(
      descendantBreakdowns,
      task.metadata.attribution,
      task.metadata.breakdown.selfOnly()
    );

    // Save the breakdown for this task.
    task.metadata.breakdownsByAttribution = descendantBreakdowns;

    // Copy this task's breakdowns into the overall breakdown that we'll provide
    // to the parent.
    mergeBreakdownsByAttribution(
      allDescendantBreakdowns,
      descendantBreakdowns
    );
  }

  return allDescendantBreakdowns;
}

// A pass that computes a breakdown for each task - in other words, a high level
// summary of where the task is spending its time.
export function computeBreakdowns<
  T extends TaskTrace<HasAttributionInfo & HasTaskId, {}>
>(
  trace: T
): asserts trace is TaskTraceWithAddedData<T, HasBreakdown, HasGlobalBreakdown> {
  log.debug(`Starting computeBreakdowns pass.`);

  const traceWithAddedData =
    trace as TaskTraceWithAddedData<T, HasBreakdown, HasGlobalBreakdown >

  traceWithAddedData.metadata.globalBreakdown =
    gatherBreakdowns(traceWithAddedData.tasks);
  traceWithAddedData.metadata.globalBreakdownsByAttribution =
    gatherBreakdownsByAttribution(traceWithAddedData.tasks);
}
