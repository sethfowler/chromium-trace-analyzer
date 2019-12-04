declare module 'tracium/lib/lh-error' {
  export = LighthouseError;
  /**
   * @typedef LighthouseErrorDefinition
   * @property {string} code
   * @property {string} message
   * @property {RegExp} [pattern]
   * @property {boolean} [lhrRuntimeError] True if it should appear in the top-level LHR.runtimeError property.
   */
  class LighthouseError extends Error {
      /**
       * @param {LighthouseErrorDefinition} errorDefinition
       * @param {Record<string, string|boolean|undefined>=} properties
       */
      constructor(errorDefinition: LighthouseError.LighthouseErrorDefinition, properties?: Record<string, string | boolean>);
      code: string;
      friendlyMessage: string;
      lhrRuntimeError: boolean;
  }
  namespace LighthouseError {
      export { fromLighthouseError, fromProtocolMessage, ERRORS as errors, NO_ERROR, UNKNOWN_ERROR, LighthouseErrorDefinition };

      function fromLighthouseError(err: LighthouseError): LighthouseError;
      function fromProtocolMessage(method: string, protocolError: {message: string, data?: string|undefined}): Error|LighthouseError;
      var NO_ERROR: string;
      var UNKNOWN_ERROR: string;
      type LighthouseErrorDefinition = {
          code: string;
          message: string;
          pattern?: RegExp;
          /**
           * True if it should appear in the top-level LHR.runtimeError property.
           */
          lhrRuntimeError?: boolean;
      };
  }
  namespace ERRORS {
      export namespace NO_SPEEDLINE_FRAMES {
          export const code: string;
          export const message: string;
          export const lhrRuntimeError: boolean;
      }
      export namespace SPEEDINDEX_OF_ZERO {
          const code_1: string;
          export { code_1 as code };
          const message_1: string;
          export { message_1 as message };
          const lhrRuntimeError_1: boolean;
          export { lhrRuntimeError_1 as lhrRuntimeError };
      }
      export namespace NO_SCREENSHOTS {
          const code_2: string;
          export { code_2 as code };
          const message_2: string;
          export { message_2 as message };
          const lhrRuntimeError_2: boolean;
          export { lhrRuntimeError_2 as lhrRuntimeError };
      }
      export namespace INVALID_SPEEDLINE {
          const code_3: string;
          export { code_3 as code };
          const message_3: string;
          export { message_3 as message };
          const lhrRuntimeError_3: boolean;
          export { lhrRuntimeError_3 as lhrRuntimeError };
      }
      export namespace NO_TRACING_STARTED {
          const code_4: string;
          export { code_4 as code };
          const message_4: string;
          export { message_4 as message };
          const lhrRuntimeError_4: boolean;
          export { lhrRuntimeError_4 as lhrRuntimeError };
      }
      export namespace NO_NAVSTART {
          const code_5: string;
          export { code_5 as code };
          const message_5: string;
          export { message_5 as message };
          const lhrRuntimeError_5: boolean;
          export { lhrRuntimeError_5 as lhrRuntimeError };
      }
      export namespace NO_FCP {
          const code_6: string;
          export { code_6 as code };
          const message_6: string;
          export { message_6 as message };
          const lhrRuntimeError_6: boolean;
          export { lhrRuntimeError_6 as lhrRuntimeError };
      }
      export namespace NO_DCL {
          const code_7: string;
          export { code_7 as code };
          const message_7: string;
          export { message_7 as message };
          const lhrRuntimeError_7: boolean;
          export { lhrRuntimeError_7 as lhrRuntimeError };
      }
      export namespace NO_FMP {
          const code_8: string;
          export { code_8 as code };
          const message_8: string;
          export { message_8 as message };
      }
      export namespace FMP_TOO_LATE_FOR_FCPUI {
          const code_9: string;
          export { code_9 as code };
          const message_9: string;
          export { message_9 as message };
      }
      export namespace NO_FCPUI_IDLE_PERIOD {
          const code_10: string;
          export { code_10 as code };
          const message_10: string;
          export { message_10 as message };
      }
      export namespace NO_TTI_CPU_IDLE_PERIOD {
          const code_11: string;
          export { code_11 as code };
          const message_11: string;
          export { message_11 as message };
      }
      export namespace NO_TTI_NETWORK_IDLE_PERIOD {
          const code_12: string;
          export { code_12 as code };
          const message_12: string;
          export { message_12 as message };
      }
      export namespace NO_DOCUMENT_REQUEST {
          const code_13: string;
          export { code_13 as code };
          const message_13: string;
          export { message_13 as message };
          const lhrRuntimeError_8: boolean;
          export { lhrRuntimeError_8 as lhrRuntimeError };
      }
      export namespace FAILED_DOCUMENT_REQUEST {
          const code_14: string;
          export { code_14 as code };
          const message_14: string;
          export { message_14 as message };
          const lhrRuntimeError_9: boolean;
          export { lhrRuntimeError_9 as lhrRuntimeError };
      }
      export namespace ERRORED_DOCUMENT_REQUEST {
          const code_15: string;
          export { code_15 as code };
          const message_15: string;
          export { message_15 as message };
          const lhrRuntimeError_10: boolean;
          export { lhrRuntimeError_10 as lhrRuntimeError };
      }
      export namespace INSECURE_DOCUMENT_REQUEST {
          const code_16: string;
          export { code_16 as code };
          const message_16: string;
          export { message_16 as message };
          const lhrRuntimeError_11: boolean;
          export { lhrRuntimeError_11 as lhrRuntimeError };
      }
      export namespace PAGE_HUNG {
          const code_17: string;
          export { code_17 as code };
          const message_17: string;
          export { message_17 as message };
          const lhrRuntimeError_12: boolean;
          export { lhrRuntimeError_12 as lhrRuntimeError };
      }
      export namespace TRACING_ALREADY_STARTED {
          const code_18: string;
          export { code_18 as code };
          const message_18: string;
          export { message_18 as message };
          export const pattern: RegExp;
          const lhrRuntimeError_13: boolean;
          export { lhrRuntimeError_13 as lhrRuntimeError };
      }
      export namespace PARSING_PROBLEM {
          const code_19: string;
          export { code_19 as code };
          const message_19: string;
          export { message_19 as message };
          const pattern_1: RegExp;
          export { pattern_1 as pattern };
          const lhrRuntimeError_14: boolean;
          export { lhrRuntimeError_14 as lhrRuntimeError };
      }
      export namespace READ_FAILED {
          const code_20: string;
          export { code_20 as code };
          const message_20: string;
          export { message_20 as message };
          const pattern_2: RegExp;
          export { pattern_2 as pattern };
          const lhrRuntimeError_15: boolean;
          export { lhrRuntimeError_15 as lhrRuntimeError };
      }
      export namespace INVALID_URL {
          const code_21: string;
          export { code_21 as code };
          const message_21: string;
          export { message_21 as message };
      }
      export namespace PROTOCOL_TIMEOUT {
          const code_22: string;
          export { code_22 as code };
          const message_22: string;
          export { message_22 as message };
          const lhrRuntimeError_16: boolean;
          export { lhrRuntimeError_16 as lhrRuntimeError };
      }
      export namespace DNS_FAILURE {
          const code_23: string;
          export { code_23 as code };
          const message_23: string;
          export { message_23 as message };
          const lhrRuntimeError_17: boolean;
          export { lhrRuntimeError_17 as lhrRuntimeError };
      }
  }
}
