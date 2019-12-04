declare module 'lighthouse' {
  global {
    module LH {
      /** Simulation settings that control the amount of network & cpu throttling in the run. */
      interface ThrottlingSettings {
        /** The round trip time in milliseconds. */
        rttMs?: number;
        /** The network throughput in kilobits per second. */
        throughputKbps?: number;
        // devtools settings
        /** The network request latency in milliseconds. */
        requestLatencyMs?: number;
        /** The network download throughput in kilobits per second. */
        downloadThroughputKbps?: number;
        /** The network upload throughput in kilobits per second. */
        uploadThroughputKbps?: number;
        // used by both
        /** The amount of slowdown applied to the cpu (1/<cpuSlowdownMultiplier>). */
        cpuSlowdownMultiplier?: number
      }

      export interface PrecomputedLanternData {
        additionalRttByOrigin: {[origin: string]: number};
        serverResponseTimeByOrigin: {[origin: string]: number};
      }

      export type Locale = 'en-US'|'en'|'en-AU'|'en-GB'|'en-IE'|'en-SG'|'en-ZA'|'en-IN'|'ar-XB'|'ar'|'bg'|'bs'|'ca'|'cs'|'da'|'de'|'el'|'en-XA'|'en-XL'|'es'|'es-419'|'es-AR'|'es-BO'|'es-BR'|'es-BZ'|'es-CL'|'es-CO'|'es-CR'|'es-CU'|'es-DO'|'es-EC'|'es-GT'|'es-HN'|'es-MX'|'es-NI'|'es-PA'|'es-PE'|'es-PR'|'es-PY'|'es-SV'|'es-US'|'es-UY'|'es-VE'|'fi'|'fil'|'fr'|'he'|'hi'|'hr'|'hu'|'gsw'|'id'|'in'|'it'|'iw'|'ja'|'ko'|'ln'|'lt'|'lv'|'mo'|'nl'|'nb'|'no'|'pl'|'pt'|'pt-PT'|'ro'|'ru'|'sk'|'sl'|'sr'|'sr-Latn'|'sv'|'ta'|'te'|'th'|'tl'|'tr'|'uk'|'vi'|'zh'|'zh-HK'|'zh-TW';

      export type OutputMode = 'json' | 'html' | 'csv';

      /**
       * Options that are found in both the flags used by the Lighthouse module
       * interface and the Config's `settings` object.
       */
      interface SharedFlagsSettings {
        /** The type(s) of report output to be produced. */
        output?: OutputMode|OutputMode[];
        /** The locale to use for the output. */
        locale?: Locale;
        /** The maximum amount of time to wait for a page content render, in ms. If no content is rendered within this limit, the run is aborted with an error. */
        maxWaitForFcp?: number;
        /** The maximum amount of time to wait for a page to load, in ms. */
        maxWaitForLoad?: number;
        /** List of URL patterns to block. */
        blockedUrlPatterns?: string[] | null;
        /** Comma-delimited list of trace categories to include. */
        additionalTraceCategories?: string | null;
        /** Flag indicating the run should only audit. */
        auditMode?: boolean | string;
        /** Flag indicating the run should only gather. */
        gatherMode?: boolean | string;
        /** Flag indicating that the browser storage should not be reset for the audit. */
        disableStorageReset?: boolean;
        /** The form factor the emulation should use. */
        emulatedFormFactor?: 'mobile'|'desktop'|'none';
        /** The method used to throttle the network. */
        throttlingMethod?: 'devtools'|'simulate'|'provided';
        /** The throttling config settings. */
        throttling?: ThrottlingSettings;
        /** If present, the run should only conduct this list of audits. */
        onlyAudits?: string[] | null;
        /** If present, the run should only conduct this list of categories. */
        onlyCategories?: string[] | null;
        /** If present, the run should skip this list of audits. */
        skipAudits?: string[] | null;
        /** How Lighthouse was run, e.g. from the Chrome extension or from the npm module */
        channel?: string
        /** Precomputed lantern estimates to use instead of observed analysis. */
        precomputedLanternData?: PrecomputedLanternData | null;
      }

      /**
       * Extends the flags in SharedFlagsSettings with flags used to configure the
       * Lighthouse module but will not end up in the Config settings.
       */
      export interface Flags extends SharedFlagsSettings {
        /** The port to use for the debugging protocol, if manually connecting. */
        port?: number;
        /** The hostname to use for the debugging protocol, if manually connecting. */
        hostname?: string;
        /** The level of logging to enable. */
        logLevel?: 'silent'|'error'|'info'|'verbose';
        /** The path to the config JSON. */
        configPath?: string;
        /** Run the specified plugins. */
        plugins?: string[];
      }

      /**
       * Extends the flags accepted by the Lighthouse module with additional flags
       * used just for controlling the CLI.
       */
      export interface CliFlags extends Flags {
        _: string[];
        chromeFlags: string;
        /** Output path for the generated results. */
        outputPath: string;
        /** Flag to save the trace contents and screenshots to disk. */
        saveAssets: boolean;
        /** Flag to open the report immediately. */
        view: boolean;
        /** Flag to enable error reporting. */
        enableErrorReporting?: boolean;
        /** Flag to print a list of all audits + categories. */
        listAllAudits: boolean;
        /** Flag to print a list of all required trace categories. */
        listTraceCategories: boolean;
        /** A preset audit of selected audit categories to run. */
        preset?: 'full'|'mixed-content'|'perf';
        /** A flag to enable logLevel 'verbose'. */
        verbose: boolean;
        /** A flag to enable logLevel 'silent'. */
        quiet: boolean;
        /** A flag to print the normalized config for the given config and options, then exit. */
        printConfig: boolean;
        /** Path to the file where precomputed lantern data should be read from. */
        precomputedLanternDataPath?: string;
        /** Path to the file where precomputed lantern data should be written to. */
        lanternDataOutputPath?: string;
        /** Path to the budget.json file for LightWallet. */
        budgetPath?: string | null;

        // The following are given defaults in cli-flags, so are not optional like in Flags or SharedFlagsSettings.
        output: OutputMode[];
        port: number;
        hostname: string;
      }

      export interface ReportCategory {
        name: string;
        description: string;
        audits: ReportAudit[];
      }

      export interface ReportAudit {
        id: string;
        weight: number;
        group: string;
      }

      export interface Trace {
        traceEvents: TraceEvent[];
        metadata?: {
          'cpu-family'?: number;
        };
        [futureProps: string]: any;
      }

      export type StackFrame = {
        url: string;
        functionName: string | undefined;
        lineNumber: number;
        columnNumber: number;
      };

      /**
       * @see https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
       */
      export interface TraceEvent {
        name: string;
        cat: string;
        args: {
          fileName?: string;
          snapshot?: string;
          beginData?: {
            stackTrace?: StackFrame[];
          };
          data?: {
            id?: number;
            isLoadingMainFrame?: boolean;
            documentLoaderURL?: string;
            frame?: string;
            frames?: {
              frame: string;
              parent?: string;
              processId?: number;
            }[];
            page?: string;
            readyState?: number;
            requestId?: string;
            stackTrace?: StackFrame[];
            styleSheetUrl?: string;
            timerId?: string;
            type?: string;
            fileName?: string;
            url?: string;
            functionName?: string;
            lineNumber?: number;
            columnNumber?: number;
          };
          frame?: string;
          name?: string;
          labels?: string;
        };
        pid: number;
        tid: number;
        ts: number;
        dur: number;
        ph: 'B'|'b'|'D'|'E'|'e'|'F'|'I'|'M'|'N'|'n'|'O'|'R'|'S'|'T'|'X';
        s?: 't';
        id?: string;
      }

      export interface DevToolsJsonTarget {
        description: string;
        devtoolsFrontendUrl: string;
        id: string;
        title: string;
        type: string;
        url: string;
        webSocketDebuggerUrl: string;
      }

      module Artifacts {
        export interface Accessibility {
          violations: {
            id: string;
            impact: string;
            tags: string[];
            nodes: {
              path: string;
              html: string;
              snippet: string;
              target: string[];
              failureSummary?: string;
              nodeLabel?: string;
            }[];
          }[];
          notApplicable: {
            id: string
          }[];
        }

        export interface Doctype {
          name: string;
          publicId: string;
          systemId: string;
        }

        export interface DOMStats {
          /** The total number of elements found within the page's body. */
          totalBodyElements: number;
          width: {max: number, pathToElement: Array<string>, snippet: string};
          depth: {max: number, pathToElement: Array<string>, snippet: string};
        }

        export interface EmbeddedContentInfo {
          tagName: string;
          type: string | null;
          src: string | null;
          data: string | null;
          code: string | null;
          params: {name: string; value: string}[];
        }

        export interface IFrameElement {
          /** The `id` attribute of the iframe. */
          id: string,
          /** The `src` attribute of the iframe. */
          src: string,
          /** The iframe's ClientRect. @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect */
          clientRect: {
            top: number;
            bottom: number;
            left: number;
            right: number;
            width: number;
            height: number;
          },
          /** If the iframe or an ancestor of the iframe is fixed in position. */
          isPositionFixed: boolean,
        }

        /** @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link#Attributes */
        export interface LinkElement {
          /** The `rel` attribute of the link, normalized to lower case. @see https://developer.mozilla.org/en-US/docs/Web/HTML/Link_types */
          rel: 'alternate'|'canonical'|'dns-prefetch'|'preconnect'|'preload'|'stylesheet'|string;
          /** The `href` attribute of the link or `null` if it was invalid in the header. */
          href: string | null
          /** The raw value of the `href` attribute. Only different from `href` when source is 'header' */
          hrefRaw: string
          /** The `hreflang` attribute of the link */
          hreflang: string
          /** The `as` attribute of the link */
          as: string
          /** The `crossOrigin` attribute of the link */
          crossOrigin: string | null
          /** Where the link was found, either in the DOM or in the headers of the main document */
          source: 'head'|'body'|'headers'
        }

        export interface ScriptElement {
          type: string | null
          src: string | null
          /** The `id` property of the script element; null if it had no `id` or if `source` is 'network'. */
          id: string | null
          async: boolean
          defer: boolean
          /** Path that uniquely identifies the node in the DOM */
          devtoolsNodePath: string;
          /** Where the script was discovered, either in the head, the body, or network records. */
          source: 'head'|'body'|'network'
          /** The content of the inline script or the network record with the matching URL, null if the script had a src and no network record could be found. */
          content: string | null
          /** The ID of the network request that matched the URL of the src or the main document if inline, null if no request could be found. */
          requestId: string | null
        }

        /** @see https://sourcemaps.info/spec.html#h.qz3o9nc69um5 */
        export type RawSourceMap = {
          /** File version and must be a positive integer. */
          version: number
          /** A list of original source files used by the `mappings` entry. */
          sources: string[]
          /** A list of symbol names used by the `mappings` entry. */
          names?: string[]
          /** An optional source root, useful for relocating source files on a server or removing repeated values in the `sources` entry. This value is prepended to the individual entries in the `source` field. */
          sourceRoot?: string
          /** An optional list of source content, useful when the `source` can’t be hosted. The contents are listed in the same order as the sources. */
          sourcesContent?: string[]
          /** A string with the encoded mapping data. */
          mappings: string
          /** An optional name of the generated code (the bundled code that was the result of this build process) that this source map is associated with. */
          file?: string
        }

        /**
         * Source map for a given script found at scriptUrl. If there is an error in fetching or
         * parsing the map, errorMessage will be defined instead of map.
         */
        export type SourceMap = {
          /** URL of code that source map applies to. */
          scriptUrl: string
          /** URL of the source map. undefined if from data URL. */
          sourceMapUrl?: string
          /** Source map data structure. */
          map: RawSourceMap
        } | {
          /** URL of code that source map applies to. */
          scriptUrl: string
          /** URL of the source map. undefined if from data URL. */
          sourceMapUrl?: string
          /** Error that occurred during fetching or parsing of source map. */
          errorMessage: string
          /** No map on account of error. */
          map?: undefined;
        }

        /** @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a#Attributes */
        export interface AnchorElement {
          rel: string
          href: string
          text: string
          target: string
          outerHTML: string
        }

        export interface Font {
          display: string;
          family: string;
          featureSettings: string;
          stretch: string;
          style: string;
          unicodeRange: string;
          variant: string;
          weight: string;
          src?: string[];
        }

        export interface ImageElement {
          src: string;
          /** The displayed width of the image, uses img.width when available falling back to clientWidth. See https://codepen.io/patrickhulce/pen/PXvQbM for examples. */
          displayedWidth: number;
          /** The displayed height of the image, uses img.height when available falling back to clientHeight. See https://codepen.io/patrickhulce/pen/PXvQbM for examples. */
          displayedHeight: number;
          /** The natural width of the underlying image, uses img.naturalWidth. See https://codepen.io/patrickhulce/pen/PXvQbM for examples. */
          naturalWidth: number;
          /** The natural height of the underlying image, uses img.naturalHeight. See https://codepen.io/patrickhulce/pen/PXvQbM for examples. */
          naturalHeight: number;
          /** The BoundingClientRect of the element. */
          clientRect: {
            top: number;
            bottom: number;
            left: number;
            right: number;
          };
          /** Flags whether this element was an image via CSS background-image rather than <img> tag. */
          isCss: boolean;
          /** Flags whether this element was contained within a <picture> tag. */
          isPicture: boolean;
          /** Flags whether this element was sized using a non-default `object-fit` CSS property. */
          usesObjectFit: boolean;
          /** The size of the underlying image file in bytes. 0 if the file could not be identified. */
          resourceSize: number;
          /** The MIME type of the underlying image file. */
          mimeType?: string;
        }

        export interface OptimizedImage {
          failed: false;
          originalSize: number;
          jpegSize?: number;
          webpSize?: number;

          requestId: string;
          url: string;
          mimeType: string;
          resourceSize: number;
        }

        export interface OptimizedImageError {
          failed: true;
          errMsg: string;

          requestId: string;
          url: string;
          mimeType: string;
          resourceSize: number;
        }

        export interface TagBlockingFirstPaint {
          startTime: number;
          endTime: number;
          transferSize: number;
          tag: {
            tagName: string;
            url: string;
          };
        }

        export interface Rect {
          width: number;
          height: number;
          top: number;
          right: number;
          bottom: number;
          left: number;
        }

        export interface TapTarget {
          snippet: string;
          selector: string;
          nodeLabel?: string;
          path: string;
          href: string;
          clientRects: Rect[];
        }

        export interface ViewportDimensions {
          innerWidth: number;
          innerHeight: number;
          outerWidth: number;
          outerHeight: number;
          devicePixelRatio: number;
        }

        export type ManifestValueCheckID = 'hasStartUrl'|'hasIconsAtLeast192px'|'hasIconsAtLeast512px'|'hasPWADisplayValue'|'hasBackgroundColor'|'hasThemeColor'|'hasShortName'|'hasName'|'shortNameLength';

        export type ManifestValues = {
          isParseFailure: false;
          allChecks: {
            id: ManifestValueCheckID;
            failureText: string;
            passing: boolean;
          }[];
        } | {
          isParseFailure: true;
          parseFailureReason: string;
          allChecks: {
            id: ManifestValueCheckID;
            failureText: string;
            passing: boolean;
          }[];
        }

        export interface MeasureEntry {
          // From PerformanceEntry
          readonly duration: number;
          readonly entryType: string;
          readonly name: string;
          readonly startTime: number;
          /** Whether timing entry was collected during artifact gathering. */
          gather?: boolean;
        }

        export interface Metric {
          timing: number;
          timestamp?: number;
        }

        export interface NetworkAnalysis {
          rtt: number;
          additionalRttByOrigin: Map<string, number>;
          serverResponseTimeByOrigin: Map<string, number>;
          throughput: number;
        }

        export interface TraceTimes {
          navigationStart: number;
          firstPaint?: number;
          firstContentfulPaint: number;
          firstMeaningfulPaint?: number;
          largestContentfulPaint?: number;
          traceEnd: number;
          load?: number;
          domContentLoaded?: number;
        }

        export interface TraceOfTab {
          /** The raw timestamps of key metric events, in microseconds. */
          timestamps: TraceTimes;
          /** The relative times from navigationStart to key metric events, in milliseconds. */
          timings: TraceTimes;
          /** The subset of trace events from the page's process, sorted by timestamp. */
          processEvents: Array<TraceEvent>;
          /** The subset of trace events from the page's main thread, sorted by timestamp. */
          mainThreadEvents: Array<TraceEvent>;
          /** IDs for the trace's main frame, process, and thread. */
          mainFrameIds: {pid: number, tid: number, frameId: string};
          /** The trace event marking navigationStart. */
          navigationStartEvt: TraceEvent;
          /** The trace event marking firstPaint, if it was found. */
          firstPaintEvt?: TraceEvent;
          /** The trace event marking firstContentfulPaint, if it was found. */
          firstContentfulPaintEvt: TraceEvent;
          /** The trace event marking firstMeaningfulPaint, if it was found. */
          firstMeaningfulPaintEvt?: TraceEvent;
          /** The trace event marking largestContentfulPaint, if it was found. */
          largestContentfulPaintEvt?: TraceEvent;
          /** The trace event marking loadEventEnd, if it was found. */
          loadEvt?: TraceEvent;
          /** The trace event marking domContentLoadedEventEnd, if it was found. */
          domContentLoadedEvt?: TraceEvent;
          /**
           * Whether the firstMeaningfulPaintEvt was the definitive event or a fallback to
           * firstMeaningfulPaintCandidate events had to be attempted.
           */
          fmpFellBack: boolean;
          /** Whether LCP was invalidated without a new candidate. */
          lcpInvalidated: boolean;
        }

        /** Information on a tech stack (e.g. a JS library) used by the page. */
        export interface DetectedStack {
          /** The identifier for how this stack was detected. */
          detector: 'js';
          /** The unique string ID for the stack. */
          id: string;
          /** The name of the stack. */
          name: string;
          /** The version of the stack, if it could be detected. */
          version?: string;
          /** The package name on NPM, if it exists. */
          npm?: string;
        }
      }
    }
  }
}
