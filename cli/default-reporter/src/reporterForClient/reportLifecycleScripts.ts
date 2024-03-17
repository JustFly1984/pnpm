import cliTruncate from 'cli-truncate'
import path from 'path'
import { type LifecycleLog } from '@pnpm/core-loggers'
import * as Rx from 'rxjs'
import {
  buffer,
  filter,
  groupBy,
  map,
  mergeAll,
  mergeMap,
} from 'rxjs/operators'
import chalk from 'chalk'
import prettyTime from 'pretty-ms'
import { EOL } from '../constants'
import { formatPrefix, formatPrefixNoTrim } from './utils/formatPrefix'
import { hlValue } from './outputConstants'

const NODE_MODULES = `${path.sep}node_modules${path.sep}`
const TMP_DIR_IN_STORE = `tmp${path.sep}_tmp_` // git-hosted dependencies are built in these temporary directories

// When streaming processes are spawned, use this color for prefix
const colorWheel = ['cyan', 'magenta', 'blue', 'yellow', 'green', 'red']
const NUM_COLORS = colorWheel.length

// Ever-increasing index ensures colors are always sequential
let currentColor = 0

type ColorByPkg = Map<string, (txt: string) => string>

export function reportLifecycleScripts(
  log$: {
    lifecycle: Rx.Observable<LifecycleLog>
  },
  opts: {
    appendOnly?: boolean
    aggregateOutput?: boolean
    hideLifecyclePrefix?: boolean
    cwd: string
    width: number
  }
) {
  // When the reporter is not append-only, the length of output is limited
  // in order to reduce flickering
  if (opts.appendOnly) {
    let lifecycle$ = log$.lifecycle
    if (opts.aggregateOutput) {
      lifecycle$ = lifecycle$.pipe(aggregateOutput)
    }

    const streamLifecycleOutput = createStreamLifecycleOutput(
      opts.cwd,
      !!opts.hideLifecyclePrefix
    )
    return lifecycle$.pipe(
      map((log: LifecycleLog) =>
        Rx.of({
          msg: streamLifecycleOutput(log),
        })
      )
    )
  }
  const lifecycleMessages: {
    [depPath: string]: {
      collapsed: boolean
      output: string[]
      script: string
      startTime: [number, number]
      status: string
    }
  } = {}
  const lifecycleStreamByDepPath: {
    [depPath: string]: Rx.Subject<{ msg: string }>
  } = {}
  const lifecyclePushStream = new Rx.Subject<Rx.Observable<{ msg: string }>>()

  // TODO: handle promise of .forEach?!
  log$.lifecycle.forEach((log: LifecycleLog) => {
    const key = `${log.stage}:${log.depPath}`
    lifecycleMessages[key] = lifecycleMessages[key] || {
      collapsed:
        log.wd.includes(NODE_MODULES) || log.wd.includes(TMP_DIR_IN_STORE),
      output: [],
      startTime: process.hrtime(),
      status: formatIndentedStatus(chalk.magentaBright('Running...')),
    }
    const exit = 'exitCode' in log && typeof log.exitCode === 'number'
    const msg: string = lifecycleMessages[key].collapsed
      ? renderCollapsedScriptOutput(log, lifecycleMessages[key], {
          cwd: opts.cwd, // eslint-disable-line @stylistic/ts/indent
          exit, // eslint-disable-line @stylistic/ts/indent
          maxWidth: opts.width, // eslint-disable-line @stylistic/ts/indent
        }) // eslint-disable-line @stylistic/ts/indent
      : renderScriptOutput(log, lifecycleMessages[key], {
          cwd: opts.cwd, // eslint-disable-line @stylistic/ts/indent
          exit, // eslint-disable-line @stylistic/ts/indent
          maxWidth: opts.width, // eslint-disable-line @stylistic/ts/indent
        }) // eslint-disable-line @stylistic/ts/indent
    if (exit) {
      delete lifecycleMessages[key]
    }
    if (!lifecycleStreamByDepPath[key]) {
      lifecycleStreamByDepPath[key] = new Rx.Subject<{ msg: string }>()
      lifecyclePushStream.next(Rx.from(lifecycleStreamByDepPath[key]))
    }
    lifecycleStreamByDepPath[key].next({ msg })
    if (exit) {
      lifecycleStreamByDepPath[key].complete()
    }
  })

  return Rx.from(lifecyclePushStream)
}

function toNano(time: [number, number]) {
  return (time[0] + time[1] / 1e9) * 1e3
}

function renderCollapsedScriptOutput(
  log: LifecycleLog,
  messageCache: {
    collapsed: boolean
    label?: string
    output: string[]
    script: string
    startTime: [number, number]
    status: string
  },
  opts: {
    cwd: string
    exit: boolean
    maxWidth: number
  }
) {
  if (!messageCache.label) {
    messageCache.label = highlightLastFolder(
      formatPrefixNoTrim(opts.cwd, log.wd)
    )
    if (log.wd.includes(TMP_DIR_IN_STORE)) {
      messageCache.label += ` [${log.depPath}]`
    }
    messageCache.label += `: Running ${log.stage} script`
  }
  if (!opts.exit) {
    updateMessageCache(log, messageCache, opts)
    return `${messageCache.label}...`
  }
  const time = prettyTime(toNano(process.hrtime(messageCache.startTime)))
  if ('exitCode' in log && log.exitCode === 0) {
    return `${messageCache.label}, done in ${time}`
  }
  if ('optional' in log && log.optional === true) {
    return `${messageCache.label}, failed in ${time} (skipped as optional)`
  }
  return `${messageCache.label}, failed in ${time}${EOL}${renderScriptOutput(log, messageCache, opts)}`
}

