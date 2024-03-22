import renderHelp from 'render-help'

import { PnpmError } from '@pnpm/error'
import { docsUrl } from '@pnpm/cli-utils'
import type { NvmNodeCommandOptions } from '@pnpm/types'

import { envUse } from './envUse.js'
import { envAdd } from './envAdd.js'
import { envList } from './envList.js'
import { envRemove } from './envRemove.js'

export function rcOptionsTypes() {
  return {}
}

export function cliOptionsTypes(): {
  global: BooleanConstructor;
  remote: BooleanConstructor;
} {
  return {
    global: Boolean,
    remote: Boolean,
  }
}

export const commandNames = ['env']

export function help(): string {
  return renderHelp({
    description: 'Manage Node.js versions.',
    descriptionLists: [
      {
        title: 'Commands',
        list: [
          {
            description:
              'Installs the specified version of Node.js. The npm CLI bundled with the given Node.js version gets installed as well. This sets this version of Node.js as the current version.',
            name: 'use',
          },
          {
            description:
              'Installs the specified version(s) of Node.js without activating them as the current version.',
            name: 'add',
          },
          {
            description: 'Removes the specified version(s) of Node.js.',
            name: 'remove',
            shortAlias: 'rm',
          },
          {
            description: 'List Node.js versions available locally or remotely',
            name: 'list',
            shortAlias: 'ls',
          },
        ],
      },
      {
        title: 'Options',
        list: [
          {
            description: 'Manages Node.js versions globally',
            name: '--global',
            shortAlias: '-g',
          },
          {
            description: 'List the remote versions of Node.js',
            name: '--remote',
          },
        ],
      },
    ],
    url: docsUrl('env'),
    usages: [
      'pnpm env [command] [options] <version> [<additional-versions>...]',
      'pnpm env use --global 16',
      'pnpm env use --global lts',
      'pnpm env use --global argon',
      'pnpm env use --global latest',
      'pnpm env use --global rc/16',
      'pnpm env add --global 16',
      'pnpm env add --global 18 19 20.6.0',
      'pnpm env remove --global 16 lts',
      'pnpm env remove --global argon',
      'pnpm env remove --global latest',
      'pnpm env remove --global rc/16 16 20.6.0',
      'pnpm env list',
      'pnpm env list --remote',
      'pnpm env list --remote 16',
      'pnpm env list --remote lts',
      'pnpm env list --remote argon',
      'pnpm env list --remote latest',
      'pnpm env list --remote rc/16',
    ],
  })
}

export async function handler(opts: NvmNodeCommandOptions, params: string[]): Promise<string | {
  exitCode: number;
}> {
  if (params.length === 0) {
    throw new PnpmError('ENV_NO_SUBCOMMAND', 'Please specify the subcommand', {
      hint: help(),
    })
  }

  if (opts.global && !opts.bin) {
    throw new PnpmError(
      'CANNOT_MANAGE_NODE',
      'Unable to manage Node.js because pnpm was not installed using the standalone installation script',
      {
        hint: 'If you want to manage Node.js with pnpm, you need to remove any Node.js that was installed by other tools, then install pnpm using one of the standalone scripts that are provided on the installation page: https://pnpm.io/installation',
      }
    )
  }

  switch (params[0]) {
    case 'add': {
      return envAdd(opts, params.slice(1))
    }

    case 'use': {
      return envUse(opts, params.slice(1))
    }

    case 'remove':
    case 'rm':
    case 'uninstall':
    case 'un': {
      return envRemove(opts, params.slice(1))
    }

    case 'list':
    case 'ls': {
      return envList(opts, params.slice(1))
    }

    default: {
      throw new PnpmError(
        'ENV_UNKNOWN_SUBCOMMAND',
        'This subcommand is not known'
      )
    }
  }
}
