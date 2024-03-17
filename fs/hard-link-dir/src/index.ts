import '@total-typescript/ts-reset'
import path from 'node:path'
import fs from 'node:fs'
import { globalWarn } from '@pnpm/logger'

export function hardLinkDir(src: string, destDirs: string[]): void {
  if (destDirs.length === 0) return
  // Don't try to hard link the source directory to itself
  destDirs = destDirs.filter((destDir) => path.relative(destDir, src) !== '')
  _hardLinkDir(src, destDirs, true)
}

function _hardLinkDir(src: string, destDirs: string[], isRoot?: boolean): void {
  let files: string[] = []
  try {
    files = fs.readdirSync(src)
  } catch (err: any) { // eslint-disable-line
    if (!isRoot || err.code !== 'ENOENT') throw err
    globalWarn(
      `Source directory not found when creating hardLinks for: ${src}. Creating destinations as empty: ${destDirs.join(', ')}`
    )
    for (const dir of destDirs) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return
  }
  for (const file of files) {
    if (file === 'node_modules') continue
    const srcFile = path.join(src, file)
    if (fs.lstatSync(srcFile).isDirectory()) {
      const destSubdirs = destDirs.map((destDir) => {
        const destSubdir = path.join(destDir, file)
        try {
          fs.mkdirSync(destSubdir, { recursive: true })
        } catch (err: any) { // eslint-disable-line
          if (err.code !== 'EEXIST') throw err
        }
        return destSubdir
      })
      _hardLinkDir(srcFile, destSubdirs)
      continue
    }
    for (const destDir of destDirs) {
      const destFile = path.join(destDir, file)
      try {
        linkOrCopyFile(srcFile, destFile)
      } catch (err: any) { // eslint-disable-line
        if (err.code === 'ENOENT') {
          // Ignore broken symlinks
          continue
        }
        throw err
      }
    }
  }
}

function linkOrCopyFile(srcFile: string, destFile: string): void {
  try {
    linkOrCopy(srcFile, destFile)
  } catch (err: any) { // eslint-disable-line
    if (err.code === 'ENOENT') {
      fs.mkdirSync(path.dirname(destFile), { recursive: true })
      linkOrCopy(srcFile, destFile)
      return
    }
    if (err.code !== 'EEXIST') {
      throw err
    }
  }
}

/*
 * This function could be optimized because we don't really need to try linking again
 * if linking failed once.
 */
function linkOrCopy(srcFile: string, destFile: string): void {
  try {
    fs.linkSync(srcFile, destFile)
  } catch (err: any) { // eslint-disable-line
    if (err.code !== 'EXDEV') throw err
    fs.copyFileSync(srcFile, destFile)
  }
}
