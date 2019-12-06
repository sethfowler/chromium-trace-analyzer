import cloneDeep from 'clone-deep';

import {
  attributionId,
  AttributionInfo,
  HasAttributionInfo,
  isAttributedTo
} from '../attributions';
import {
  Breakdown,
  HasBreakdown,
  sumOfBreakdowns
} from '../breakdowns';
import { log } from '../log';
import { HasTaskId, TaskTrace, TaskWithData } from '../taskgraph';

type DescendantBreakdown = {
  attribution: Readonly<AttributionInfo>;
  breakdown: Breakdown;
};

// Data about how the time associated with a particular attribution is being
// spent, and which tasks that data came from.
export type AttributionStatistics = {
  // The source location these statistics are for. This may be a merged version
  // of the attribution from multiple tasks.
  attribution: Readonly<AttributionInfo>;

  // A breakdown of how the time associated with the source location is being
  // spent.
  breakdown: Breakdown;

  // Breakdowns for descendant tasks.
  // TODO: Compute these in a separate pass.
  descendantBreakdowns: Map<string, DescendantBreakdown>;

  // The tasks that contributed to the breakdown.
  taskIds: number[];

  // If present, the time that the associated task started. (This won't be
  // present for cumulative statistics, since it doesn't make sense in that
  // context.)
  startTime?: number;

  // If present, the longest single instance that contributed to these
  // statistics.
  longestInstance?: AttributionStatistics;
};

// Accumulate the statistics from a new task into an existing set of statistics.
function accumulateStatistics(
  stats: AttributionStatistics,
  descendantBreakdowns: Map<string, DescendantBreakdown>,
  task: TaskWithData<HasAttributionInfo & HasBreakdown & HasTaskId>
): void {
  stats.breakdown = sumOfBreakdowns(
    stats.breakdown,
    task.metadata.breakdown
  );

  const info = task.metadata.attributionInfo;

  for (const url of info.lighthouseAttributableURLs) {
    if (!stats.attribution.lighthouseAttributableURLs.includes(url)) {
      stats.attribution.lighthouseAttributableURLs.push(url);
    }
  }

  for (const trigger of info.triggers) {
    if (!stats.attribution.triggers.includes(trigger)) {
      stats.attribution.triggers.push(trigger);
    }
  }

  if (!stats.taskIds.includes(task.metadata.taskId)) {
    stats.taskIds.push(task.metadata.taskId);
  }

  for (const [attrId, breakdown] of descendantBreakdowns.entries()) {
    mergeDescendantBreakdowns(stats.descendantBreakdowns, attrId, breakdown);
  }
}

function mergeDescendantBreakdowns(
  descendantBreakdowns: Map<string, DescendantBreakdown>,
  toMergeAttrId: string,
  toMerge: DescendantBreakdown
): void {
  const existing = descendantBreakdowns.get(toMergeAttrId);
  if (existing) {
    existing.breakdown = sumOfBreakdowns(
      existing.breakdown,
      toMerge.breakdown
    );
    return;
  }

  descendantBreakdowns.set(toMergeAttrId, toMerge);
}

