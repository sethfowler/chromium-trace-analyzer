import { TaskGroupIds } from 'tracium/lib/task-groups';

// A breakdown of the contributions of different kinds of tasks to the overall
// runtime attributed to some source location, file, or task.
export type Breakdown = {
  [kind in (TaskGroupIds | 'total')]: number
};

export type HasBreakdown = {
  breakdown: Breakdown;
};

export function createBreakdown(): Breakdown {
  return {
    parseHTML: 0,
    styleLayout: 0,
    paintCompositeRender: 0,
    scriptParseCompile: 0,
    scriptEvaluation: 0,
    garbageCollection: 0,
    other: 0,
    total: 0,
  };
}

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
  existing.total =
    operation(toMerge.total, existing.total);
}

export function sumOfBreakdowns(...breakdowns: Readonly<Breakdown>[]): Breakdown {
  const summedBreakdown = createBreakdown();

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
  const maxBreakdown = createBreakdown();

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
