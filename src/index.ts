import 'colors';

import { isAttributedTo, refineAttributions } from './analysis/attribution';
import { filterTasks, TaskFilterResult } from './analysis/filter';
import { inferFrameSourceLocations } from './analysis/frames';
import { applySourceMapToAttributions } from './analysis/sourcemap';
import { createSummary } from './analysis/summarize';
import { computeMainThreadTasks } from './analysis/taskgraph';
import { readFileAsJson } from './util';

function filterParentValues(key: string, value: string): string | null {
  if (key === 'parent') { return null; }
  return value;
}

export async function main() {
  const traceFileName = process.argv[2];
  if (!traceFileName) {
    console.error(`Usage: chromium-trace-analyzer fileToAnalyze.trace.json`);
    process.exit(1);
  }

  console.log(`Reading trace file: ${traceFileName}`.green);
  const traceJson = await readFileAsJson(traceFileName);

  console.log(`Refining...`.green);
  const trace = await computeMainThreadTasks(traceJson);
  inferFrameSourceLocations(trace);
  refineAttributions(trace);

  const sourceMapJson = await readFileAsJson('/Users/sethf/Code/mn-quick-fixes/projects/fullstory/dist/app/pub/fs.js.map');
  await applySourceMapToAttributions(
    trace,
    [{ urlPattern: 'fs.js', map: sourceMapJson }],
    '/Users/sethf/Code/mn-quick-fixes/projects/fullstory/packages'
  );

  if (true || process.argv[3] === '--filter') {
    console.log(`Filtering...`.green);
    filterTasks(trace, task => {
      const result: TaskFilterResult = {
        keepTask: false
      };

      const attribution = task.metadata.attributionInfo;
      if (isAttributedTo('fs.js', attribution)) {
        result.keepTask = true;
        result.keepDescendants = true;
      }

      //if (result.keepTask && task.parent) {
      //  result.keepSiblings = true;
      //}

      return result;
    });
  }

  console.log(`Summarizing...`.green);
  const summary = createSummary(trace, 'fs.js');

  console.log('Summary:'.green);
  console.log(JSON.stringify(summary, null, 2));

  if (true || process.argv[3] === '--trace') {
    console.log('Annotated trace:'.green);
    console.log(JSON.stringify(trace, filterParentValues, 2));
  }
}
