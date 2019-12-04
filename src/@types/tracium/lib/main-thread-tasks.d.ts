declare module 'tracium/lib/main-thread-tasks' {
  export type TaskGroup = {
      id: "parseHTML" | "styleLayout" | "paintCompositeRender" | "scriptParseCompile" | "scriptEvaluation" | "garbageCollection" | "other";
      label: string;
      traceEventNames: string[];
  };
  export type TaskNode = {
      event: LH.TraceEvent;
      children: TaskNode[];
      parent?: TaskNode;
      startTime: number;
      endTime: number;
      duration: number;
      selfTime: number;
      attributableURLs: string[];
      group: TaskGroup;
  };
  export type PriorTaskData = {
      timers: Map<string, TaskNode>;
  };
  /**
   * @fileoverview
   *
   * This artifact converts the array of raw trace events into an array of hierarchical
   * tasks for easier consumption and bottom-up analysis.
   *
   * Events are easily produced but difficult to consume. They're a mixture of start/end markers, "complete" events, etc.
   * @see https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
   *
   * LH's TaskNode is an artifact that fills in the gaps a trace event leaves behind.
   * i.e. when did it end? which events are children/parents of this one?
   *
   * Each task will have its group/classification, start time, end time,
   * duration, and self time computed. Each task will potentially have a parent, children, and an
   * attributableURL for the script that was executing/forced this execution.
   */
  /** @typedef {import('../lib/task-groups.js').TaskGroup} TaskGroup */
  /**
   * @typedef TaskNode
   * @prop {LH.TraceEvent} event
   * @prop {TaskNode[]} children
   * @prop {TaskNode|undefined} parent
   * @prop {number} startTime
   * @prop {number} endTime
   * @prop {number} duration
   * @prop {number} selfTime
   * @prop {string[]} attributableURLs
   * @prop {TaskGroup} group
   */
  /** @typedef {{timers: Map<string, TaskNode>}} PriorTaskData */
  export class MainThreadTasks {
      /**
       * @param {LH.TraceEvent} event
       * @param {TaskNode} [parent]
       * @return {TaskNode}
       */
      static _createNewTaskNode(event: LH.TraceEvent, parent?: TaskNode): TaskNode;
      /**
       * @param {LH.TraceEvent[]} mainThreadEvents
       * @param {PriorTaskData} priorTaskData
       * @param {number} traceEndTs
       * @return {TaskNode[]}
       */
      static _createTasksFromEvents(mainThreadEvents: LH.TraceEvent[], priorTaskData: {
          timers: Map<string, TaskNode>;
      }, traceEndTs: number): TaskNode[];
      /**
       * @param {TaskNode} task
       * @param {TaskNode|undefined} parent
       * @return {number}
       */
      static _computeRecursiveSelfTime(task: TaskNode, parent: TaskNode): number;
      /**
       * @param {TaskNode} task
       * @param {string[]} parentURLs
       * @param {PriorTaskData} priorTaskData
       */
      static _computeRecursiveAttributableURLs(task: TaskNode, parentURLs: string[], priorTaskData: {
          timers: Map<string, TaskNode>;
      }): void;
      /**
       * @param {TaskNode} task
       * @param {TaskGroup} [parentGroup]
       */
      static _computeRecursiveTaskGroup(task: TaskNode, parentGroup?: TaskGroup): void;
      /**
       * @param {LH.TraceEvent[]} traceEvents
       * @param {number} traceEndTs
       * @return {TaskNode[]}
       */
      static getMainThreadTasks(traceEvents: LH.TraceEvent[], traceEndTs: number): TaskNode[];
      /**
       * @param {LH.Trace} trace
       * @return {Promise<Array<TaskNode>>} networkRecords
       */
      static compute(trace: LH.Trace): Promise<TaskNode[]>;
  }
}
