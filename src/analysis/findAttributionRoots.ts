import { Attribution, attributionId, HasAttributionInfo } from '../attributions';
import { log } from '../log';
import {
  HasTaskId,
  TaskTrace,
  TaskWithData
} from '../taskgraph';

function assignAttributionRoots(
  tasks: TaskWithData<HasAttributionInfo & HasTaskId>[],
  ancestorAttributions: Attribution[]
): void {
  for (const task of tasks) {
    const attr = task.metadata.attribution;

    // A task is an attribution root if it has no ancestors with the same
    // attribution.
    if (!ancestorAttributions.includes(attr)) {
      log.debug(
        `Task %n is an attribution root for attribution %s`,
        task.metadata.taskId,
        attributionId(attr)
      );
      task.metadata.context.isAttributionRoot = true;
    } else {
      task.metadata.context.isAttributionRoot = false;
    }

    // Visit the children with this task's attribution root added to the stack.
    ancestorAttributions.push(attr);
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
