import { type Config } from '@pnpm/config'
import { logger } from '@pnpm/logger'
import { type IncludedDependencies, type Project } from '@pnpm/types'
import { render } from './list'

export async function listRecursive(
  pkgs: Project[],
  params: string[],
  opts: Pick<Config, 'lockfileDir'> & {
    depth?: number
    include: IncludedDependencies
    long?: boolean
    parseable?: boolean
    lockfileDir?: string
  }
) {
  const depth = opts.depth ?? 0
  if (opts.lockfileDir) {
    return render(
      pkgs.map((pkg) => pkg.dir),
      params,
      {
        ...opts,
        alwaysPrintRootPackage: depth === -1,
        lockfileDir: opts.lockfileDir,
      }
    )
  }
  const outputs = (
    await Promise.all(
      pkgs.map(async ({ dir }) => {
        try {
          return await render([dir], params, {
            ...opts,
            alwaysPrintRootPackage: depth === -1,
            lockfileDir: opts.lockfileDir ?? dir,
          })
    } catch (err: any) { // eslint-disable-line
          logger.info(err)
          err.prefix = dir
          throw err
        }
      })
    )
  ).filter(Boolean)
  if (outputs.length === 0) return ''

  const joiner = typeof depth === 'number' && depth > -1 ? '\n\n' : '\n'
  return outputs.join(joiner)
}
