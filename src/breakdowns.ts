import { TaskGroupIds } from 'tracium/lib/task-groups';

import { Attribution } from './attributions';
import { log } from './log';

type BreakdownOfTaskKinds = {
  [kind in TaskGroupIds]: number
};

// A breakdown of the contributions of different kinds of tasks to the overall
// runtime attributed to some source location, file, or task.
export class Breakdown implements BreakdownOfTaskKinds {
  parseHTML: number = 0;
  styleLayout: number = 0;
  paintCompositeRender: number = 0;
  scriptParseCompile: number = 0;
  scriptEvaluation: number = 0;
  garbageCollection: number = 0;
  other: number = 0;

  self: number = 0;
  selfKind: TaskGroupIds = 'other';

  get total(): number {
    return this.parseHTML +
      this.styleLayout +
      this.paintCompositeRender +
      this.scriptParseCompile +
      this.scriptEvaluation +
      this.garbageCollection +
      this.other;
  }

  entries(): IterableIterator<[TaskGroupIds, number]> {
    return new Map<TaskGroupIds, number>([
      ['parseHTML', this.parseHTML],
      ['styleLayout', this.styleLayout],
      ['paintCompositeRender', this.paintCompositeRender],
      ['scriptParseCompile', this.scriptParseCompile],
      ['scriptEvaluation', this.scriptEvaluation],
      ['garbageCollection', this.garbageCollection],
      ['other', this.other],
    ]).entries();
  }

  addSelfTime(selfTime: number, kind: TaskGroupIds): void {
    if (this.self !== 0) {
      log.warn('Adding self time to a breakdown that already has self time');
    }

    this.self += Math.max(selfTime, 0);
    this.selfKind = kind;
    this[kind] += this.self;
  }

  selfOnly(): Breakdown {
    const selfOnlyBreakdown = new Breakdown();
    selfOnlyBreakdown[this.selfKind] = this.self;
    return selfOnlyBreakdown;
  }

  toJSON(): object {
    return {
      parseHTML: this.parseHTML,
      styleLayout: this.styleLayout,
      paintCompositeRender: this.paintCompositeRender,
      scriptParseCompile: this.scriptParseCompile,
      scriptEvaluation: this.scriptEvaluation,
      garbageCollection: this.garbageCollection,
      other: this.other,
      self: this.self,
      total: this.total,
    };
  }
}

export type HasBreakdown = {
  breakdown: Breakdown;
  breakdownsByAttribution: Map<Attribution, Breakdown>;
};

export type HasGlobalBreakdown = {
  globalBreakdown: Breakdown;
  globalBreakdownsByAttribution: Map<Attribution, Breakdown>;
};

// Merge the totals from one breakdown into another using the provided
// operation.
export function mergeBreakdownInto(
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

export function sumOfBreakdowns(...breakdowns: Readonly<Breakdown>[]): Breakdown {
  const summedBreakdown = new Breakdown()

  for (const breakdown of breakdowns) {
    mergeBreakdownInto(
      breakdown,
      summedBreakdown,
      (toMerge, existing) => toMerge + existing
    );
  }

  return summedBreakdown;
}

export function maxOfBreakdowns(...breakdowns: Readonly<Breakdown>[]): Breakdown {
  const maxBreakdown = new Breakdown();

  for (const breakdown of breakdowns) {
    mergeBreakdownInto(
      breakdown,
      maxBreakdown,
      (toMerge, existing) => {
        if (breakdown.total > maxBreakdown.total) {
          return toMerge;
        } else {
          return existing;
        }
      }
    );
  }

  return maxBreakdown;
}

export function updateBreakdownForAttribution(
  breakdowns: Map<Attribution, Breakdown>,
  attribution: Attribution,
  toMerge: Breakdown
): void {
  let breakdownForThisAttribution = breakdowns.get(attribution);
  if (!breakdownForThisAttribution) {
    breakdownForThisAttribution = toMerge;
  } else {
    breakdownForThisAttribution = sumOfBreakdowns(
      breakdownForThisAttribution,
      toMerge
    );
  }
  breakdowns.set(attribution, breakdownForThisAttribution);
}

export function mergeBreakdownsByAttribution(
  breakdowns: Map<Attribution, Breakdown>,
  toMerge: Map<Attribution, Breakdown>
): void {
  for (const [attribution, breakdownToMerge] of toMerge) {
    updateBreakdownForAttribution(
      breakdowns,
      attribution,
      breakdownToMerge
    );
  }
}
