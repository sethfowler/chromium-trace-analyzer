import { AnyTaskTrace, TaskNode, TaskTraceWithAddedData } from './taskgraph';

export type FrameInfo = {
  url: string;
  functionName: string | undefined;
  lineNumber: number;
  columnNumber: number;
};

export type HasFrameInfo = {
  frameInfo: Map<string, FrameInfo>;
};

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
      data.lineNumber &&
      data.columnNumber &&
      !frameInfoMap.has(frame)
    ) {
      frameInfoMap.set(frame, {
        url: data.url,
        functionName: data.functionName,  // May not be present.
        lineNumber: data.lineNumber,
        columnNumber: data.columnNumber,
      });
    }

    gatherFrameInfo(frameInfoMap, task.children);
  }
}

export function inferFrameSourceLocations<T extends AnyTaskTrace>(
  trace: T
): asserts trace is TaskTraceWithAddedData<T, {}, HasFrameInfo> {
  const frameInfoMap = new Map<string, FrameInfo>();
  gatherFrameInfo(frameInfoMap, trace.tasks);
  const traceWithAddedData = trace as TaskTraceWithAddedData<T, {}, HasFrameInfo>;
  traceWithAddedData.metadata.frameInfo = frameInfoMap;
}
