declare module 'tracium/lib/trace-of-tab' {
  export class TraceOfTab {
      /**
       * Returns true if the event is a navigation start event of a document whose URL seems valid.
       *
       * @param {LH.TraceEvent} event
       */
      static isNavigationStartOfInterest(event: LH.TraceEvent): boolean;
      /**
       * @param {LH.TraceEvent[]} traceEvents
       * @param {(e: LH.TraceEvent) => boolean} filter
       */
      static filteredStableSort(traceEvents: LH.TraceEvent[], filter: (e: LH.TraceEvent) => boolean): LH.TraceEvent[];
      /**
       * Finds key trace events, identifies main process/thread, and returns timings of trace events
       * in milliseconds since navigation start in addition to the standard microsecond monotonic timestamps.
       * @param {LH.Trace} trace
       * @return {Promise<LH.Artifacts.TraceOfTab>}
      */
      static compute(trace: LH.Trace): Promise<LH.Artifacts.TraceOfTab>;
  }
}
