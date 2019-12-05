import path from 'path';
import { RawSourceMap, SourceMapConsumer } from 'source-map';

import { HasAttributionInfo, SourceAttribution } from '../attributions';
import { log } from '../log';
import { TaskTrace, TaskWithData } from '../taskgraph';
import { readFileAsLines } from '../util';

const fileCache = new Map<string, string[]>();

async function updateFromSourceMap(
  webpackRoot: string | undefined,
  consumer: SourceMapConsumer,
  info: SourceAttribution
): Promise<void> {
  const generatedPosition = {
    // The line number is 1-based for both trace events and source maps.
    line: info.lineNumber,
    // The column number is 1-based for trace events and 0-based for source maps.
    column: info.columnNumber - 1
  };

  const originalPosition = consumer.originalPositionFor({
    ...generatedPosition,
    bias: SourceMapConsumer.GREATEST_LOWER_BOUND
  });

  if (
    originalPosition.source === null ||
    originalPosition.line === null ||
    originalPosition.column === null
  ) {
    log.debug(`No source map entry for generated position:`, generatedPosition);
    return;
  }

  log.debug(
    `Found source map entry for generated position %O: %O`,
    generatedPosition,
    originalPosition
  );

  info.generated = {
    url: info.url,
    lineNumber: info.lineNumber,
    columnNumber: info.columnNumber,
    functionName: info.functionName
  };

  info.url = originalPosition.source;
  info.lineNumber = originalPosition.line;
  info.columnNumber = originalPosition.column;
  info.functionName = originalPosition.name ?? info.functionName;

  if (!webpackRoot) { return; }

  if (!info.url.startsWith('webpack:')) {
    log.warn(
      `Can't load original file for non-webpack source map entry '${info.url}'.`
    );
  }

  const relativePath = info.url.replace(/^webpack:\/\/\//, '');
  const originalFilePath = path.resolve(webpackRoot, relativePath);

  let fileLines = fileCache.get(originalFilePath);
  if (!fileLines) {
    try {
      fileLines = await readFileAsLines(originalFilePath);
      fileCache.set(originalFilePath, fileLines)
    } catch {
      // Ignore the special 'webpack' entries, but warn for other entries if we
      // can't open for corresponding file.
      if (!info.url.startsWith(`webpack:///webpack`)) {
        log.warn(
          `Failed to load original file '${originalFilePath}' corresponding to ` +
          `source map entry '${info.url}'.`
        );
      }
    }
  }

  if (fileLines) {
    const lineNumber = info.lineNumber - 1;  // Convert to 0-based.
    info.sourceLines = fileLines.slice(lineNumber - 2, lineNumber + 3);
  }
}

async function applySourceMap(
  scriptUrlPattern: string,
  webpackRoot: string | undefined,
  consumer: SourceMapConsumer,
  tasks: TaskWithData<HasAttributionInfo>[]
): Promise<void> {
  for (const task of tasks) {
    const info = task.metadata.attributionInfo;
    if (
      info.kind === 'sourceLocation' &&
      info.url.includes(scriptUrlPattern)
    ) {
      await updateFromSourceMap(webpackRoot, consumer, info);
    }

    await applySourceMap(scriptUrlPattern, webpackRoot, consumer, task.children);
  }
}

export type SourceMapSpec = {
  urlPattern: string;
  map: object;
  webpackRoot?: string;
};

// A pass that rewrites source location attributions using a source map so that
// the results are easier to interpret for humans.
export async function applySourceMapToAttributions(
  trace: TaskTrace<HasAttributionInfo, {}>,
  mappings: SourceMapSpec[]
): Promise<void> {
  log.debug(`Starting applySourceMapToAttributions pass.`);

  for (const mapping of mappings) {
    const sourceMap = mapping.map as RawSourceMap;
    await SourceMapConsumer.with(sourceMap, null, async (consumer) => {
      await applySourceMap(
        mapping.urlPattern,
        mapping.webpackRoot,
        consumer,
        trace.tasks
      );
    });
  }
}
