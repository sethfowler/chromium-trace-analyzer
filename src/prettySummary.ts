import 'colors';
import cliHighlight from 'cli-highlight';

import { Attribution, AttributionContext } from './attributions';
import { AttributionStatistics } from './analysis/summarize';

class IndentingWriter {
  private _indent: number = 0;

  constructor(private _tabWidth: number = 2) {
  }

  indent(by: number = 1): void {
    this._indent += by * this._tabWidth;
  }

  unindent(by: number = 1): void {
    this._indent -= by * this._tabWidth;
    this._indent = Math.max(this._indent, 0);
  }

  withIndent<R>(action: () => R): R {
    try {
      this.indent();
      return action();
    } finally {
      this.unindent();
    }
  }

  log(message: any = ''): void {
    console.log(`${' '.repeat(this._indent)}${message}`);
  }
}

function round(n: number): string {
  const intDigits = String(Math.floor(n)).length;
  return n.toPrecision(intDigits + 2);
}

function showTiming(
  writer: IndentingWriter,
  stats: AttributionStatistics
): void {
  if (stats.startTime !== undefined) {
    writer.log(`- Start time: `.bold + `${round(stats.startTime)}ms`);
  }
  writer.log(`- Duration: `.bold + `${round(stats.breakdown.total)}ms`.red);
}

function showHighlightedSource(
  writer: IndentingWriter,
  lines: readonly string[],
  brief: boolean = false
): void {
  const highlighted = cliHighlight(lines.join('\n'), {
    language: 'typescript',
    ignoreIllegals: true
  });

  const highlightedLines = highlighted.split('\n');
  const targetLine = Math.floor(highlightedLines.length / 2);

  if (brief) {
    writer.log(`-> `.white + highlightedLines[targetLine]);
    return;
  }

  highlightedLines.forEach((line, lineNumber) => {
    if (lineNumber === targetLine) {
      writer.log(`-> `.white + line);
    } else {
      writer.log(`|  `.bold + line);
    }
  });
}

type ShowAttributionOptions = {
  brief?: boolean;
  extraMetadata?: string;
};

function showAttribution(
  writer: IndentingWriter,
  attr: Attribution,
  options: ShowAttributionOptions = {}
): void {
  const extra = options.extraMetadata ? ` (${options.extraMetadata})` : '';

  switch (attr.kind) {
    case 'sourceLocation':
      writer.log(
        `- ${attr.url} (${attr.lineNumber}:${attr.columnNumber})${extra}`.white
      );

      writer.withIndent(() => {
        if (attr.sourceLines) {
          showHighlightedSource(writer, attr.sourceLines, options.brief ?? false);
        } else if (attr.functionName && attr.functionName !== '') {
          writer.log(`-> `.white + `${attr.functionName}()`.bold);
        }
      });
      return;

    case 'file':
      writer.log(`- ` + `${attr.url}${extra}`.white);
      return;

    case 'unknown':
      writer.log(`- ` + `unknown${extra}`.white);
      return;

    default:
      const unknown: never = attr;
      throw new Error(`Unexpected attribution kind: ${JSON.stringify(unknown)}`);
  }
};

function showTriggers(
  writer: IndentingWriter,
  context: AttributionContext
): void {
  const triggers = context.triggers.filter(t => t !== 'RunTask');
  if (triggers.length > 0) {
    writer.log(`- Triggered by:`.bold);
    writer.withIndent(() => {
      for (const trigger of triggers) {
        writer.log(`- ${trigger}`);
      }
    });
  }
}

function showTopLevelAttribution(
  writer: IndentingWriter,
  stats: AttributionStatistics
): void {
  // If we can attribute this task to something specific, use that.
  if (stats.attribution.kind !== 'unknown') {
    showAttribution(writer, stats.attribution);
    return;
  }

  // If more than half of the time spent in this task is attributed to something
  // specific, use that.
  // TODO: This would work a bit better if we merged different lines in the same
  // file for this purpose.
  if (stats.descendantBreakdowns.size > 0) {
    const descendants = [...stats.descendantBreakdowns.values()]
      .sort((a, b) => b.breakdown.total - a.breakdown.total);
    const hottestDescendant = descendants[0];
    const hottestPercentage =
      (hottestDescendant.breakdown.total / stats.breakdown.total) * 100;
    if (hottestPercentage >= 50) {
      showAttribution(writer, hottestDescendant.attribution, {
        extraMetadata: `primary - ${round(hottestPercentage)}%`
      });
      return;
    }
  }

  // C'est la vie. Show the original 'unknown' value.
  showAttribution(writer, stats.attribution);
}

export function showPrettySummary(
  title: string,
  entries: AttributionStatistics[]
): void {
  const writer = new IndentingWriter();
  writer.log(title.white);
  writer.log('='.repeat(title.length).white);

  writer.withIndent(() => {
    for (const stats of entries) {
      writer.log();

      showTopLevelAttribution(writer, stats);

      writer.withIndent(() => {
        showTiming(writer, stats);

        writer.log(`- Breakdown:`.bold);
        writer.withIndent(() => {
          for (const [kind, duration] of Object.entries(stats.breakdown)) {
            if (kind === 'total') { continue; }
            if (duration === 0) { continue; }
            writer.log(`- ${kind}: ` + `${round(duration)}ms`.red);
          }
        });

        showTriggers(writer, stats.context);

        if (stats.descendantBreakdowns.size > 0) {
          writer.log(`- Invokes:`.bold);
          writer.withIndent(() => {
            const total = stats.breakdown.total;
            for (const descendant of stats.descendantBreakdowns.values()) {
              const duration = descendant.breakdown.total;
              const percentage = (duration / total) * 100;
              showAttribution(writer, descendant.attribution, {
                brief: true,
                extraMetadata:
                  `${round(percentage)}% - ${round(duration)}ms`
              });
            }
          });
        }

        if (
          stats.longestInstance &&
          stats.longestInstance.breakdown.total !== stats.breakdown.total
        ) {
          const longestInstance = stats.longestInstance;
          writer.log(`- Longest instance:`.bold);
          writer.withIndent(() => {
            const duration = longestInstance.breakdown.total;
            writer.log(`- Duration: `.bold + `${duration}ms`.red);
            showTriggers(writer, longestInstance.context);
          });
        }
      });
    }
  });
}
