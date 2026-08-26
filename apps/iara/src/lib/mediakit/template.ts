/**
 * Mediakit template loader — resolves the versioned standalone bundle both in
 * dev (cwd = apps/iara) and in the container (cwd = /app, template copied by
 * the Dockerfile to ./apps/iara/mediakit-template — the Next standalone
 * output does NOT trace fs-read files, story 30.2 / AI 34).
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const CANDIDATE_PATHS = ['mediakit-template/standalone.html', 'apps/iara/mediakit-template/standalone.html']

export class TemplateNotFoundError extends Error {
  constructor(tried: string[]) {
    super(
      `Mediakit template not found. Tried: ${tried.join(', ')} (cwd: ${process.cwd()}). ` +
        'In the container this means the Dockerfile COPY of mediakit-template/ is missing.'
    )
    this.name = 'TemplateNotFoundError'
  }
}

export function resolveTemplatePath(): string {
  const tried: string[] = []
  for (const candidate of CANDIDATE_PATHS) {
    const full = join(process.cwd(), candidate)
    tried.push(full)
    if (existsSync(full)) return full
  }
  throw new TemplateNotFoundError(tried)
}

export async function loadMediakitTemplate(): Promise<string> {
  return readFile(resolveTemplatePath(), 'utf-8')
}
