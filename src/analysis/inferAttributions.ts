import { assignAttributions } from './assignAttributions';
import { inferFrameSourceLocations } from './inferFrameSourceLocations';
import { propagateAttributions } from './propagateAttributions';

import { AttributionInfo, HasAttributionInfo } from '../attributions';
import { FrameInfo, HasFrameInfo } from '../frames';
import { log } from '../log';
import {
  HasTaskId,
  TaskTrace,
  TaskTraceWithAddedData,
  TaskWithData
} from '../taskgraph';

function propagateAttributionFromFrameInfo(
  taskAttribution: AttributionInfo,
  frameInfo: FrameInfo
): AttributionInfo {
  if (taskAttribution.kind === 'sourceLocation') {
    return taskAttribution;  // Things are as good as they can get already.
  }

  if (
    frameInfo.lineNumber === 1 &&
    frameInfo.columnNumber === 1
  ) {
    // The new attribution will be file-level, so it's only an improvement if
    // the old one was totally unknown.
    if (taskAttribution.kind !== 'unknown') {
      return taskAttribution;
    }

    return {
      kind: 'file',
      lighthouseAttributableURLs: [...taskAttribution.lighthouseAttributableURLs],
      triggers: [...taskAttribution.triggers],
      url: frameInfo.url
    };
  }

  return {
    kind: 'sourceLocation',
    lighthouseAttributableURLs: [...taskAttribution.lighthouseAttributableURLs],
    triggers: [...taskAttribution.triggers],
    ...frameInfo
  };
}

// Look for attributions that aren't source locations, but for which we have a
// frame id, and try to give them a source location. This is basically a greatly
// simplified version of assignAttributions that only handles frame ids.
function updateFrameAttributions(
  frameInfoMap: Map<string, FrameInfo>,
  tasks: TaskWithData<HasAttributionInfo & HasTaskId>[]
): boolean {
  let changed = false;

  for (const task of tasks) {
    const taskAttribution = task.metadata.attributionInfo;
    const taskId = task.metadata.taskId;

    if (taskAttribution.kind !== 'sourceLocation') {
      const args = task.event.args ?? {};
      const frame = args?.data?.frame ?? args.frame;

      if (frame && frameInfoMap.has(frame)) {
        const newAttribution = propagateAttributionFromFrameInfo(
          taskAttribution,
          frameInfoMap.get(frame)!
        );

        if (newAttribution !== taskAttribution) {
          log.debug(
            `Reassigned task ${taskId} to a source attribution from newly ` +
            `inferred stack frame ${frame}`
          );

          task.metadata.attributionInfo = newAttribution;
          changed = true;
        }
      }
    }

    const subtreeChanged = updateFrameAttributions(frameInfoMap, task.children);
    changed = changed || subtreeChanged;
  }

  return changed;
}

// This is a meta-pass that runs all of the attribution-related passes and
// labels the tasks in the provided trace with the best-quality attributions it
// can infer.
export function inferAttributions<T extends TaskTrace<HasTaskId, {}>>(
  trace: T
): asserts trace is TaskTraceWithAddedData<T, HasAttributionInfo, HasFrameInfo> {
  log.debug(`Starting inferAttributions pass.`);

  inferFrameSourceLocations(trace);
  assignAttributions(trace);

  // Attribution propagation is an iterative process that should converge, but
  // just in case there's a bug that prevents convergence, limit the number of
  // iterations we'll perform.
  const iterationLimit = 10;

  for (let i = 0; i < iterationLimit; i++) {
    log.debug(`Starting inferAttributions propagation: iteration ${i}.`);

    // Propagate attributions.
    propagateAttributions(trace);

    // Infer frame source locations again and see if we improved any
    // attributions. If so, we'll want to propagate again.
    inferFrameSourceLocations(trace);
    const attributionsChanged = 
      updateFrameAttributions(trace.metadata.frameInfo, trace.tasks);

    if (!attributionsChanged) {
      log.debug(`inferAttributions propagation: done.`);
      return;
    }
  }

  log.debug(`inferAttributions propagation: exceeded iteration limit!`);
}