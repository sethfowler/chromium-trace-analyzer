# chromium-trace-analyzer

An analyzer for Chromium trace event files. You can get your hands on one of
these files by saving a profile from the Chrome developer tools or by saving a
trace from a Lighthouse audit. Given a trace, `chromium-trace-analyzer` can:
* Summarize it, so you can get the information you need quickly.
* Filter out irrelevant tasks and events, so you can focus on the information
  that's relevant to your code.
* Annotate tasks and events with source locations in more detail than the
  developer tools natively provide, so you can understand where your performance
  is going.

Source mapping and syntax highlighting are supported to help make the trace
summaries as readable as possible. Here's an example summary entry:

![Trace summary entry image](https://raw.githubusercontent.com/sethfowler/chromium-trace-analyzer/master/images/screenshot.png)


## Installation

```bash
npm install -g @sethfowler/chromium-trace-analyzer
```


## Usage

To get a quick summary of the hottest tasks in the trace:
```bash
chromium-trace-analyzer --trace profile.json
```

To see more tasks:
```bash
chromium-trace-analyzer --trace profile.json --top 20
```

To focus on tasks related to a specific script, use `--taskFilter` and pass a
substring of the script URL:
```bash
chromium-trace-analyzer --trace profile.json --taskFilter foo.js
```

To enable source maps, you need to specify three things:
* A substring of the script URL that you want the source map to apply to.
* The path to the source map file (.js.map) itself.
* The path to the root webpack source directory. This will be used to load the
  original source code itself and include relevant snippets in the output. (Only
  webpack's URL format is supported right now, unfortunately.)

You can pass that information on the command line via the colon-separated
`--sourceMap` option. So, if your source map setup looks like this:
* Script URL ending in `foo.js`.
* Source map file at `./dist/foo.js.map`.
* Root of the webpack source tree at `./src`.

Then you'd pass a `--sourceMap` option that looks like this:
```bash
chromium-trace-analyzer --trace profile.json --sourceMap foo.js:./dist/foo.js.map:./src
```

You can provide `--sourceMap` multiple times to apply as many source maps as you want.


## Advanced usage

`chromium-trace-analyzer` can generate an annotated JSON version of the trace
with more detailed attribution for tasks and events. If you enable task
filtering or source mapping on the command line, those transformations will be
applied to the annotated trace as well. To generate an annotated trace:
```bash
chromium-trace-analyzer --trace profile.json --outputJsonTrace out.json
```

It's also possible to generate an annotated JSON version of the summary that
`chromium-trace-analyzer` generates. It includes far more detail than the pretty
printed output. To generated an annotated summary:
```bash
chromium-trace-analyzer --trace profile.json --outputJsonSummary out.json
```

It can be handy to correlate entries in the summary with individual tasks and
events in the trace. You can do this by finding the `taskId`s listed in the JSON
summary entries and searching for them in the JSON trace. To make it easy to do
that in your editor, if you provide the same filename for both
`--outputJsonTrace` and `--outputJsonSummary`, both the summary and the trace
will be written to the same file. For example:
```bash
chromium-trace-analyzer \
  --trace profile.json \
  --outputJsonSummary out.json \
  --outputJsonTrace out.json
```
