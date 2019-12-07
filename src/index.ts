import args from 'commander';
import 'colors';
import fs from 'fs';

import {
  applySourceMapToAttributions,
  SourceMapSpec
} from './analysis/applySourceMapToAttributions';
import { createTaskTrace } from './analysis/createTaskTrace';
import { computeBreakdowns } from './analysis/computeBreakdowns';
import { filterTasksByUrlPattern } from './analysis/filterTasks';
import { inferAttributions } from './analysis/inferAttributions';
import { summarize, SummaryOptions } from './analysis/summarize';
import { log } from './log';
import { showPrettySummary } from './prettySummary';
import { readFileAsJson } from './util';

function filterParentValues(key: string, value: any): string | null {
  if (key === 'parent') {
    return value?.metadata?.taskId;
  }
  return value;
}

export async function main() {
  const summaryNames = ['cumulative', 'longest', 'tasks', 'all', 'none'];

  args
    .option(
      '--debug',
      'Enable debug logging.'
    )
    .option(
      '--silent',
      'Disable all logging, including non-fatal errors.'
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
      '--scriptFilter <urlPattern:line?>',
      `Filter out tasks not related to URLs containing urlPattern. An optional ` +
      `source line can be specified to filter out everything except one ` +
      `source location.`
    )
    .option(
      '--scriptFilterType <fine|coarse>',
      `Whether to include only tasks that match the filter (fine) or to include ` +
      `nearby tasks as well (coarse).`,
      'fine'
    )
    .option(
      `--topLevelOnly`,
      `Only include top-level tasks in the summary.`,
      false
    )
    .option(
      `--summary <${summaryNames.join('|')}>`,
      `Which summary to display.`,
      'all'
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
  if (args.silent) {
    log.level = 'silent';
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

  console.log(`Computing breakdowns...`.green);
  computeBreakdowns(trace);

  const scriptFilterType = args.scriptFilterType;
  if (scriptFilterType !== 'fine' && scriptFilterType !== 'coarse') {
    console.error(`--scriptFilterType must be 'fine' or 'coarse'`);
    process.exit(1);
  }

  if (args.scriptFilter) {
    const [urlPattern, line] = args.scriptFilter.split(':');
    const lineNumber = line === undefined ? undefined : Number(line);
    if (lineNumber !== undefined && Number.isNaN(lineNumber)) {
      console.error(`--scriptFilter line number must be numeric`);
      process.exit(1);
    }

    const position = lineNumber === undefined ? '' : `:${lineNumber}`;
    console.log(
      `Applying ${scriptFilterType} filter for ${urlPattern}${position}...`.green
    );
    filterTasksByUrlPattern(trace, urlPattern, lineNumber);
  }

  console.log(`Summarizing...`.green);
  const options: SummaryOptions = {
    topLevelOnly: args.topLevelOnly,
  };
  if (scriptFilterType === 'fine') {
    options.scriptUrlPattern = args.scriptFilter;
  }
  const summary = summarize(trace, options);

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

  const topCount = Number(args.top);
  if (Number.isNaN(topCount)) {
    console.error(`--top requires a numeric argument`);
    process.exit(1);
  }

  if (!summaryNames.includes(args.summary)) {
    console.error(`Unknown --summary '${args.summary}'`);
    process.exit(1);
  }

  if (['cumulative', 'all'].includes(args.summary)) {
    console.log();
    console.log();
    showPrettySummary(
      `Top ${topCount} Source Locations by Cumulative Duration`,
      'cumulative',
      summary.byAttribution.byCumulativeDuration.slice(0, topCount),
    );
  }

  if (['longest', 'all'].includes(args.summary)) {
    console.log();
    console.log();
    showPrettySummary(
      `Top ${topCount} Source Locations by Longest Instance Duration`,
      'simple',
      summary.byAttribution.byLongestInstanceDuration.slice(0, topCount)
    );
  }

  if (['tasks', 'all'].includes(args.summary)) {
    console.log();
    console.log();
    showPrettySummary(
      `Top ${topCount} Tasks by Duration`,
      'simple',
      summary.byTaskDuration.slice(0, topCount)
    );
  }
}
