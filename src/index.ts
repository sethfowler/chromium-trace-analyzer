import args from 'commander';
import 'colors';
import fs from 'fs';

import {
  applySourceMapToAttributions,
  SourceMapSpec
} from './analysis/applySourceMapToAttributions';
import { createTaskTrace } from './analysis/createTaskTrace';
import { filterTasksByUrlPattern } from './analysis/filterTasks';
import { inferAttributions } from './analysis/inferAttributions';
import { summarize } from './analysis/summarize';
import { log } from './log';
import { showPrettySummary } from './prettySummary';
import { readFileAsJson } from './util';

function filterParentValues(key: string, value: string): string | null {
  if (key === 'parent') { return null; }
  return value;
}

export async function main() {
  args
    .option(
      '--debug',
      'Enable debug logging.'
    )
    .requiredOption(
      '--trace <inputFile>',
      `A JSON trace file generated by the Chromium profiler or Lighthouse.`
    )
    .option(
      '--sourceMap <urlPattern:mapFile:webpackRootDir...>',
      `Colon separated. URLs containing urlPattern will use the source map at ` +
      `mapFilePath and load files from webpackRootDir. Can be specified more than once.`,
      (spec, specs) => {
        specs.push(spec);
        return specs;
      },
      []
    )
    .option(
      '--taskFilter <urlPattern>',
      'Filter out tasks not related to URLs containing urlPattern.'
    )
    .option(
      '--taskFilterType <fine|coarse>',
      `Whether to filter tasks aggressively (fine) or to include nearby tasks ` +
      `as well (coarse).`,
      'fine'
    )
    .option(
      '--top <N>',
      'Include the top N tasks in the summary.',
      10
    )
    .option(
      '--outputJsonTrace <outputFile>',
      'Write an annotated JSON trace with a lot more detail to outputFile.'
    )
    .option(
      '--outputJsonSummary <outputFile>',
      `Write an annotated JSON summary with a lot more detail to outputFile. ` +
      `Use the same filename as --outputJsonTrace to include both in the same file.`
    )
    .helpOption(
      '--help',
      'Output usage information.'
    );

  args.parse(process.argv);

  if (args.debug) {
    log.level = 'debug';
  }

  console.log(`Reading trace file: `.green + args.trace.white);
  const traceJson = await readFileAsJson(args.trace);
  const trace = await createTaskTrace(traceJson);

  console.log(`Inferring attributions...`.green);
  inferAttributions(trace);

  if (args.sourceMap) {
    console.log(`Applying source map...`.green);

    const specs: SourceMapSpec[] = [];
    for (const spec of args.sourceMap) {
      const [urlPattern, mapFile, webpackRoot] = spec.split(':');
      const map = await readFileAsJson(mapFile);
      specs.push({ urlPattern, map, webpackRoot });
    }

    await applySourceMapToAttributions(trace, specs);
  }

  const taskFilterType = args.taskFilterType;
  if (taskFilterType !== 'fine' && taskFilterType !== 'coarse') {
    console.error(`--taskFilterType must be 'fine' or 'coarse'`);
    process.exit(1);
  }

  if (args.taskFilter) {
    console.log(`Filtering (${taskFilterType})...`.green);
    filterTasksByUrlPattern(trace, args.taskFilter, taskFilterType);
  }

  console.log(`Summarizing...`.green);
  const summary = taskFilterType === 'fine'
    ? summarize(trace, args.taskFilter)
    : summarize(trace);

  if (args.outputJsonTrace && args.outputJsonSummary === args.outputJsonTrace) {
      console.log(
        `Writing annotated JSON summary and trace: `.green + args.outputJsonTrace.white
      );
      fs.writeFileSync(
        args.outputJsonTrace,
        JSON.stringify({
          summary,
          trace
        }, filterParentValues, 2)
      );
  } else {
    if (args.outputJsonTrace) {
      console.log(
        `Writing annotated JSON trace: `.green + args.outputJsonTrace.white
      );
      fs.writeFileSync(
        args.outputJsonTrace,
        JSON.stringify(trace, filterParentValues, 2)
      );
    }

    if (args.outputJsonSummary) {
      console.log(
        `Writing annotated JSON summary: `.green + args.outputJsonSummary.white
      );
      fs.writeFileSync(
        args.outputJsonSummary,
        JSON.stringify(summary, null, 2)
      );
    }
  }

  if (Number.isNaN(Number(args.top))) {
    console.error(`--top requires a numeric argument`);
    process.exit(1);
  }

  console.log();
  console.log();
  showPrettySummary(
    `Top ${args.top} Source Locations by Cumulative Duration`,
    summary.byAttribution.byCumulativeDuration.slice(0, args.top)
  );

  console.log();
  console.log();
  showPrettySummary(
    `Top ${args.top} Source Locations by Longest Instance Duration`,
    summary.byAttribution.byLongestInstanceDuration.slice(0, args.top)
  );
}
