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

function showHighlightedSource(writer: IndentingWriter, lines: string[]): void {
  const highlighted = cliHighlight(lines.join('\n'), {
    language: 'typescript',
    ignoreIllegals: true
  });

  const highlightedLines = highlighted.split('\n');
  const targetLine = Math.floor(highlightedLines.length / 2);
  highlightedLines.forEach((line, lineNumber) => {
    if (lineNumber === targetLine) {
      writer.log(`-> `.white + line);
    } else {
      writer.log(`|  `.bold + line);
    }
  });
}

function showAttribution(
  writer: IndentingWriter,
  info: AttributionInfo
): void {
  switch (info.kind) {
    case 'sourceLocation':
      writer.log(`- ${info.url} (${info.lineNumber}:${info.columnNumber})`.white);
      writer.withIndent(() => {
        if (info.sourceLines) {
          showHighlightedSource(writer, info.sourceLines);
        } else if (info.functionName && info.functionName !== '') {
          writer.log(`-> `.white + `${info.functionName}()`.bold);
        }
      });
      return;

    case 'file':
      writer.log(`- ` + info.url.white);
      return;

    case 'unknown':
      writer.log(`- ` + `unknown`.white);
      return;

    default:
      const unknown: never = info;
      throw new Error(`Unexpected attribution kind: ${JSON.stringify(unknown)}`);
  }
};

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
        writer.log(`- Duration: `.bold + `${stats.duration}ms`.red);

        writer.log(`- Breakdown:`.bold);
        writer.withIndent(() => {
          for (const [kind, duration] of Object.entries(stats.breakdown)) {
            if (duration === 0) { continue; }
            writer.log(`- ${kind}: ` + `${duration}ms`.red);
          }
        });

        const triggers = stats.attribution.triggers.filter(t => t !== 'RunTask');
        if (triggers.length > 0) {
          writer.log(`- Triggers:`.bold);
          writer.withIndent(() => {
            for (const trigger of triggers) {
              writer.log(`- ${trigger}`);
            }
          });
        }
      });
    }
  });
}
