import cloneDeep from 'clone-deep';

import {
  Attribution,
  AttributionContext,
  HasAttributionInfo,
  isAttributedTo
} from '../attributions';
import {
  Breakdown,
  HasBreakdown,
  mergeBreakdownsByAttribution,
  sumOfBreakdowns
} from '../breakdowns';
import { log } from '../log';
import { HasPlayByPlay, PlayByPlay } from '../playbyplays';
import { HasTaskId, TaskTrace, TaskWithData } from '../taskgraph';

// Data about how the time associated with a particular attribution is being
// spent, and which tasks that data came from.
export type AttributionStatistics = {
  // The source location these statistics are for.
  attribution: Attribution;
  context: AttributionContext;

  // A breakdown of how the time associated with the source location is being
  // spent.
  breakdown: Breakdown;

  // Breakdowns for descendant tasks.
  breakdownsByAttribution: Map<Attribution, Breakdown>;

  // The tasks that contributed to the breakdown.
  taskIds: number[];

  // If present, the play-by-play for the associated task. (This won't be
  // present for cumulative statistics, since it doesn't make sense in that
  // context.)
  playByPlay?: PlayByPlay;

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
  task: TaskWithData<HasAttributionInfo & HasBreakdown & HasTaskId>
): void {
  stats.breakdown = sumOfBreakdowns(
    stats.breakdown,
    task.metadata.breakdown
  );

  const taskContext = task.metadata.context;

  for (const url of taskContext.lighthouseAttributableURLs) {
    if (!stats.context.lighthouseAttributableURLs.includes(url)) {
      stats.context.lighthouseAttributableURLs.push(url);
    }
  }

  for (const trigger of taskContext.triggers) {
    if (!stats.context.triggers.includes(trigger)) {
      stats.context.triggers.push(trigger);
    }
  }

  if (!stats.taskIds.includes(task.metadata.taskId)) {
    stats.taskIds.push(task.metadata.taskId);
  }

  mergeBreakdownsByAttribution(
    stats.breakdownsByAttribution,
    task.metadata.breakdownsByAttribution
  );
}

function gatherStatistics(
  cumulativeStatsMap: Map<Attribution, AttributionStatistics>,
  longestDurationStatsMap: Map<Attribution, AttributionStatistics>,
  taskStatsMap: Map<number, AttributionStatistics>,
  tasks: TaskWithData<HasAttributionInfo & HasBreakdown & HasPlayByPlay & HasTaskId>[]
): void {
  for (const task of tasks) {
    // Gather statistics for all child tasks.
    gatherStatistics(
      cumulativeStatsMap,
      longestDurationStatsMap,
      taskStatsMap,
      task.children
    );

    const attribution = task.metadata.attribution;
    const context = task.metadata.context;
    const taskId = task.metadata.taskId;

    // If this isn't an attribution root, skip it. This cuts down on the amount
    // of data we generate. (And it's require for correctness for the cumulative
    // statistics; see below.)
    if (!context.isAttributionRoot) { continue; }

    // Update the cumulative statistics for this task's attributed location.
    //
    // Note that unlike for other kinds of statistics, correctness requires that
    // we only include attribution roots - i.e., entry points of a subtree
    // attributed to a particular source location - in the cumulative
    // statistics. We need to do this because each task's breakdown includes its
    // entire subtree, so if we accumulate the breakdowns from the subtree as
    // well, we'll be incorporating the same numbers into the statistics more
    // than once and the total will be too high.
    //
    // Note also that deep cloning is needed here since we mutate some of these
    // data structures in accumulateStatistics().
    const cumulativeStats = cumulativeStatsMap.get(attribution);
    if (!cumulativeStats) {
      cumulativeStatsMap.set(attribution, {
        attribution,
        context: cloneDeep(context),
        breakdownsByAttribution: cloneDeep(task.metadata.breakdownsByAttribution),
        breakdown: cloneDeep(task.metadata.breakdown),
        taskIds: [taskId]
      });
    } else {
      accumulateStatistics(cumulativeStats, task);
    }

    // Update the longest instance for this task's attributed location.
    const longestDurationStats = longestDurationStatsMap.get(attribution);
    if (
      !longestDurationStats ||
      task.metadata.breakdown.total > longestDurationStats.breakdown.total
    ) {
      longestDurationStatsMap.set(attribution, {
        attribution,
        context,
        breakdownsByAttribution: task.metadata.breakdownsByAttribution,
        breakdown: task.metadata.breakdown,
        playByPlay: task.metadata.playByPlay,
        startTime: task.startTime,
        taskIds: [taskId]
      });
    }

    // Record the per-task statistics.
    taskStatsMap.set(taskId, {
      attribution,
      context,
      breakdownsByAttribution: task.metadata.breakdownsByAttribution,
      breakdown: task.metadata.breakdown,
      playByPlay: task.metadata.playByPlay,
      startTime: task.startTime,
      taskIds: [taskId]
    });
  }
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

export type SummaryOptions = {
  // If present, filter out results not attributed to this script URL.
  scriptUrlPattern?: string;

  // If present, only include top level tasks in the summary.
  topLevelOnly?: boolean;
};

export function createSummary(
  trace: TaskTrace<HasAttributionInfo & HasBreakdown & HasPlayByPlay & HasTaskId, {}>,
  options: SummaryOptions
): Summary {
  // Statistics that we track per-source-location.
  const cumulativeStatsMap = new Map<Attribution, AttributionStatistics>();
  const longestDurationStatsMap = new Map<Attribution, AttributionStatistics>();

  // Per-task statistics. The key is a task id.
  const taskStatsMap = new Map<number, AttributionStatistics>();

  gatherStatistics(
    cumulativeStatsMap,
    longestDurationStatsMap,
    taskStatsMap,
    trace.tasks
  );

  // Attach longest instances to the cumulative statistics.
  for (const [attr, stats] of cumulativeStatsMap.entries()) {
    const longestDurationStats = longestDurationStatsMap.get(attr);
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

  // Filter the results if the caller requested it.
  if (options.scriptUrlPattern || options.topLevelOnly) {
    const filterStats = (stats: AttributionStatistics): boolean => {
      if (
        options.scriptUrlPattern &&
        !isAttributedTo(stats.attribution, stats.context, options.scriptUrlPattern)
      ) {
        return false;
      }
      if (options.topLevelOnly && !stats.context.isTopLevel) {
        return false;
      }
      return true;
    };

    byCumulativeDuration = byCumulativeDuration.filter(filterStats);
    byLongestInstanceDuration = byLongestInstanceDuration.filter(filterStats);
    byTaskDuration = byTaskDuration.filter(filterStats);
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
  trace: TaskTrace<HasAttributionInfo & HasBreakdown & HasPlayByPlay & HasTaskId, {}>,
  options: SummaryOptions
): Summary {
  log.debug(`Starting summarize pass.`);
  return createSummary(trace, options);
}
