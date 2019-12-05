import {
  AttributionInfo,
  HasAttributionInfo,
  SourceAttribution
} from '../attributions';
import { log } from '../log';
import { HasTaskId, TaskTrace, TaskWithData } from '../taskgraph';

// Figure out if this task's current attribution can be improved using
// attribution information from another source. If so, propagate that
// information to this task; otherwise, retain the task's current attribution.
function propagateAttribution(
  taskAttribution: AttributionInfo,
  propagatedAttribution?: AttributionInfo
): AttributionInfo {
  if (!propagatedAttribution) {
    return taskAttribution;  // Nothing to propagate.
  }

  switch (taskAttribution.kind) {
    case 'sourceLocation':
      // The task attribution we have is high quality.
      return taskAttribution;

    case 'file':
      if (propagatedAttribution.kind !== 'sourceLocation') {
        // The propagated attribution is no better.
        return taskAttribution;
      }

      if (taskAttribution.url !== propagatedAttribution.url) {
        // The propagated attribution is for a different script.
        return taskAttribution;
      }

      break;

    case 'unknown':
      if (propagatedAttribution.kind === 'unknown') {
        // The propagated attribution is no better.
        return taskAttribution;
      }

      break;

    default:
      const unknown: never = taskAttribution;
      throw new Error(`Unexpected attribution kind: ${JSON.stringify(unknown)}`);
  }

  // The propagated attribution is more precise. We'll use that, but keep around
  // Lighthouse's opinion of this specific task's attribution.
  return {
    ...propagatedAttribution,
    lighthouseAttributableURLs: taskAttribution.lighthouseAttributableURLs,
    triggers: taskAttribution.triggers
  };
}

// Propagate attributions by scope - i.e., from parent to child. We also
// propagate in reverse, from child to parent, in cases where that would be
// unambiguous and the child is more specific.
function propagateByScope(
  tasks: TaskWithData<HasAttributionInfo & HasTaskId>[],
  scopeAttribution?: AttributionInfo
): boolean {
  let changed = false;

  for (const task of tasks) {
    // Propagate the attribution from the enclosing scope.
    const propagatedAttribution = propagateAttribution(
      task.metadata.attributionInfo,
      scopeAttribution
    );
    if (propagatedAttribution !== task.metadata.attributionInfo) {
      log.debug(
        `Propagating scope attribution from parent ${task.parent!.metadata.taskId} ` +
        `to child ${task.metadata.taskId}`
      );
      changed = true;
      task.metadata.attributionInfo = propagatedAttribution;
    }

    // Propagate to child tasks.
    const changedViaChildren = propagateByScope(
      task.children,
      propagatedAttribution
    );
    changed = changed || changedViaChildren;

    // Check if there's a consistent attribution for all children.
    let childrenAttribution: SourceAttribution | undefined;
    for (const child of task.children) {
      const childAttribution = child.metadata.attributionInfo;
      if (childAttribution.kind === 'sourceLocation') {
        if (!childrenAttribution) {
          childrenAttribution = childAttribution;
          continue;
        }
        if (
          childAttribution.url !== childrenAttribution.url ||
          childAttribution.lineNumber !== childrenAttribution.lineNumber ||
          childAttribution.columnNumber !== childrenAttribution.columnNumber
        ) {
          // There's no consistent attribution for all children, so don't
          // propagate upwards.
          childrenAttribution = undefined;
          break;
        }
      } else if (childAttribution.kind === 'file') {
        if (
          childrenAttribution &&
          childAttribution.url !== childrenAttribution.url
        ) {
          // There's no consistent attribution for all children, so don't
          // propagate upwards.
          childrenAttribution = undefined;
          break;
        }
      }
    }

    // If we found a consistent attribution, propagate it upwards.
    const upwardsAttribution = propagateAttribution(
      propagatedAttribution,
      childrenAttribution
    );
    if (upwardsAttribution !== task.metadata.attributionInfo) {
      log.debug(
        `Propagating child attributions to parent ${task.metadata.taskId}`
      );
      changed = true;
      task.metadata.attributionInfo = upwardsAttribution;
    }
  }

  return changed;
}

// Propagate attributions within sequences of related tasks. The idea is that
// unattributed tasks within a sequence are usually a consequence of earlier
// tasks in the sequence.
function propagateBySequence(
  tasks: TaskWithData<HasAttributionInfo & HasTaskId>[]
): boolean {
  let changed = false;

  // Locate the first attribution with a source location.
  let lastSourceAttribution: AttributionInfo | undefined;
  let lastSourceAttributionTaskId: number | undefined;
  for (const task of tasks) {
    const attrInfo = task.metadata.attributionInfo;
    if (attrInfo.kind === 'sourceLocation') {
      lastSourceAttribution = attrInfo;
      lastSourceAttributionTaskId = task.metadata.taskId;
      break;
    }
  }

  // Walk over the tasks in sequence and try to propagate the most recent source
  // location to it. For tasks before the first source location, we that first
  // source location backwards to them. (That's why we find the first source
  // location above.)
  for (const task of tasks) {
    const attrInfo = task.metadata.attributionInfo;
    if (attrInfo.kind === 'sourceLocation') {
      lastSourceAttribution = attrInfo;
      lastSourceAttributionTaskId = task.metadata.taskId;
      continue;
    }
    if (lastSourceAttribution && attrInfo.kind === 'file') {
      const propagatedAttribution = propagateAttribution(
        attrInfo,
        lastSourceAttribution
      );
      if (propagatedAttribution !== task.metadata.attributionInfo) {
        log.debug(
          `Propagating sequence attribution from task ${lastSourceAttributionTaskId!} ` +
          ` to task ${task.metadata.taskId}`
        );
        changed = true;
        task.metadata.attributionInfo = propagatedAttribution;
      }
    }
  }

  // Process the child tasks.
  for (const task of tasks) {
    const changedViaChildren = propagateBySequence(task.children);
    changed = changed || changedViaChildren;
  }

  return changed;
}

// A pass that propagates attributions through the task graph, using the context
// of a task to try to give it a more precise attribution.
export function propagateAttributions(
  trace: TaskTrace<HasAttributionInfo & HasTaskId, {}>
): void {
  // This is an iterative process that should converge, but just in case there's
  // a bug that prevents convergence, limit the number of iterations we'll
  // perform.
  const iterationLimit = 10;

  for (let i = 0; i < iterationLimit; i++) {
    log.debug(`Starting propagateAttributions pass: iteration ${i}`);

    const changedViaScope = propagateByScope(trace.tasks);
    const changedViaSequence = propagateBySequence(trace.tasks);

    if (!changedViaScope && !changedViaSequence) {
      log.debug(`propagateAttributions: done.`);
      return;
    }
  }

  log.warn(`propagateAttributions: exceeded iteration limit!`);
}
