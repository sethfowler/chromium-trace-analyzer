declare module 'tracium/lib/task-groups' {
  export type TaskGroupIds = "parseHTML" | "styleLayout" | "paintCompositeRender" | "scriptParseCompile" | "scriptEvaluation" | "garbageCollection" | "other";
  export type TaskGroup = {
      id: "parseHTML" | "styleLayout" | "paintCompositeRender" | "scriptParseCompile" | "scriptEvaluation" | "garbageCollection" | "other";
      label: string;
      traceEventNames: string[];
  };
  /** @typedef {'parseHTML'|'styleLayout'|'paintCompositeRender'|'scriptParseCompile'|'scriptEvaluation'|'garbageCollection'|'other'} TaskGroupIds */
  /**
   * @typedef TaskGroup
   * @property {TaskGroupIds} id
   * @property {string} label
   * @property {string[]} traceEventNames
   */
  /**
   * Make sure the traceEventNames keep up with the ones in DevTools
   * @see https://cs.chromium.org/chromium/src/third_party/blink/renderer/devtools/front_end/timeline_model/TimelineModel.js?type=cs&q=TimelineModel.TimelineModel.RecordType+%3D&g=0&l=1156
   * @see https://cs.chromium.org/chromium/src/third_party/blink/renderer/devtools/front_end/timeline/TimelineUIUtils.js?type=cs&q=_initEventStyles+-f:out+f:devtools&sq=package:chromium&g=0&l=39
   * @type {{[P in TaskGroupIds]: {id: P, label: string, traceEventNames: Array<string>}}}
   */
  export const taskGroups: {
      [P in TaskGroupIds]: {
          id: P;
          label: string;
          traceEventNames: Array<string>;
      };
  };
  /** @type {Object<string, TaskGroup>} */
  export const taskNameToGroup: {
      [x: string]: TaskGroup;
  };
}
