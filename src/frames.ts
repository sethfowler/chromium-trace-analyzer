// Information about a stack frame.
export type FrameInfo = {
  url: string;
  functionName: string | undefined;
  lineNumber: number;
  columnNumber: number;
};

export type HasFrameInfo = {
  // A map from trace event frame ids to the relevant stack frame information.
  frameInfo: Map<string, FrameInfo>;
};