function renderScriptOutput(
  log: LifecycleLog,
  messageCache: {
    collapsed: boolean
    output: string[]
    script: string
    startTime: [number, number]
    status: string
  },
  opts: {
    cwd: string
    exit: boolean
    maxWidth: number
  }
) {
  updateMessageCache(log, messageCache, opts)
  if (opts.exit && 'exitCode' in log && log.exitCode !== 0) {
    return [
      messageCache.script,
      ...messageCache.output,
      messageCache.status,
    ].join(EOL)
  }
  if (messageCache.output.length > 10) {
    return [
      messageCache.script,
      `[${messageCache.output.length - 10} lines collapsed]`,
      ...messageCache.output.slice(messageCache.output.length - 10),
      messageCache.status,
    ].join(EOL)
  }
  return [
    messageCache.script,
    ...messageCache.output,
    messageCache.status,
  ].join(EOL)
}

function updateMessageCache(
  log: LifecycleLog,
  messageCache: {
    collapsed: boolean
    output: string[]
    script: string
    startTime: [number, number]
    status: string
  },
  opts: {
    cwd: string
    exit: boolean
    maxWidth: number
  }
) {
  if ('script' in log && typeof log.script === 'string') {
    const prefix = `${formatPrefix(opts.cwd, log.wd)} ${hlValue(log.stage)}`
    const maxLineWidth =
      opts.maxWidth - prefix.length - 2 + ANSI_ESCAPES_LENGTH_OF_PREFIX
    messageCache.script = `${prefix}$ ${cutLine(log.script, maxLineWidth)}`
  } else if (opts.exit) {
    const time = prettyTime(toNano(process.hrtime(messageCache.startTime)))
    if ('exitCode' in log && log.exitCode === 0) {
      messageCache.status = formatIndentedStatus(
        chalk.magentaBright(`Done in ${time}`)
      )
    } else {
      messageCache.status = formatIndentedStatus(
        chalk.red(`Failed in ${time} at ${log.wd}`)
      )
    }
  } else {
    messageCache.output.push(formatIndentedOutput(opts.maxWidth, log))
  }
}

function formatIndentedStatus(status: string) {
  return `${chalk.magentaBright('└─')} ${status}`
}

function highlightLastFolder(p: string) {
  const lastSlash = p.lastIndexOf('/') + 1
  return `${chalk.gray(p.slice(0, lastSlash))}${p.slice(lastSlash)}`
}

const ANSI_ESCAPES_LENGTH_OF_PREFIX = hlValue(' ').length - 1

function createStreamLifecycleOutput(
  cwd: string,
  hideLifecyclePrefix: boolean
) {
  currentColor = 0
  const colorByPrefix: ColorByPkg = new Map()
  return streamLifecycleOutput.bind(
    null,
    colorByPrefix,
    cwd,
    hideLifecyclePrefix
  )
}

function streamLifecycleOutput(
  colorByPkg: ColorByPkg,
  cwd: string,
  hideLifecyclePrefix: boolean,
  logObj: LifecycleLog
) {
  const prefix = formatLifecycleScriptPrefix(
    colorByPkg,
    cwd,
    logObj.wd,
    logObj.stage
  )
  if ('exitCode' in logObj && typeof logObj.exitCode === 'number') {
    if (logObj.exitCode === 0) {
      return `${prefix}: Done`
    } else {
      return `${prefix}: Failed`
    }
  }
  if ('script' in logObj && typeof logObj.script === 'string') {
    return `${prefix}$ ${logObj.script}`
  }
  const line = formatLine(Infinity, logObj)
  return hideLifecyclePrefix ? line : `${prefix}: ${line}`
}

function formatIndentedOutput(maxWidth: number, logObj: LifecycleLog) {
  return `${chalk.magentaBright('│')} ${formatLine(maxWidth - 2, logObj)}`
}

function formatLifecycleScriptPrefix(
  colorByPkg: ColorByPkg,
  cwd: string,
  wd: string,
  stage: string
) {
  if (!colorByPkg.has(wd)) {
    const colorName = colorWheel[currentColor % NUM_COLORS]
    colorByPkg.set(wd, chalk[colorName])
    currentColor += 1
  }

  const color = colorByPkg.get(wd)!
  return `${color(formatPrefix(cwd, wd))} ${hlValue(stage)}`
}

function formatLine(maxWidth: number, logObj: LifecycleLog) {
  const line = cutLine(
    'line' in logObj && typeof logObj.line === 'string' ? logObj.line : '',
    maxWidth
  )

  // TODO: strip only the non-color/style ansi escape codes
  if ('stdio' in logObj && logObj.stdio === 'stderr') {
    return chalk.gray(line)
  }
  return line
}

function cutLine(line: string, maxLength: number) {
  if (!line) return '' // This actually should never happen but it is better to be safe
  return cliTruncate(line, maxLength)
}

function aggregateOutput(source: Rx.Observable<LifecycleLog>) {
  return source.pipe(
    // The '\0' is a null character which delimits these strings. This works since JS doesn't use
    // null-terminated strings.
    groupBy((data) => `${data.depPath}\0${data.stage}`),
    mergeMap((group) => {
      return group.pipe(buffer(group.pipe(filter((msg) => 'exitCode' in msg))))
    }),
    map((ar) => Rx.from(ar)),
    mergeAll()
  )
}