function gatherStatistics(
  cumulativeStatsMap: Map<string, AttributionStatistics>,
  longestDurationStatsMap: Map<string, AttributionStatistics>,
  taskStatsMap: Map<number, AttributionStatistics>,
  tasks: TaskWithData<HasAttributionInfo & HasBreakdown & HasTaskId>[]
): Map<string, DescendantBreakdown> {
  const descendantBreakdowns = new Map<string, DescendantBreakdown>();

  for (const task of tasks) {
    // Gather statistics for all child tasks.
    const descendantBreakdownsForTask = gatherStatistics(
      cumulativeStatsMap,
      longestDurationStatsMap,
      taskStatsMap,
      task.children
    );

    const info = task.metadata.attributionInfo;
    const attrId = attributionId(info);
    const taskId = task.metadata.taskId;

    // Propagate descendant attributions up the tree.
    if (info.isRoot) {
      mergeDescendantBreakdowns(descendantBreakdowns, attrId, {
        attribution: cloneDeep(info),
        breakdown: cloneDeep(task.metadata.breakdown)
      });
    }
    for (const [attrId, breakdown] of descendantBreakdownsForTask.entries()) {
      mergeDescendantBreakdowns(
        descendantBreakdowns,
        attrId,
        cloneDeep(breakdown)
      );
    }

    // Only include attribution roots - i.e., entry points of a subtree
    // attributed to a particular source location - in the statistics. We need
    // to do this because each task's breakdown includes its entire subtree, so
    // if we accumulate the breakdowns from the subtree as well, we'll be
    // incorporating the same numbers into the statistics more than once and the
    // total will be too high.
    if (!info.isRoot) { continue; }

    // Update the cumulative statistics for this task's attributed location. Note
    // that we need to deep clone the attribution information when initializing
    // the statistics for a task for the first time; accumulateStatistics() will
    // end up mutating those values, and we don't want those mutations to get
    // propagated to the task graph.
    const cumulativeStats = cumulativeStatsMap.get(attrId);
    if (!cumulativeStats) {
      cumulativeStatsMap.set(attrId, {
        attribution: cloneDeep(info),
        descendantBreakdowns: cloneDeep(descendantBreakdownsForTask),
        breakdown: cloneDeep(task.metadata.breakdown),
        taskIds: [taskId]
      });
    } else {
      accumulateStatistics(
        cumulativeStats,
        descendantBreakdownsForTask,
        task
      );
    }

    // Update the longest instance for this task's attributed location.
    const longestDurationStats = longestDurationStatsMap.get(attrId);
    if (
      !longestDurationStats ||
      task.metadata.breakdown.total > longestDurationStats.breakdown.total
    ) {
      longestDurationStatsMap.set(attrId, {
        attribution: info,
        descendantBreakdowns: descendantBreakdownsForTask,
        breakdown: task.metadata.breakdown,
        startTime: task.startTime,
        taskIds: [taskId]
      });
    }

    // Record the per-task statistics.
    taskStatsMap.set(taskId, {
      attribution: info,
      descendantBreakdowns: descendantBreakdownsForTask,
      breakdown: task.metadata.breakdown,
      startTime: task.startTime,
      taskIds: [taskId]
    });
  }

  return descendantBreakdowns;
}

export type Summary = {
  byAttribution: {
    byCumulativeDuration: AttributionStatistics[];
    byLongestInstanceDuration: AttributionStatistics[];
  };
  byTaskDuration: AttributionStatistics[];

  // TODO: It might be interesting to provide statistics for bucketed chunks of
  // the timeline so we could distinguish between things that take a lot of time
  // during initialization and things that take a lot of time during the steady
  // state.
  byTimelineBuckets: [];
};

export function createSummary(
  trace: TaskTrace<HasAttributionInfo & HasBreakdown & HasTaskId, {}>,
  scriptUrlPattern?: string
): Summary {
  // Statistics that we track per-source-location. The key is an identifier that
  // maps to a particular source location (or attribution, at least).
  const cumulativeStatsMap = new Map<string, AttributionStatistics>();
  const longestDurationStatsMap = new Map<string, AttributionStatistics>();

  // Per-task statistics. The key is a task id.
  const taskStatsMap = new Map<number, AttributionStatistics>();

  gatherStatistics(
    cumulativeStatsMap,
    longestDurationStatsMap,
    taskStatsMap,
    trace.tasks
  );

  // Attach longest instances to the cumulative statistics.
  for (const [attrId, stats] of cumulativeStatsMap.entries()) {
    const longestDurationStats = longestDurationStatsMap.get(attrId);
    if (longestDurationStats) {
      stats.longestInstance = longestDurationStats;
    }
  }

  // Sort the results from largest to smallest durations.
  let byCumulativeDuration = [...cumulativeStatsMap.values()]
    .sort((a, b) => b.breakdown.total - a.breakdown.total);
  let byLongestInstanceDuration = [...longestDurationStatsMap.values()]
    .sort((a, b) => b.breakdown.total - a.breakdown.total);
  let byTaskDuration = [...taskStatsMap.values()]
    .sort((a, b) => b.breakdown.total - a.breakdown.total);

  // Filter the results by URL pattern if the caller requested it.
  if (scriptUrlPattern) {
    byCumulativeDuration = byCumulativeDuration.filter(task =>
      isAttributedTo(task.attribution, scriptUrlPattern)
    );
    byLongestInstanceDuration = byLongestInstanceDuration.filter(task =>
      isAttributedTo(task.attribution, scriptUrlPattern)
    );
    byTaskDuration = byTaskDuration.filter(task =>
      isAttributedTo(task.attribution, scriptUrlPattern)
    );
  }

  return {
    byAttribution: {
      byCumulativeDuration,
      byLongestInstanceDuration,
    },
    byTaskDuration,
    byTimelineBuckets: [],
  };
}

export function summarize(
  trace: TaskTrace<HasAttributionInfo & HasBreakdown & HasTaskId, {}>,
  scriptUrlPattern?: string
): Summary {
  log.debug(`Starting summarize pass.`);
  return createSummary(trace, scriptUrlPattern);
}
