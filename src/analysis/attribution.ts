import {
  TaskNode,
  TaskTrace,
  TaskTraceWithAddedData,
  TaskWithData
} from './taskgraph';
import { FrameInfo, HasFrameInfo } from './frames';

export type Trigger = string;

export type BaseAttribution = {
  lighthouseAttributableURLs: string[];
  triggers: Trigger[];
};

export type UnknownAttribution = {
  kind: 'unknown';
} & BaseAttribution;

export type FileAttribution = {
  kind: 'file';
  url: string;
} & BaseAttribution;

export type SourceAttribution = {
  kind: 'source';
  generated?: FrameInfo;
  sourceLine?: string;
} & FrameInfo & BaseAttribution;

export type AttributionInfo =
  UnknownAttribution |
  FileAttribution |
  SourceAttribution;

export type HasAttributionInfo = {
  attributionInfo: AttributionInfo;
};

function extractAttribution(
  frameInfoMap: Map<string, FrameInfo>,
  triggers: Trigger[],
  task: TaskNode
): AttributionInfo {
  const lighthouseAttributableURLs = [...task.attributableURLs];

  const args = task.event.args ?? {};
  const data = args.data ?? {};
  const frame = data.frame ?? args.frame;
  const stackTrace = data.stackTrace ?? args.beginData?.stackTrace;
  if (stackTrace && stackTrace.length > 0) {
    return {
      kind: 'source',
      lighthouseAttributableURLs,
      triggers,
      ...stackTrace[0]
    };
  }

  const url = data.url ?? data.fileName;
  const lineNumber = data.lineNumber;
  const columnNumber = data.columnNumber;

  if (url && lineNumber !== undefined && columnNumber !== undefined) {
    return {
      kind: 'source',
      lighthouseAttributableURLs,
      triggers,
      url,
      functionName: data?.functionName,
      lineNumber,
      columnNumber
    };
  }

  if (frame && frameInfoMap.has(frame)) {
    return {
      kind: 'source',
      lighthouseAttributableURLs,
      triggers,
      ...frameInfoMap.get(frame)!
    };
  }

  if (url) {
    return {
      kind: 'file',
      lighthouseAttributableURLs,
      triggers,
      url
    };
  }

  if (args.fileName) {
    return {
      kind: 'file',
      lighthouseAttributableURLs,
      triggers,
      url: args.fileName
    }
  }

  if (lighthouseAttributableURLs.length === 1) {
    return {
      kind: 'file',
      lighthouseAttributableURLs,
      triggers,
      url: lighthouseAttributableURLs[0]
    };
  }

  return {
    kind: 'unknown',
    lighthouseAttributableURLs,
    triggers
  };
}

function simplifyAttribution(info: AttributionInfo): AttributionInfo {
  if (
    info.kind === 'source' &&
    info.lineNumber === 1 &&
    info.columnNumber === 1) {
    return {
      kind: 'file',
      lighthouseAttributableURLs: info.lighthouseAttributableURLs,
      triggers: info.triggers,
      url: info.url
    };
  }
  return info;
}

