import { TaskGroupIds } from 'tracium/lib/task-groups';
import { AttributionInfo, HasAttributionInfo, isAttributedTo } from './attribution';
import {
  HasTaskId,
  TaskTrace,
  TaskWithData
} from './taskgraph';

export type Breakdown = {
  [kind in TaskGroupIds]: number
};

function createBreakdown(): Breakdown {
  return {
    parseHTML: 0,
    styleLayout: 0,
    paintCompositeRender: 0,
    scriptParseCompile: 0,
    scriptEvaluation: 0,
    garbageCollection: 0,
    other: 0
  };
}

function breakdownTotal(breakdown: Breakdown): number {
  return breakdown.parseHTML +
    breakdown.styleLayout +
    breakdown.paintCompositeRender +
    breakdown.scriptParseCompile +
    breakdown.scriptEvaluation +
    breakdown.garbageCollection +
    breakdown.other
}

function mergeBreakdownInto(
  toMerge: Readonly<Breakdown>,
  existing: Breakdown,
  operation: (toMergeValue: number, existingValue: number) => number
): void {
  existing.parseHTML = operation(toMerge.parseHTML, existing.parseHTML);
  existing.styleLayout = operation(toMerge.styleLayout, existing.styleLayout);
  existing.paintCompositeRender = operation(toMerge.paintCompositeRender, existing.paintCompositeRender);
  existing.scriptParseCompile = operation(toMerge.scriptParseCompile, existing.scriptParseCompile);
  existing.scriptEvaluation = operation(toMerge.scriptEvaluation, existing.scriptEvaluation);
  existing.garbageCollection = operation(toMerge.garbageCollection, existing.garbageCollection);
  existing.other = operation(toMerge.other, existing.other);
}

export type AttributionAndDuration = {
  attribution: AttributionInfo;
  duration: number;
  breakdown: Breakdown;
  taskIds: number[];
};

export type SummaryByAttribution = {
  byCumulativeDuration: AttributionAndDuration[];
  byLongestInstanceDuration: AttributionAndDuration[];
};

function attributionId(info: AttributionInfo): string {
  switch (info.kind) {
    case 'source':
      return `${info.kind}#${info.url}#${info.columnNumber}#${info.lineNumber}`;

    case 'file':
      return `${info.kind}#${info.url}`;

    case 'unknown':
      return `${info.kind}`;

    default:
      const unknown: never = info;
      throw new Error(`Unexpected attribution kind: ${JSON.stringify(unknown)}`);
  }
}

function getOrCreateDurations(
  map: Map<string, AttributionAndDuration>,
  attributionId: string,
  taskId: number,
  info: AttributionInfo
): AttributionAndDuration {
  let durations = map.get(attributionId);
  if (!durations) {
    durations = {
      attribution: info,
      duration: 0,
      breakdown: createBreakdown(),
      taskIds: []
    };
    map.set(attributionId, durations);
  }

  for (const url of info.lighthouseAttributableURLs) {
    if (!durations.attribution.lighthouseAttributableURLs.includes(url)) {
      durations.attribution.lighthouseAttributableURLs.push(url);
    }
  }

  for (const trigger of info.triggers) {
    if (!durations.attribution.triggers.includes(trigger)) {
      durations.attribution.triggers.push(trigger);
    }
  }

  if (!durations.taskIds.includes(taskId)) {
    durations.taskIds.push(taskId);
  }

  return durations;
}

function gatherDurations(
  cumulativeDurationMap: Map<string, AttributionAndDuration>,
  longestDurationMap: Map<string, AttributionAndDuration>,
  tasks: TaskWithData<HasTaskId & HasAttributionInfo>[]
): Breakdown {
  const allSubtreesBreakdown = createBreakdown();

  for (const task of tasks) {
    const subtreeBreakdown = gatherDurations(
      cumulativeDurationMap,
      longestDurationMap,
      task.children
    );

    if (task.group.id in subtreeBreakdown) {
      subtreeBreakdown[task.group.id] = Math.max(
        task.duration - breakdownTotal(subtreeBreakdown),
        0
      );
    } else {
      console.warn(`Omitting unknown task group id '${task.group.id}' from breakdown`);
    }

    const subtreeDuration = breakdownTotal(subtreeBreakdown);

    const info = task.metadata.attributionInfo;
    const attrId = attributionId(info);
    const taskId = task.metadata.taskId;

    const cumulativeDurations =
      getOrCreateDurations(cumulativeDurationMap, attrId, taskId, info);
    cumulativeDurations.duration += subtreeDuration;
    mergeBreakdownInto(
      subtreeBreakdown,
      cumulativeDurations.breakdown,
      (toMerge, existing) => toMerge + existing
    );

    const longestDurations =
      getOrCreateDurations(longestDurationMap, attrId, taskId, info);
    if (subtreeDuration > longestDurations.duration) {
      longestDurations.duration = subtreeDuration;
      mergeBreakdownInto(
        subtreeBreakdown,
        longestDurations.breakdown,
        (toMerge, _existing) => toMerge
      );
    }

    mergeBreakdownInto(
      allSubtreesBreakdown,
      subtreeBreakdown,
      (existing, toMerge) => existing + toMerge
    );
  }

  return allSubtreesBreakdown;
}

export function createSummaryByAttribution(
  trace: TaskTrace<HasTaskId & HasAttributionInfo, {}>,
  scriptUrlPattern?: string
): SummaryByAttribution {
  const cumulativeDurationMap = new Map<string, AttributionAndDuration>();
  const longestDurationMap = new Map<string, AttributionAndDuration>();

  gatherDurations(cumulativeDurationMap, longestDurationMap, trace.tasks);

  // Sort the results from largest to smallest durations.
  let byCumulativeDuration = [...cumulativeDurationMap.values()]
    .sort((a, b) => b.duration - a.duration);
  let byLongestInstanceDuration = [...longestDurationMap.values()]
    .sort((a, b) => b.duration - a.duration);

  if (scriptUrlPattern) {
    byCumulativeDuration = byCumulativeDuration.filter(task =>
      isAttributedTo(scriptUrlPattern, task.attribution)
    );
    byLongestInstanceDuration = byLongestInstanceDuration.filter(task =>
      isAttributedTo(scriptUrlPattern, task.attribution)
    );
  }

  return { byCumulativeDuration, byLongestInstanceDuration };
}

export type SummaryByDurationBuckets = {
};

// TODO
export function createSummaryByDurationBuckets(
  _trace: TaskTrace<HasTaskId & HasAttributionInfo, {}>
): SummaryByDurationBuckets {
  return {};
}

export type SummaryByTimelineBuckets = {
};

// TODO
export function createSummaryByTimelineBuckets(
  _trace: TaskTrace<HasTaskId & HasAttributionInfo, {}>
): SummaryByTimelineBuckets {
  return {};
}

export type Summary = {
  byAttribution: SummaryByAttribution;
  byDurationBuckets: SummaryByDurationBuckets;
  byTimelineBuckets: SummaryByTimelineBuckets;
};

export function createSummary(
  trace: TaskTrace<HasTaskId & HasAttributionInfo, {}>,
  scriptUrlPattern?: string
): Summary {
  return {
    byAttribution: createSummaryByAttribution(trace, scriptUrlPattern),
    byDurationBuckets: createSummaryByDurationBuckets(trace),
    byTimelineBuckets: createSummaryByTimelineBuckets(trace)
  };
}
