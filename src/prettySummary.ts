import 'colors';
import cliHighlight from 'cli-highlight';

import { AttributionInfo } from './attributions';
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

function showTiming(
  writer: IndentingWriter,
  stats: AttributionStatistics
): void {
  if (stats.startTime !== undefined) {
    writer.log(`- Start time: `.bold + `${stats.startTime}ms`);
  }
  writer.log(`- Duration: `.bold + `${stats.breakdown.total}ms`.red);
}

function showHighlightedSource(
  writer: IndentingWriter,
  lines: string[],
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
  info: AttributionInfo,
  options: ShowAttributionOptions = {}
): void {
  const extra = options.extraMetadata ? ` (${options.extraMetadata})` : '';

  switch (info.kind) {
    case 'sourceLocation':
      writer.log(
        `- ${info.url} (${info.lineNumber}:${info.columnNumber})${extra}`.white
      );

      writer.withIndent(() => {
        if (info.sourceLines) {
          showHighlightedSource(writer, info.sourceLines, options.brief ?? false);
        } else if (info.functionName && info.functionName !== '') {
          writer.log(`-> `.white + `${info.functionName}()`.bold);
        }
      });
      return;

    case 'file':
      writer.log(`- ` + `${info.url}${extra}`.white);
      return;

    case 'unknown':
      writer.log(`- ` + `unknown${extra}`.white);
      return;

    default:
      const unknown: never = info;
      throw new Error(`Unexpected attribution kind: ${JSON.stringify(unknown)}`);
  }
};

function showTriggers(
  writer: IndentingWriter,
  info: AttributionInfo
): void {
  const triggers = info.triggers.filter(t => t !== 'RunTask');
  if (triggers.length > 0) {
    writer.log(`- Triggered by:`.bold);
    writer.withIndent(() => {
      for (const trigger of triggers) {
        writer.log(`- ${trigger}`);
      }
    });
  }
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

      showAttribution(writer, stats.attribution);

      writer.withIndent(() => {
        showTiming(writer, stats);

        writer.log(`- Breakdown:`.bold);
        writer.withIndent(() => {
          for (const [kind, duration] of Object.entries(stats.breakdown)) {
            if (kind === 'total') { continue; }
            if (duration === 0) { continue; }
            writer.log(`- ${kind}: ` + `${duration}ms`.red);
          }
        });

        showTriggers(writer, stats.attribution);

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
                  `${percentage.toPrecision(3)}% - ${duration.toPrecision(3)}ms`
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
            showTriggers(writer, longestInstance.attribution);
          });
        }
      });
    }
  });
}
