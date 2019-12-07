import { DeepReadonly } from 'ts-essentials';

import { FrameInfo } from './frames';

// A "trigger" is an event that causes code to run - for example, a timer
// firing, or an event handler. We represent them as a string so that we can
// treat whatever might be interesting as a trigger.
export type Trigger = string;

// Attribution information that's context-specific - in other words, different
// nodes with the same attribution may have different values for these
// properties.
export type AttributionContext = {
  // True if this is a top-level task.
  isTopLevel: boolean;

  // True if we know that this task is an attribution root. That means that the
  // task has no ancestors with the same attribution; it's the entry point to a
  // subtree with that attribution.
  isAttributionRoot: boolean;

  // Lighthouse's opinion as to the task's attribtion.
  lighthouseAttributableURLs: string[];

  // Triggers for the task.
  triggers: Trigger[];
};

// An unknown attribution, for tasks where we don't know much.
export type UnknownAttribution = {
  kind: 'unknown';
};

// A file (or URL; we treat them as the same) level attribution, for tasks which
// can be tied to a script but not to a specific source code position.
export type FileAttribution = {
  kind: 'file';
  url: string;
};

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
} & FrameInfo;

type AnyMutableAttribution = UnknownAttribution | FileAttribution | SourceAttribution;
type AnyAttribution = DeepReadonly<AnyMutableAttribution>;

declare const AttributionTag: unique symbol;

// The attribution for an event or task. Every event or task with an identical
// attribution will have an identical value for these properties. These objects
// should be generated by an AttributionMap so that they interned and they can
// be compared by reference.
export type MutableAttribution = typeof AttributionTag & AnyMutableAttribution;
export type Attribution = typeof AttributionTag & AnyAttribution;

export type HasAttributionInfo = {
  attribution: Attribution;
  context: AttributionContext;
};

type AttributionId = string;

// Compute a string id for an attribution, useful as a map or set key.
export function attributionId(attr: AnyAttribution): AttributionId {
  switch (attr.kind) {
    case 'sourceLocation':
      return `${attr.kind}#${attr.url}#${attr.columnNumber}#${attr.lineNumber}`;

    case 'file':
      return `${attr.kind}#${attr.url}`;

    case 'unknown':
      return `${attr.kind}`;

    default:
      const unknown: never = attr;
      throw new Error(`Unexpected attribution kind: ${JSON.stringify(unknown)}`);
  }
}

export class AttributionMap {
  private _attributions = new Map<AttributionId, MutableAttribution>();

  create(value: AnyAttribution): Attribution {
    const id = attributionId(value);
    let attribution = this._attributions.get(id);
    if (!attribution) {
      attribution = value as MutableAttribution;
      this._attributions.set(id, attribution);
    }
    return attribution;
  }

  getById(id: AttributionId): Attribution | undefined {
    return this._attributions.get(id);
  }

  getByValue(value: AnyAttribution): Attribution | undefined {
    return this.getById(attributionId(value));
  }

  getMutableById(id: AttributionId): MutableAttribution | undefined {
    return this._attributions.get(id);
  }

  getMutableByValue(value: AnyAttribution): MutableAttribution | undefined {
    return this.getMutableById(attributionId(value));
  }

  entries(): IterableIterator<[AttributionId, Attribution]> {
    return this._attributions.entries();
  }

  mutableEntries(): IterableIterator<[AttributionId, MutableAttribution]> {
    return this._attributions.entries();
  }

  keys(): IterableIterator<AttributionId> {
    return this._attributions.keys();
  }

  values(): IterableIterator<Attribution> {
    return this._attributions.values();
  }

  mutableValues(): IterableIterator<MutableAttribution> {
    return this._attributions.values();
  }
}

export type HasAttributionMap = {
  attributionMap: AttributionMap;
};

// Given a script URL substring, returns true if the provided attribution
// matches that script URL.
export function isAttributedTo(
  attribution: Attribution,
  context: AttributionContext,
  scriptUrlPattern: string,
  lineNumber?: number
): boolean {
  if (attribution.kind === 'sourceLocation') {
    if (attribution.url.includes(scriptUrlPattern)) {
      if (lineNumber === undefined) { return true; }
      if (attribution.lineNumber === lineNumber) { return true; }
    }

    const generated = attribution.generated;
    if (generated && generated.url.includes(scriptUrlPattern)) {
      if (lineNumber === undefined) { return true; }
      if (generated.lineNumber === lineNumber) { return true; }
    }
  }

  // If a line number was specified, we can only match source locations.
  if (lineNumber !== undefined) { return false; }

  if (attribution.kind === 'file') {
    if (attribution.url.includes(scriptUrlPattern)) { return true; }
  }

  for (const url of context.lighthouseAttributableURLs) {
    if (url.includes(scriptUrlPattern)) { return true; }
  }

  return false;
}
