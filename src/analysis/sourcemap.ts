import path from 'path';
import { RawSourceMap, SourceMapConsumer } from 'source-map';

import { HasAttributionInfo, SourceAttribution } from './attribution';
import {
  TaskTrace,
  TaskWithData
} from './taskgraph';
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

  let originalPosition = consumer.originalPositionFor({
    ...generatedPosition,
    bias: SourceMapConsumer.GREATEST_LOWER_BOUND
  });

  if (originalPosition.line === null) {
    originalPosition = consumer.originalPositionFor({
      ...generatedPosition,
      bias: SourceMapConsumer.LEAST_UPPER_BOUND
    });
  }

  if (originalPosition.source === null) { return; }
  if (originalPosition.line === null) { return; }
  if (originalPosition.column === null) { return; }

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

  const relativePath = info.url.replace(/^webpack:\/\/\//, '');
  const originalFilePath = path.resolve(webpackRoot, relativePath);

  let fileLines = fileCache.get(originalFilePath);
  if (!fileLines) {
    try {
      fileLines = await readFileAsLines(originalFilePath);
      fileCache.set(originalFilePath, fileLines)
    } catch {
    }
  }

  if (fileLines) {
    info.sourceLine = fileLines[info.lineNumber - 1];
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
      info.kind === 'source' &&
      info.url.includes(scriptUrlPattern)
    ) {
      await updateFromSourceMap(webpackRoot, consumer, info);
    }

    await applySourceMap(scriptUrlPattern, webpackRoot, consumer, task.children);
  }
}

export async function applySourceMapToAttributions(
  trace: TaskTrace<HasAttributionInfo, {}>,
  mappings: ({ urlPattern: string, map: object })[],
  webpackRoot?: string
): Promise<void> {
  for (const mapping of mappings) {
    const sourceMap = mapping.map as RawSourceMap;
    await SourceMapConsumer.with(sourceMap, null, async (consumer) => {
      await applySourceMap(mapping.urlPattern, webpackRoot, consumer, trace.tasks);
    });
  }
}
