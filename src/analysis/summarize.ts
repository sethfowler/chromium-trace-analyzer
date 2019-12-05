import { TaskGroupIds } from 'tracium/lib/task-groups';
import { AttributionInfo, HasAttributionInfo, isAttributedTo } from '../attributions';
import { log } from '../log';
import { HasTaskId, TaskTrace, TaskWithData } from '../taskgraph';

// A breakdown of the contributions of different kinds of tasks to the overall
// runtime attributed to some source location or file.
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

// Merge the totals from one breakdown into another using the provided
// operation.
function mergeBreakdownInto(
  toMerge: Readonly<Breakdown>,
  existing: Breakdown,
  operation: (toMergeValue: number, existingValue: number) => number
): void {
  existing.parseHTML =
    operation(toMerge.parseHTML, existing.parseHTML);
  existing.styleLayout =
    operation(toMerge.styleLayout, existing.styleLayout);
  existing.paintCompositeRender =
    operation(toMerge.paintCompositeRender, existing.paintCompositeRender);
  existing.scriptParseCompile =
    operation(toMerge.scriptParseCompile, existing.scriptParseCompile);
  existing.scriptEvaluation =
    operation(toMerge.scriptEvaluation, existing.scriptEvaluation);
  existing.garbageCollection =
    operation(toMerge.garbageCollection, existing.garbageCollection);
  existing.other =
    operation(toMerge.other, existing.other);
}

// Data about how much the time associated with a particular attribution is
// being spent.
export type AttributionStatistics = {
  attribution: AttributionInfo;
  duration: number;
  breakdown: Breakdown;
  taskIds: number[];
};

export type SummaryByAttribution = {
  byCumulativeDuration: AttributionStatistics[];
  byLongestInstanceDuration: AttributionStatistics[];
};

// A string id for an attribution, used as a map key.
function attributionId(info: AttributionInfo): string {
  switch (info.kind) {
    case 'sourceLocation':
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

// Create attribution statistics for the given attribution, or if we already
// have them, merge information about this new instance of the attribution into
// them.
function createOrMergeStatistics(
  map: Map<string, AttributionStatistics>,
  attributionId: string,
  taskId: number,
  info: AttributionInfo
): AttributionStatistics {
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

function gatherStatistics(
  cumulativeDurationMap: Map<string, AttributionStatistics>,
  longestDurationMap: Map<string, AttributionStatistics>,
  tasks: TaskWithData<HasTaskId & HasAttributionInfo>[]
): Breakdown {
  const allSubtreesBreakdown = createBreakdown();

  for (const task of tasks) {
    // Gather statistics for all child tasks and a breakdown of where the child
    // tasks are spending their time.
    const subtreeBreakdown = gatherStatistics(
      cumulativeDurationMap,
      longestDurationMap,
      task.children
    );

    if (task.group.id in subtreeBreakdown) {
      // We consider this task's contribution to the breakdown to be the portion
      // of its duration that was not explained by child tasks. In other words,
      // this is 'self' time.
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

    // Update the cumulative duration for this task's attributed location.
    const cumulativeDurations =
      createOrMergeStatistics(cumulativeDurationMap, attrId, taskId, info);
    cumulativeDurations.duration += subtreeDuration;
    mergeBreakdownInto(
      subtreeBreakdown,
      cumulativeDurations.breakdown,
      (toMerge, existing) => toMerge + existing
    );

    // Update the longest instance for this task's attributed location.
    const longestDurations =
      createOrMergeStatistics(longestDurationMap, attrId, taskId, info);
    if (subtreeDuration > longestDurations.duration) {
      longestDurations.duration = subtreeDuration;
      mergeBreakdownInto(
        subtreeBreakdown,
        longestDurations.breakdown,
        (toMerge, _existing) => toMerge
      );
    }

    // Add this task's breakdown to the breakdown for all subtrees at this
    // level; this will end up making up the parent task's "other" time.
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
  const cumulativeDurationMap = new Map<string, AttributionStatistics>();
  const longestDurationMap = new Map<string, AttributionStatistics>();

  gatherStatistics(cumulativeDurationMap, longestDurationMap, trace.tasks);

  // Sort the results from largest to smallest durations.
  let byCumulativeDuration = [...cumulativeDurationMap.values()]
    .sort((a, b) => b.duration - a.duration);
  let byLongestInstanceDuration = [...longestDurationMap.values()]
    .sort((a, b) => b.duration - a.duration);

  // Filter the results by URL pattern if the caller requested it.
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

export type SummaryByTimelineBuckets = {
};

// TODO: It might be interesting to provide statistics for bucketed chunks of
// the timeline so we could distinguish between things that take a lot of time
// during initialization and things that take a lot of time during the steady
// state.
export function createSummaryByTimelineBuckets(
  _trace: TaskTrace<HasTaskId & HasAttributionInfo, {}>
): SummaryByTimelineBuckets {
  return {};
}

export type Summary = {
  byAttribution: SummaryByAttribution;
  byTimelineBuckets: SummaryByTimelineBuckets;
};

export function summarize(
  trace: TaskTrace<HasTaskId & HasAttributionInfo, {}>,
  scriptUrlPattern?: string
): Summary {
  log.debug(`Starting summarize pass.`);

  return {
    byAttribution: createSummaryByAttribution(trace, scriptUrlPattern),
    byTimelineBuckets: createSummaryByTimelineBuckets(trace)
  };
}
