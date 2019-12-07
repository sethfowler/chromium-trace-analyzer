import { FrameInfo, HasFrameInfo } from '../frames';
import { log } from '../log';
import { AnyTaskTrace, TaskNode, TaskTraceWithAddedData } from '../taskgraph';

function gatherFrameInfo(
  frameInfoMap: Map<string, FrameInfo>,
  tasks: TaskNode[]
): void {
  for (const task of tasks) {
    const args = task.event.args ?? {};
    const data = args.data ?? {};
    const frame = data.frame ?? args.frame;
    if (
      frame &&
      data.url &&
      !frameInfoMap.has(frame)
    ) {
      const lineNumber = data.lineNumber ?? data.startLine;
      if (lineNumber !== undefined) {
        const columnNumber = data.columnNumber ?? 0;
        const frameInfo = {
          url: data.url,
          functionName: data.functionName,  // May not be present.
          lineNumber,
          columnNumber
        };

        log.debug(`Inferred frame ${frame} location: `, frameInfo);

        frameInfoMap.set(frame, frameInfo);
      }
    }

    gatherFrameInfo(frameInfoMap, task.children);
  }
}

export function inferFrameSourceLocations<T extends AnyTaskTrace>(
  trace: T
): asserts trace is TaskTraceWithAddedData<T, {}, HasFrameInfo> {
  const traceWithAddedData = trace as TaskTraceWithAddedData<T, {}, HasFrameInfo>;
  const frameInfoMap =
    traceWithAddedData.metadata.frameInfo ?? new Map<string, FrameInfo>();
  gatherFrameInfo(frameInfoMap, trace.tasks);
  traceWithAddedData.metadata.frameInfo = frameInfoMap;
}
