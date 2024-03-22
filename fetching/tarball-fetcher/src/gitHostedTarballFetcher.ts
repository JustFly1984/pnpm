import fs from 'node:fs/promises'

import renameOverwrite from 'rename-overwrite'
import { fastPathTemp as pathTemp } from 'path-temp'

import { globalWarn } from '@pnpm/logger'
import { addFilesFromDir } from '@pnpm/worker'
import { preparePackage } from '@pnpm/prepare-package'
import type { Cafs, FetchOptions, DependencyManifest, FetchResult } from '@pnpm/types'

type Resolution = {
  integrity?: string | undefined
  registry?: string | undefined
  tarball: string
}

export interface CreateGitHostedTarballFetcher {
  ignoreScripts?: boolean | undefined
  rawConfig: object
  unsafePerm?: boolean | undefined
}

export function createGitHostedTarballFetcher(
  fetchRemoteTarball: (cafs: Cafs, resolution: {
    tarball: string;
    integrity?: string | undefined;
    registry?: string | undefined;
  }, opts: FetchOptions) => Promise<FetchResult>,
  fetcherOpts: CreateGitHostedTarballFetcher
): (cafs: Cafs, resolution: Resolution, opts: FetchOptions) => Promise<{
    filesIndex: Record<string, string>;
    manifest: DependencyManifest | undefined;
  }> {
  return async function fetch(cafs: Cafs,
    resolution: Resolution,
    opts: FetchOptions): Promise<{
      filesIndex: Record<string, string>
      manifest: DependencyManifest | undefined
    }> {
    // This solution is not perfect but inside the fetcher we don't currently know the location
    // of the built and non-built index files.
    const nonBuiltIndexFile = fetcherOpts.ignoreScripts
      ? opts.filesIndexFile
      : pathTemp(opts.filesIndexFile)

    const { filesIndex, manifest } = await fetchRemoteTarball(
      cafs,
      resolution,
      {
        ...opts,
        filesIndexFile: nonBuiltIndexFile,
      }
    )

    try {
      const prepareResult = await prepareGitHostedPkg(
        filesIndex as Record<string, string>,
        cafs,
        nonBuiltIndexFile,
        opts.filesIndexFile,
        fetcherOpts,
        opts
      )

      if (prepareResult.ignoredBuild) {
        globalWarn(
          `The git-hosted package fetched from "${resolution.tarball}" has to be built but the build scripts were ignored.`
        )
      }

      return { filesIndex: prepareResult.filesIndex, manifest }
      } catch (err: any) { // eslint-disable-line
      err.message = `Failed to prepare git-hosted package fetched from "${resolution.tarball}": ${err.message}`
      throw err
    }
  }
}

async function prepareGitHostedPkg(
  filesIndex: Record<string, string>,
  cafs: Cafs,
  filesIndexFileNonBuilt: string,
  filesIndexFile: string,
  opts: CreateGitHostedTarballFetcher,
  fetcherOpts: FetchOptions
): Promise<{ filesIndex: Record<string, string>; ignoredBuild: boolean; } | { ignoredBuild: boolean; filesIndex: Record<string, string>; manifest: DependencyManifest; }> {
  const tempLocation = await cafs.tempDir()

  cafs.importPackage(tempLocation, {
    filesResponse: {
      filesIndex,
      resolvedFrom: 'remote',
    },
    force: true,
  })

  const shouldBeBuilt = await preparePackage(opts, tempLocation)

  if (!shouldBeBuilt) {
    if (filesIndexFileNonBuilt !== filesIndexFile) {
      await renameOverwrite(filesIndexFileNonBuilt, filesIndexFile)
    }

    return {
      filesIndex,
      ignoredBuild: false,
    }
  }

  if (opts.ignoreScripts) {
    return {
      filesIndex,
      ignoredBuild: true,
    }
  }

  try {
    // The temporary index file may be deleted
    await fs.unlink(filesIndexFileNonBuilt)
  } catch {}
  // Important! We cannot remove the temp location at this stage.
  // Even though we have the index of the package,
  // the linking of files to the store is in progress.
  return {
    ...(await addFilesFromDir({
      cafsDir: cafs.cafsDir,
      dir: tempLocation,
      filesIndexFile,
      pkg: fetcherOpts.pkg,
    })),
    ignoredBuild: false,
  }
}
