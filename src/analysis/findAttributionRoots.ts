import { attributionId, HasAttributionInfo } from '../attributions';
import { log } from '../log';
import {
  HasTaskId,
  TaskTrace,
  TaskWithData
} from '../taskgraph';

function assignAttributionRoots(
  tasks: TaskWithData<HasAttributionInfo & HasTaskId>[],
  ancestorAttributions: string[]
): void {
  for (const task of tasks) {
    const attrId = attributionId(task.metadata.attributionInfo);

    // A task is an attribution root if it has no ancestors with the same
    // attribution.
    if (!ancestorAttributions.includes(attrId)) {
      log.debug(
        `Task %n is an attribution root for attribution %s`,
        task.metadata.taskId,
        attrId
      );
      task.metadata.attributionInfo.isRoot = true;
    }

    // Visit the children with this task's attribution root added to the stack.
    ancestorAttributions.push(attrId);
    assignAttributionRoots(task.children, ancestorAttributions);
    ancestorAttributions.pop();
  }
}

// A pass that finds and tags attribution roots - entry points into a task
// subtree with the same attribution.
export function findAttributionRoots(
  trace: TaskTrace<HasAttributionInfo & HasTaskId, {}>
): void {
  log.debug(`Starting findAttributionRoots pass.`);
  assignAttributionRoots(trace.tasks, []);
}
