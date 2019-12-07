import {
  attributionId,
  Attribution,
  AttributionMap,
  HasAttributionInfo,
  HasAttributionMap
} from '../attributions';
import { log } from '../log';
import { HasTaskId, TaskTrace, TaskWithData } from '../taskgraph';

// Figure out if this task's current attribution can be improved using
// attribution information from another source. If so, propagate that
// information to this task; otherwise, retain the task's current attribution.
function propagateAttribution(
  taskAttribution: Attribution,
  propagatedAttribution?: Attribution
): Attribution {
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

      // The propagated attribution is more precise.
      return propagatedAttribution;

    case 'unknown':
      if (propagatedAttribution.kind === 'unknown') {
        // The propagated attribution is no better.
        return taskAttribution;
      }

      // The propagated attribution is more precise.
      return propagatedAttribution;

    default:
      const unknown: never = taskAttribution;
      throw new Error(`Unexpected attribution kind: ${JSON.stringify(unknown)}`);
  }
}

function findCommonAttribution(
  attributionMap: AttributionMap,
  attributions: Attribution[]
): Attribution | undefined {
  const urls = new Set<string>();
  const sourceAttrs = new Set<string>();
  let sourceAttribution: Attribution | undefined;

  // Find common factors between the attributions.
  for (const attribution of attributions) {
    switch (attribution.kind) {
      case 'sourceLocation':
        urls.add(attribution.url);
        sourceAttrs.add(attributionId(attribution));
        if (!sourceAttribution) {
          sourceAttribution = attribution;
        }
        continue;

      case 'file':
        urls.add(attribution.url);
        continue;

      case 'unknown':
        continue;

      default:
        const unknown: never = attribution;
        throw new Error(`Unexpected attribution kind: ${JSON.stringify(unknown)}`);
    }
  }

  // If there are multiple URLs - i.e., multiple scripts - represented, then
  // there's no common attribution.
  if (urls.size !== 1) {
    return undefined;
  }

  // If only one source attribution is represented, then we'll treat that as the
  // common attribution. Return an arbitrary source attribution from the list.
  if (sourceAttrs.size === 1 && sourceAttribution) {
    return sourceAttribution;
  }

  // If there's a common script but no common source attribution, then we can
  // generate a common file attribution. Note that the only thing that really
  // matters here is the URL; the other fields don't get propagated.
  const url = [...urls.values()][0];
  return attributionMap.create({ kind: 'file', url });
}

function propagateCommonAttributionToTasks(
  attributionMap: AttributionMap,
  kind: 'task sequence' | 'child tasks',
  fromTasks: TaskWithData<HasAttributionInfo & HasTaskId>[],
  toTasks: TaskWithData<HasAttributionInfo & HasTaskId>[]
): boolean {
  let changed = false;

  const commonAttribution = findCommonAttribution(
    attributionMap,
    fromTasks.map(task => task.metadata.attribution)
  );

  const fromTaskIds = fromTasks.map(task => task.metadata.taskId);

  for (const toTask of toTasks) {
    const propagatedAttribution = propagateAttribution(
      toTask.metadata.attribution,
      commonAttribution
    );
    if (propagatedAttribution !== toTask.metadata.attribution) {
      log.debug(
        `Propagating common attribution from ${kind} ` +
        `${JSON.stringify(fromTaskIds)} to task ${toTask.metadata.taskId}`
      );
      changed = true;
      toTask.metadata.attribution = propagatedAttribution;
    }
  }

  return changed;
}

// Propagate attributions by scope - i.e., from parent to child. We also
// propagate in reverse, from child to parent, in cases where that would be
// unambiguous and the child is more specific.
function propagateByScope(
  attributionMap: AttributionMap,
  tasks: TaskWithData<HasAttributionInfo & HasTaskId>[],
  scopeAttribution?: Attribution
): boolean {
  let changed = false;

  for (const task of tasks) {
    // Propagate the attribution from the enclosing scope.
    const propagatedAttribution = propagateAttribution(
      task.metadata.attribution,
      scopeAttribution
    );
    if (propagatedAttribution !== task.metadata.attribution) {
      log.debug(
        `Propagating scope attribution from parent ${task.parent!.metadata.taskId} ` +
        `to child ${task.metadata.taskId}`
      );
      changed = true;
      task.metadata.attribution = propagatedAttribution;
    }

    // Propagate to child tasks.
    const changedViaChildren = propagateByScope(
      attributionMap,
      task.children,
      propagatedAttribution
    );
    changed = changed || changedViaChildren;

    // If there's a consistent attribution for all children, propagate it
    // upwards to the parent.
    const changedViaUpwardsPropagation = propagateCommonAttributionToTasks(
      attributionMap,
      'child tasks',
      task.children,
      [task]
    );

    changed = changed || changedViaUpwardsPropagation;
  }

  return changed;
}

// Propagate attributions within sequences of related tasks. The idea is that
// unattributed tasks within a sequence are usually a consequence of earlier
// tasks in the sequence.
function propagateBySequence(
  attributionMap: AttributionMap,
  tasks: TaskWithData<HasAttributionInfo & HasTaskId>[]
): boolean {
  let changed = false;

  let tasksWithSameScript: TaskWithData<HasAttributionInfo & HasTaskId>[] = [];
  let scriptUrl: string | undefined;
  for (const task of tasks) {
    const attr = task.metadata.attribution;
    if (attr.kind === 'unknown') {
      tasksWithSameScript.push(task);
      continue;
    }
    if (scriptUrl === undefined) {
      scriptUrl = attr.url;
    }
    if (attr.url === scriptUrl) {
      tasksWithSameScript.push(task);
      continue;
    }

    // We just transitioned to a new script. The tasks we've collected have a
    // common attribution; find it and propagate it.
    const changedViaSequencePropagation = propagateCommonAttributionToTasks(
      attributionMap,
      'task sequence',
      tasksWithSameScript,
      tasksWithSameScript
    );
    changed = changed || changedViaSequencePropagation;

    // Start collecting the next group of tasks.
    tasksWithSameScript = [task];
    scriptUrl = attr.url;
  }

  if (tasksWithSameScript.length > 0) {
    // Propagate the common attribution for the final group of tasks.
    const changedViaSequencePropagation = propagateCommonAttributionToTasks(
      attributionMap,
      'task sequence',
      tasksWithSameScript,
      tasksWithSameScript
    );
    changed = changed || changedViaSequencePropagation;
  }

  // Process the child tasks.
  for (const task of tasks) {
    const changedViaChildren = propagateBySequence(attributionMap, task.children);
    changed = changed || changedViaChildren;
  }

  return changed;
}

// A pass that propagates attributions through the task graph, using the context
// of a task to try to give it a more precise attribution.
export function propagateAttributions(
  trace: TaskTrace<HasAttributionInfo & HasTaskId, HasAttributionMap>
): void {
  // This is an iterative process that should converge, but just in case there's
  // a bug that prevents convergence, limit the number of iterations we'll
  // perform.
  const iterationLimit = 10;

  for (let i = 0; i < iterationLimit; i++) {
    log.debug(`Starting propagateAttributions pass: iteration ${i}`);

    const changedViaScope = propagateByScope(
      trace.metadata.attributionMap,
      trace.tasks
    );
    const changedViaSequence = propagateBySequence(
      trace.metadata.attributionMap,
      trace.tasks
    );

    if (!changedViaScope && !changedViaSequence) {
      log.debug(`propagateAttributions: done.`);
      return;
    }
  }

  log.warn(`propagateAttributions: exceeded iteration limit!`);
}