function propagateScopeAttribution(
  taskAttribution: AttributionInfo,
  scopeAttribution?: AttributionInfo
): AttributionInfo {
  if (!scopeAttribution) {
    return taskAttribution;  // Nothing to propagate.
  }

  switch (taskAttribution.kind) {
    case 'source':
      // The task attribution we have is high quality.
      return taskAttribution;

    case 'file':
      if (scopeAttribution.kind !== 'source') {
        // The scope attribution is no better.
        return taskAttribution;
      }

      if (taskAttribution.url !== scopeAttribution.url) {
        // The scope attribution is for a different script.
        return taskAttribution;
      }

      break;

    case 'unknown':
      if (scopeAttribution.kind === 'unknown') {
        // The scope attribution is no better.
        return taskAttribution;
      }

      break;

    default:
      const unknown: never = taskAttribution;
      throw new Error(`Unexpected attribution kind: ${JSON.stringify(unknown)}`);
  }

  // The scope provides a more precise attribution. We'll use that, but keep
  // around Lighthouse's opinion of this specific task's attribution.
  return {
    ...scopeAttribution,
    lighthouseAttributableURLs: taskAttribution.lighthouseAttributableURLs,
    triggers: taskAttribution.triggers
  };
}

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
  frameInfoMap: Map<string, FrameInfo>,
  scopeTrigger: Trigger,
  tasks: TaskWithData<HasAttributionInfo>[],
  scopeAttribution?: AttributionInfo
): void {
  for (const task of tasks) {
    const taskAttribution = simplifyAttribution(extractAttribution(
      frameInfoMap,
      [scopeTrigger],
      task
    ));
    const finalAttribution = propagateScopeAttribution(
      taskAttribution,
      scopeAttribution
    );
    task.metadata.attributionInfo = finalAttribution;

    const subtreeTrigger = propagateTrigger(task, scopeTrigger);

    gatherAttributions(
      frameInfoMap,
      subtreeTrigger,
      task.children,
      finalAttribution
    );

    if (task.children.length === 1) {
      const upwardsAttribution = propagateScopeAttribution(
        finalAttribution,
        task.children[0].metadata.attributionInfo
      );
      task.metadata.attributionInfo = upwardsAttribution;
    }
  }
}

function floodAttributions(
  tasks: TaskWithData<HasAttributionInfo>[],
  scopeAttribution?: AttributionInfo
): void {
  // Repropagate the scope attribution, since it may have changed.
  for (const task of tasks) {
    const attrInfo = task.metadata.attributionInfo;
    const updatedInfo = propagateScopeAttribution(attrInfo, scopeAttribution);
    task.metadata.attributionInfo = updatedInfo;
  }

  // Locate the first attribution with a source location.
  let lastSourceAttrInfo: AttributionInfo | undefined;
  for (const task of tasks) {
    const attrInfo = task.metadata.attributionInfo;
    if (attrInfo.kind === 'source') {
      lastSourceAttrInfo = attrInfo;
      break;
    }
  }

  // Walk over every task and try to propagate the most recent source location
  // to it. For tasks before the first source location, we propagate backwards.
  // (That's why we find the first source location above.)
  for (const task of tasks) {
    const attrInfo = task.metadata.attributionInfo;
    if (attrInfo.kind === 'source') {
      lastSourceAttrInfo = attrInfo;
      continue;
    }
    if (lastSourceAttrInfo && attrInfo.kind === 'file') {
      const updatedInfo = propagateScopeAttribution(attrInfo, lastSourceAttrInfo);
      task.metadata.attributionInfo = updatedInfo;
    }
  }

  // Propagate to child tasks.
  for (const task of tasks) {
    floodAttributions(task.children, task.metadata.attributionInfo);
  }
}

export function refineAttributions<T extends TaskTrace<{}, HasFrameInfo>>(
  trace: T
): asserts trace is TaskTraceWithAddedData<T, HasAttributionInfo, {}> {
  const traceWithAddedData =
    trace as TaskTraceWithAddedData<T, HasAttributionInfo, {}>;
  gatherAttributions(
    traceWithAddedData.metadata.frameInfo,
    'RunTask',
    traceWithAddedData.tasks
  );
  floodAttributions(traceWithAddedData.tasks);
}

export function isAttributedTo(
  scriptUrlPattern: string,
  info: AttributionInfo
): boolean {
  if (info.kind === 'source') {
    if (info.url.includes(scriptUrlPattern)) { return true; }
    const generatedUrl = info.generated?.url;
    if (generatedUrl && generatedUrl.includes(scriptUrlPattern)) { return true; }
  }

  if (info.kind === 'file') {
    if (info.url.includes(scriptUrlPattern)) { return true; }
  }

  for (const url of info.lighthouseAttributableURLs) {
    if (url.includes(scriptUrlPattern)) { return true; }
  }

  return false;
}
