// The requests the editor frame makes of the worker. Types only: both sides `import type` it.

/** Orca never tells an editor which file it shows, so the frame describes the text instead. */
export type LocateInput = {
  /** `workspace.readContext` of the focused workspace, when the frame could read it. */
  context: { branch: string; displayName: string } | null
  /** Git blob ids of the text under each line-ending and BOM variant it may be stored as. */
  blobIds: string[]
  /** Blob id of the text with LF line endings and no BOM: what changed files are compared by. */
  canonicalId: string
}

export type FileMatch = {
  /** Absolute path of the workspace root. */
  root: string
  workspaceName: string
  /** Path inside the workspace, with forward slashes. */
  path: string
  /** `committed`: the text equals what git has; `changed`: it has uncommitted edits or is new. */
  state: 'committed' | 'changed'
}

export type LocateOutput = { matches: FileMatch[] }

/** A revision of one file: where a commit's change to it can be diffed from. */
export type FileRevision = { sha: string; path: string }

export type BlameCommit = {
  /** Forty zeros for lines that are not committed yet. */
  sha: string
  author: string
  mail: string
  /** Seconds since the epoch. */
  time: number
  summary: string
  /** The file's path in this commit: it differs from today's after a rename. */
  path: string
  /** The revision this commit changed the file from; null when the commit added the file. */
  previous: FileRevision | null
}

export type BlameInput = { root: string; path: string }

export type BlameOutput = {
  commits: BlameCommit[]
  /** One entry per line of the file: an index into `commits`. */
  lines: number[]
  /** One entry per line of the file: the line's number (from 1) in its commit's version. */
  sourceLines: number[]
}

/** What one commit did to one line, cut down to the lines around it. */
export type LineChange = {
  removed: string[]
  added: string[]
  /** Index in `added` of the line asked about. */
  focus: number
  /** Index in `removed` of the line it replaced; null when it was inserted new. */
  removedFocus: number | null
  /** Lines of the same hunk left out of `removed` and `added`. */
  hiddenRemoved: number
  hiddenAdded: number
  /** The line (from 1) this one replaced in the parent revision; null when it was inserted new. */
  previousLine: number | null
}

/** One commit's version of a line: `line` counts from 1 in `commit.path` at `commit.sha`. */
export type DetailInput = { root: string; commit: Pick<BlameCommit, 'sha' | 'path' | 'previous'>; line: number }

export type DetailOutput = {
  /** The whole commit message. */
  message: string
  /** Null when the commit's diff does not touch the line (a merge can attribute it so). */
  change: LineChange | null
}

/** Who last changed line `line` of `path` as of revision `sha`. */
export type LineBlameInput = { root: string; revision: FileRevision; line: number }
export type LineBlameOutput = { commit: BlameCommit; sourceLine: number }

/** One commit that changed a line; `sourceLine` counts from 1 in `commit.path` at `commit.sha`. */
export type HistoryEntry = { commit: BlameCommit; sourceLine: number }
/** Every commit that changed line `line` of `revision`, that revision's own first, then older ones. */
export type HistoryInput = { root: string; revision: FileRevision; line: number }
export type HistoryOutput = { entries: HistoryEntry[] }

declare module 'orca' {
  interface PluginRequests {
    locate: { input: LocateInput; output: LocateOutput }
    blame: { input: BlameInput; output: BlameOutput }
    detail: { input: DetailInput; output: DetailOutput }
    lineBlame: { input: LineBlameInput; output: LineBlameOutput }
    history: { input: HistoryInput; output: HistoryOutput }
  }
}
