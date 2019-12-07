import {
  Attribution,
  AttributionMap,
  HasAttributionInfo,
  HasAttributionMap,
  Trigger
} from '../attributions';
import { FrameInfo, HasFrameInfo } from '../frames';
import { log } from '../log';
import {
  HasTaskId,
  TaskTrace,
  TaskTraceWithAddedData,
  TaskWithData
} from '../taskgraph';

// Given a bunch of metadata about a task and its ancestors (i.e., the scope in
// which it lives), try to give it as fine-grained an attribution as we possibly
// can.
function extractAttribution(
  attributionMap: AttributionMap,
  frameInfoMap: Map<string, FrameInfo>,
  scopeLighthouseAttributableURLs: Set<string>,
  task: TaskWithData<HasTaskId>
): Attribution {
  const taskId = task.metadata.taskId;

  // If the event has a stack trace, we can attribute it to a source location.
  const args = task.event.args ?? {};
  const data = args.data ?? {};
  const frame = data.frame ?? args.frame;
  const stackTrace = data.stackTrace ?? args.beginData?.stackTrace;
  if (stackTrace && stackTrace.length > 0) {
    log.debug(`Assigned source attribution to task ${taskId} from stack trace`);
    return attributionMap.create({
      kind: 'sourceLocation',
      ...stackTrace[0]
    });
  }

  // If the event data includes a source location, use that.
  const url = data.url ?? data.fileName;
  const lineNumber = data.lineNumber;
  const columnNumber = data.columnNumber;

  if (url && lineNumber !== undefined && columnNumber !== undefined) {
    log.debug(`Assigned source attribution to task ${taskId} from event data`);
    return attributionMap.create({
      kind: 'sourceLocation',
      url,
      functionName: data?.functionName,
      lineNumber,
      columnNumber
    });
  }

  // If the event data only includes a stack frame id, we might be able to give
  // it a source location if we have a location for that frame id.
  if (frame && frameInfoMap.has(frame)) {
    log.debug(
      `Assigned source attribution to task ${taskId} from stack frame ${frame}`
    );
    return attributionMap.create({
      kind: 'sourceLocation',
      ...frameInfoMap.get(frame)!
    });
  }

  // We're not going to be able to attribute this event to a precise source
  // location, but we can attribute it to a file if the event has a URL.
  if (url) {
    log.debug(`Assigned file attribution to task ${taskId} from event URL`);
    return attributionMap.create({
      kind: 'file',
      url
    });
  }

  // Some events have a filename instead of a URL; try that.
  if (args.fileName) {
    log.debug(`Assigned file attribution to task ${taskId} from event filename`);
    return attributionMap.create({
      kind: 'file',
      url: args.fileName
    });
  }

  // If the Lighthouse attribution is unambiguous, use that.
  if (task.attributableURLs.length === 1) {
    log.debug(
      `Assigned file attribution to task ${taskId} from unique ` +
      `Lighthouse attribution URL`
    );
    return attributionMap.create({
      kind: 'file',
      url: task.attributableURLs[0]
    });
  }

  // If the Lighthouse attribution is ambiguous, we might be able to
  // disambiguate if this event adds a new URL that didn't show up in the
  // attribution of any of its ancestors. We can assume that that new URL is
  // the "right" URL for this event.
  const newLighthouseAttributableURLs: string[] = [];
  for (const url of task.attributableURLs) {
    if (!scopeLighthouseAttributableURLs.has(url)) {
      newLighthouseAttributableURLs.push(url);
    }
  }

  if (newLighthouseAttributableURLs.length === 1) {
    log.debug(
      `Assigned file attribution to task ${taskId} from unique new ` +
      `Lighthouse attribution URL`
    );
    return attributionMap.create({
      kind: 'file',
      url: newLighthouseAttributableURLs[0]
    });
  }

  // We're out of heuristics. C'est la vie.
  log.debug(`Assigned unknown attribution to task ${taskId}`);
  return attributionMap.create({ kind: 'unknown' });
}

// Simplify the provided attribution if we can. We do this to get rid of source
// location attributions that are really only file-level attributions. That's
// desirable because we might be able to get a more accurate source location
// attribution another way - e.g., through the propagateAttributions pass - but
// we never replace source location attributions, so without this simplification
// we won't be able to take advantage of that.
function simplifyAttribution(
  attributionMap: AttributionMap,
  task: TaskWithData<HasTaskId>,
  attr: Attribution
): Attribution {
  if (
    attr.kind === 'sourceLocation' &&
    attr.lineNumber === 1 &&
    attr.columnNumber === 1
  ) {
    log.debug(
      `Simplified trivial source attribution to file attribution for ` +
      `task ${task.metadata.taskId}`
    );
    return attributionMap.create({
      kind: 'file',
      url: attr.url
    });
  }
  return attr;
}

// Figure out if this task has a different trigger than the containing scope. If
// so, use it; otherwise, propagate the containing scope's trigger.
function propagateTrigger(
  task: TaskWithData<HasAttributionInfo>,
  scopeTrigger: Trigger
): Trigger {
  const data = task.event.args?.data;
  if (data && task.event.cat === 'devtools.timeline') {
    const id = data?.type ?? data?.url;
    if (id) { return `${task.event.name} ${id}`; }
    return task.event.name;
  }
  if (['RunMicrotasks', 'v8.compile'].includes(task.event.name)) {
    return task.event.name;
  }
  return scopeTrigger;
}

function gatherAttributions(
  attributionMap: AttributionMap,
  frameInfoMap: Map<string, FrameInfo>,
  scopeTrigger: Trigger,
  scopeLighthouseAttributableURLs: Set<string>,
  tasks: TaskWithData<HasAttributionInfo & HasTaskId>[]
): void {
  for (const task of tasks) {
    // Assign an attribution.
    const taskAttribution = extractAttribution(
      attributionMap,
      frameInfoMap,
      scopeLighthouseAttributableURLs,
      task
    );
    task.metadata.attribution = simplifyAttribution(
      attributionMap,
      task,
      taskAttribution
    );

    // Assign an attribution context.
    task.metadata.context = {
      isAttributionRoot: false,
      lighthouseAttributableURLs: [...task.attributableURLs],
      triggers: [scopeTrigger]
    };

    const subtreeTrigger = propagateTrigger(task, scopeTrigger);
    log.debug(`Trigger for task ${task.metadata.taskId} subtree is ${subtreeTrigger}`);

    const subtreeLighthouseAttributableURLs = new Set<string>(
      scopeLighthouseAttributableURLs
    );
    for (const url of task.metadata.context.lighthouseAttributableURLs) {
      subtreeLighthouseAttributableURLs.add(url);
    }

    gatherAttributions(
      attributionMap,
      frameInfoMap,
      subtreeTrigger,
      subtreeLighthouseAttributableURLs,
      task.children
    );
  }
}

// A pass that uses various heuristics to try to assign attributions (i.e.,
// source locations) to tasks in the task graph.
export function assignAttributions<T extends TaskTrace<HasTaskId, HasFrameInfo>>(
  trace: T
): asserts trace is TaskTraceWithAddedData<
  T,
  HasAttributionInfo,
  HasAttributionMap
> {
  log.debug(`Starting assignAttributions pass.`);

  const traceWithAddedData =
    trace as TaskTraceWithAddedData<T, HasAttributionInfo, HasAttributionMap>;
  traceWithAddedData.metadata.attributionMap = new AttributionMap();

  gatherAttributions(
    traceWithAddedData.metadata.attributionMap,
    traceWithAddedData.metadata.frameInfo,
    'RunTask',
    new Set<string>(),
    traceWithAddedData.tasks
  );
}
