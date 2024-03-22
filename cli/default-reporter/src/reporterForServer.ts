import chalk from 'chalk'
import type * as Rx from 'rxjs'

import type { Log, Config } from '@pnpm/types'

import { reportError } from './reportError.js'

export function reporterForServer(log$: Rx.Observable<Log>, config?: Config | undefined): Rx.Subscription {
  return log$.subscribe({
    complete: () => undefined,
    error: () => undefined,
    next(log) {
      if (log.name === 'pnpm:fetching-progress') {
        console.log(`${chalk.cyan(`fetching_${log.status}`)} ${log.packageId}`)

        return
      }

      switch (log.level) {
        case 'warn': {
          console.log(formatWarn(log.message))

          return
        }

        case 'error': {
          console.log(reportError(log, config))

          return
        }

        case 'debug': {
          return
        }

        default: {
          console.log(log.message)
        }
      }
    },
  })
}

function formatWarn(message: string): string {
  // The \u2009 is the "thin space" unicode character
  // It is used instead of ' ' because chalk (as of version 2.1.0)
  // trims whitespace at the beginning
  return `${chalk.bgYellow.black('\u2009WARN\u2009')} ${message}`
}
