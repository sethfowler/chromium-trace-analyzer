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

// Data about how the time associated with a particular attribution is being
// spent, and which tasks that data came from.
export type AttributionStatistics = {
  attribution: AttributionInfo;
  breakdown: Breakdown;
  taskIds: number[];
};

export type SummaryByAttribution = {
  byCumulativeDuration: AttributionStatistics[];
  byLongestInstanceDuration: AttributionStatistics[];
};

// Accumulate the statistics from a new task into an existing set of statistics.
function accumulateStatistics(
  stats: AttributionStatistics,
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
}

function gatherStatistics(
  cumulativeStatsMap: Map<string, AttributionStatistics>,
  longestDurationStatsMap: Map<string, AttributionStatistics>,
  tasks: TaskWithData<HasAttributionInfo & HasBreakdown & HasTaskId>[]
): void {
  for (const task of tasks) {
    // Gather statistics for all child tasks.
    gatherStatistics(
      cumulativeStatsMap,
      longestDurationStatsMap,
      task.children
    );

    // Only include attribution roots - i.e., entry points of a subtree
    // attributed to a particular source location - in the statistics. We need
    // to do this because each task's breakdown includes its entire subtree, so
    // if we accumulate the breakdowns from the subtree as well, we'll be
    // incorporating the same numbers into the statistics more than once and the
    // total will be too high.
    const info = task.metadata.attributionInfo;
    if (!info.isRoot) { continue; }

    const attrId = attributionId(info);
    const taskId = task.metadata.taskId;

    // Update the cumulative statistics for this task's attributed location. Note
    // that we need to deep clone the attribution information when initializing
    // the statistics for a task for the first time; accumulateStatistics() will
    // end up mutating those values, and we don't want those mutations to get
    // propagated to the task graph.
    const cumulativeStats = cumulativeStatsMap.get(attrId);
    if (!cumulativeStats) {
      cumulativeStatsMap.set(attrId, {
        attribution: cloneDeep(info),
        breakdown: cloneDeep(task.metadata.breakdown),
        taskIds: [taskId]
      });
    } else {
      accumulateStatistics(cumulativeStats, task);
    }

    // Update the longest instance for this task's attributed location.
    const longestDurationStats = longestDurationStatsMap.get(attrId);
    if (
      !longestDurationStats ||
      task.metadata.breakdown.total > longestDurationStats.breakdown.total
    ) {
      longestDurationStatsMap.set(attrId, {
        attribution: info,
        breakdown: task.metadata.breakdown,
        taskIds: [taskId]
      });
    }
  }
}

export function createSummaryByAttribution(
  trace: TaskTrace<HasAttributionInfo & HasBreakdown & HasTaskId, {}>,
  scriptUrlPattern?: string
): SummaryByAttribution {
  const cumulativeStatsMap = new Map<string, AttributionStatistics>();
  const longestDurationStatsMap = new Map<string, AttributionStatistics>();

  gatherStatistics(cumulativeStatsMap, longestDurationStatsMap, trace.tasks);

  // Sort the results from largest to smallest durations.
  let byCumulativeDuration = [...cumulativeStatsMap.values()]
    .sort((a, b) => b.breakdown.total - a.breakdown.total);
  let byLongestInstanceDuration = [...longestDurationStatsMap.values()]
    .sort((a, b) => b.breakdown.total - a.breakdown.total);

  // Filter the results by URL pattern if the caller requested it.
  if (scriptUrlPattern && scriptUrlPattern.includes('nope')) {
    byCumulativeDuration = byCumulativeDuration.filter(task =>
      isAttributedTo(task.attribution, scriptUrlPattern)
    );
    byLongestInstanceDuration = byLongestInstanceDuration.filter(task =>
      isAttributedTo(task.attribution, scriptUrlPattern)
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
  trace: TaskTrace<HasAttributionInfo & HasBreakdown & HasTaskId, {}>,
  scriptUrlPattern?: string
): Summary {
  log.debug(`Starting summarize pass.`);

  return {
    byAttribution: createSummaryByAttribution(trace, scriptUrlPattern),
    byTimelineBuckets: createSummaryByTimelineBuckets(trace)
  };
}
