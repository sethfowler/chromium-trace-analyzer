import 'colors';
import cliHighlight from 'cli-highlight';

import { Attribution, AttributionContext } from './attributions';
import { AttributionStatistics } from './analysis/summarize';

class IndentingWriter {
  private _indent: number = 0;
  private _specialChar: string | undefined = undefined;
  private _specialCol: number = 0;

  constructor(private _tabWidth: number = 2) {
  }

  indent(by: number = 1): void {
    this._indent += by * this._tabWidth;
  }

  unindent(by: number = 1): void {
    this._indent -= by * this._tabWidth;
    this._indent = Math.max(this._indent, 0);
  }

  addSpecial(char: string, offset: number = 0): void {
    this._specialChar = char;
    this._specialCol = this._indent + offset;
  }

  removeSpecial(): void {
    this._specialChar = undefined;
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
    let prefix = ' '.repeat(this._indent);
    if (this._specialChar !== undefined) {
      prefix = prefix.substring(0, this._specialCol) +
        this._specialChar +
        prefix.substring(this._specialCol + this._specialChar.length);
      prefix = prefix.substring(0, this._indent + 1);
    }

    console.log(`${prefix}${message}`);
  }
}

function round(n: number): string {
  const intDigits = String(Math.floor(n)).length;
  return n.toPrecision(intDigits + 2);
}

function showTiming(
  writer: IndentingWriter,
  kind: 'cumulative' | 'simple',
  stats: AttributionStatistics
): void {
  if (kind === 'cumulative') {
    writer.log(`- Cumulative duration: `.bold + `${round(stats.breakdown.total)}ms`.red);
    return;
  }

  if (stats.startTime !== undefined) {
    writer.log(`- Start time: `.bold + `${round(stats.startTime)}ms`);
  }
  writer.log(`- Total duration: `.bold + `${round(stats.breakdown.total)}ms`.red);
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

export type PrettySummaryOptions = {
  title: string;
  kind: 'cumulative' | 'simple';
  entries: AttributionStatistics[];
  showPlayByPlay: boolean;
};

export function showPrettySummary(options: PrettySummaryOptions): void {
  const writer = new IndentingWriter();
  writer.log(options.title.white);
  writer.log('='.repeat(options.title.length).white);

  writer.withIndent(() => {
    for (const stats of options.entries) {
      writer.log();

      showAttribution(writer, stats.attribution, {
        extraMetadata: stats.taskIds.length === 1 ? `task ${stats.taskIds[0]}` : '',
      });

      writer.withIndent(() => {
        showTiming(writer, options.kind, stats);

        writer.log(`- Breakdown:`.bold);
        writer.withIndent(() => {
          for (const [kind, duration] of stats.breakdown.entries()) {
            if (duration === 0) { continue; }
            writer.log(`- ${kind}: ` + `${round(duration)}ms`.red);
          }
        });

        showTriggers(writer, stats.context);

        if (stats.breakdownsByAttribution.size > 1) {
          writer.log(`- Breakdown by attribution:`.bold);
          writer.withIndent(() => {
            const total = stats.breakdown.total;
            const entries = [...stats.breakdownsByAttribution.entries()]
              .sort(([_aK, aV], [_bK, bV]) => bV.total - aV.total);
            for (const [attr, breakdown] of entries) {
              if (attr === stats.attribution) { continue; }
              const duration = breakdown.total;
              const percentage = (duration / total) * 100;
              showAttribution(writer, attr, {
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

        if (options.showPlayByPlay && stats.playByPlay) {
          writer.log(`- Play-by-play:`.bold);
          const playByPlay = stats.playByPlay;
          const total = stats.breakdown.total;

          writer.withIndent(() => {
            writer.addSpecial('|', 0);
            writer.withIndent(() => {
              let lastAttribution: Attribution | undefined;

              for (const entry of playByPlay) {
                if (entry.attribution !== lastAttribution) {
                  if (lastAttribution !== undefined) {
                    writer.log();
                  }
                  lastAttribution = entry.attribution;

                  showAttribution(writer, entry.attribution, {
                    brief: true,
                    //extraMetadata:
                    //  `${round(percentage)}% - ${round(duration)}ms`
                  });
                }

                writer.withIndent(() => {
                  const duration = entry.breakdown.total;
                  const percentage = (duration / total) * 100;

                  writer.log(
                    `- ${entry.name.bold} ` +
                    `(${round(percentage)}% of total - ${round(duration)}ms)`.white
                  );
                });

              }
            });
            writer.removeSpecial();
          });
        }

      });
    }
  });
}
