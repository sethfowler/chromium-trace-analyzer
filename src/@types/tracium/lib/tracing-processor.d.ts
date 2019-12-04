declare module 'tracium/lib/tracing-process' {
  import 'lighthouse';

  export = TraceProcessor;
  class TraceProcessor {
  }

  namespace TraceProcessor {
      export { assertHasToplevelEvents, _riskPercentiles, getRiskToResponsiveness, getMainThreadTopLevelEventDurations, getMainThreadTopLevelEvents, findMainFrameIds, isScheduleableTask, ToplevelEvent };

      function assertHasToplevelEvents(events: LH.TraceEvent[]): void;

      function _riskPercentiles(durations: number[], totalTime: number, percentiles: number[], clippedLength?: number): Array<{percentile: number, time: number}>;

      function getRiskToResponsiveness(
          events: ToplevelEvent[],
          startTime: number,
          endTime: number,
          percentiles?: number[]
      ): Array<{percentile: number, time: number}>;

      function getMainThreadTopLevelEventDurations(topLevelEvents: ToplevelEvent[], startTime?: number, endTime?: number): {durations: number[], clippedLength: number};


      function getMainThreadTopLevelEvents(tabTrace: LH.Artifacts.TraceOfTab, startTime?: number, endTime?: number): ToplevelEvent[];

      function findMainFrameIds(events: LH.TraceEvent[]): {pid: number, tid: number, frameId: string};

      function isScheduleableTask(evt: LH.TraceEvent): boolean;

      type ToplevelEvent = {
          start: number;
          end: number;
          duration: number;
      };
  }
}
