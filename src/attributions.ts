import { FrameInfo } from './frames';

// A "trigger" is an event that causes code to run - for example, a timer
// firing, or an event handler. We represent them as a string so that we can
// treat whatever might be interesting as a trigger.
export type Trigger = string;

// Things associated with all kinds of task attributions.
export type BaseAttribution = {
  // True if we know that this task is an attribution root. That means that the
  // task has no ancestors with the same attribution; it's the entry point to a
  // subtree with that attribution.
  isRoot: boolean;

  // Lighthouse's opinion as to the task's attribtion.
  lighthouseAttributableURLs: string[];

  // Triggers for the task.
  triggers: Trigger[];
};

// An unknown attribution, for tasks where we don't know much.
export type UnknownAttribution = {
  kind: 'unknown';
} & BaseAttribution;

// A file (or URL; we treat them as the same) level attribution, for tasks which
// can be tied to a script but not to a specific source code position.
export type FileAttribution = {
  kind: 'file';
  url: string;
} & BaseAttribution;

// A source location attribution, for tasks which are tied to a specific source
// code position. The actual location information is stored in fields from
// FrameInfo; the rest is metadata.
export type SourceAttribution = {
  kind: 'sourceLocation';

  // If we were able to use a source map to make this attribution point to the
  // original source position, we'll store the generated position that we
  // started with here.
  generated?: FrameInfo;

  // If we were able to pull the relevant lines of source code out of the
  // original file, we'll store it here.
  sourceLines?: string[];
} & FrameInfo & BaseAttribution;

export type AttributionInfo =
  UnknownAttribution |
  FileAttribution |
  SourceAttribution;

export type HasAttributionInfo = {
  attributionInfo: AttributionInfo;
};

// Compute a string id for an attribution, useful as a map or set key.
export function attributionId(info: AttributionInfo): string {
  switch (info.kind) {
    case 'sourceLocation':
      return `${info.kind}#${info.url}#${info.columnNumber}#${info.lineNumber}`;

    case 'file':
      return `${info.kind}#${info.url}`;

    case 'unknown':
      return `${info.kind}`;

    default:
      const unknown: never = info;
      throw new Error(`Unexpected attribution kind: ${JSON.stringify(unknown)}`);
  }
}

// Given a script URL substring, returns true if the provided attribution
// matches that script URL.
export function isAttributedTo(
  info: AttributionInfo,
  scriptUrlPattern: string,
  lineNumber?: number
): boolean {
  if (info.kind === 'sourceLocation') {
    if (info.url.includes(scriptUrlPattern)) {
      if (lineNumber === undefined) { return true; }
      if (info.lineNumber === lineNumber) { return true; }
    }

    const generated = info.generated;
    if (generated && generated.url.includes(scriptUrlPattern)) {
      if (lineNumber === undefined) { return true; }
      if (generated.lineNumber === lineNumber) { return true; }
    }
  }

  // If a line number was specified, we can only match source locations.
  if (lineNumber !== undefined) { return false; }

  if (info.kind === 'file') {
    if (info.url.includes(scriptUrlPattern)) { return true; }
  }

  for (const url of info.lighthouseAttributableURLs) {
    if (url.includes(scriptUrlPattern)) { return true; }
  }

  return false;
}
