import stripAnsiStream from 'strip-ansi-stream';
import process from 'process';
import util from 'util';

export class IndentingWriter {
  private _stream: NodeJS.WriteStream;
  private _indent: number = 0;
  private _specialChar: string | undefined = undefined;
  private _specialCol: number = 0;

  constructor(private _tabWidth: number = 2) {
    // Make sure we're writing to a terminal. If not, strip out ANSI codes so
    // that redirecting our output to a file doesn't leave you with a bunch of
    // escape sequence gobbledygook.
    if (process.stdout.isTTY) {
      this._stream = process.stdout;
    } else {
      this._stream = stripAnsiStream();
      this._stream.pipe(process.stdout);
    }
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

    this._stream.write(util.format(`${prefix}${message}`) + '\n');
  }
}
