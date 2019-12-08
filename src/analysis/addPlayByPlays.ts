import { Attribution, HasAttributionInfo } from '../attributions';
import { HasBreakdown, sumOfBreakdowns } from '../breakdowns';
import { log } from '../log';
import { HasPlayByPlay, PlayByPlay, PlayByPlayEntry } from '../playbyplays';
import {
  HasTaskId,
  TaskTrace,
  TaskTraceWithAddedData,
  TaskWithData
} from '../taskgraph';

function taskName(
  task: TaskWithData<HasAttributionInfo & HasPlayByPlay & HasTaskId>
): string {
  const data = task.event.args?.data;
  if (data && task.event.cat === 'devtools.timeline') {
    const id = data?.type ?? data?.url;
    if (id) { return `${task.event.name} ${id}`; }
  }
  return task.event.name;
}

function gatherPlayByPlays(
  tasks: TaskWithData<HasAttributionInfo & HasBreakdown & HasPlayByPlay & HasTaskId>[]
): PlayByPlay {
  const allSubtreeEntries: PlayByPlay = [];

  for (const task of tasks) {
    const taskEntry: PlayByPlayEntry = {
      name: taskName(task),
      attribution: task.metadata.attribution,
      breakdown: task.metadata.breakdown.selfOnly(),
      taskIds: [task.metadata.taskId]
    };

    const subtreeEntries = gatherPlayByPlays(task.children);

    task.metadata.playByPlay = [
      taskEntry,
      ...subtreeEntries
    ];

    allSubtreeEntries.push(...task.metadata.playByPlay);
  }

  return allSubtreeEntries;
}

type TaskCategory = 'event' | 'gc' | 'network' | 'rendering' | 'script' | 'task' | 'other';

function taskCategory(name: string): TaskCategory {
  switch (name.split(' ')[0]) {
    case 'EventDispatch':
      return 'event';

    case 'MajorGC':
    case 'MinorGC':
    case 'V8.GCFinalizeMC':
      return 'gc';

    case 'XHRReadyStateChange':
    case 'XHRLoad':
      return 'network';

    case 'ParseHTML':
    case 'UpdateLayoutTree':
      return 'rendering';

    case 'EvaluateScript':
    case 'FunctionCall':
    case 'RunMicrotasks':
    case 'v8.callFunction':
    case 'v8.compile':
    case 'V8.DeoptimizeCode':
    case 'V8.Execute':
    case 'V8.HandleInterrupts':
    case 'v8.newInstance':
    case 'V8.RunMicrotasks':
    case 'v8.run':
    case 'V8.ScriptCompiler':
    case 'V8.StackGuard':
      return 'script';

    case 'ScheduledAction::execute':
    case 'TimerFire':
      return 'task';

    default:
      return 'other';
  }
}

function mergeRun(
  runAttribution: Attribution,
  run: PlayByPlay
): PlayByPlayEntry {
  const taskIds = ([] as number[]).concat(...run.map(e => e.taskIds))

  const names = new Map<string, number>();
  for (const entry of run) {
    const existingCount = names.get(entry.name) ?? 0;
    names.set(entry.name, existingCount + 1);
  }

  const summarizedNames: string[] = [];
  for (const [name, count] of names.entries()) {
    if (count === 1) {
      summarizedNames.push(name);
    } else {
      summarizedNames.push(`${name} (x${count})`);
    }
  }

  const mergedBreakdown = sumOfBreakdowns(
    ...run.map(e => e.breakdown)
  );

  return {
    name: summarizedNames.join(', '),
    attribution: runAttribution,
    breakdown: mergedBreakdown,
    taskIds,
  };
}

function simplifyPlayByPlay(playByPlay: PlayByPlay): PlayByPlay {
  if (playByPlay.length < 2) {
    return playByPlay;
  }

  const simplified: PlayByPlay = [];
  let run: PlayByPlay = [];
  let runAttribution: Attribution | undefined;
  let runCategory: TaskCategory | undefined;
  for (const entry of playByPlay) {
    const entryCategory = taskCategory(entry.name);
    if (!runAttribution) {
      runAttribution = entry.attribution;
    }
    if (!runCategory) {
      runCategory = entryCategory;
    }
    if (
      runAttribution === entry.attribution &&
      runCategory === entryCategory
    ) {
      run.push(entry);
      continue;
    }

    simplified.push(mergeRun(runAttribution, run));

    run = [entry];
    runAttribution = entry.attribution;
    runCategory = entryCategory;
  }

  if (runAttribution && runCategory) {
    simplified.push(mergeRun(runAttribution, run));
  }

  return simplified;
}

function simplifyPlayByPlays(
  tasks: TaskWithData<HasAttributionInfo & HasPlayByPlay & HasTaskId>[]
): void {
  for (const task of tasks) {
    task.metadata.playByPlay = simplifyPlayByPlay(task.metadata.playByPlay);
    simplifyPlayByPlays(task.children);
  }
}

// A pass that adds play-by-plays for each task, summarizing what the task is
// doing in a linear format.
export function addPlayByPlays<
  T extends TaskTrace<HasAttributionInfo & HasBreakdown & HasTaskId, {}>
>(
  trace: T
): asserts trace is TaskTraceWithAddedData<T, HasPlayByPlay, {}> {
  log.debug(`Starting addPlayByPlays pass.`);

  const traceWithAddedData = trace as TaskTraceWithAddedData<T, HasPlayByPlay, {}>
  gatherPlayByPlays(traceWithAddedData.tasks);
  simplifyPlayByPlays(traceWithAddedData.tasks);
}
