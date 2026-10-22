import type { PackedOkurigana } from '../packages/dictionary/src/okurigana.ts'
import type { OkuriganaTables } from '../packages/helper-web/src/okurigana.ts'
import { readFile } from 'node:fs/promises'
import { parsePair, rawFile, readPairOverrides } from '../packages/dictionary/scripts/raw.ts'
import { packOkurigana, prunePairs, unpackOkurigana } from '../packages/dictionary/src/okurigana.ts'
import { createOkuriganaReader } from '../packages/helper-web/src/okurigana.ts'

/** Keep upstream's full pairs: its pruned table assumes upstream's default readings. */
export async function loadUpstreamOkurigana(): Promise<PackedOkurigana> {
  const raw: PackedOkurigana = JSON.parse(await readFile(rawFile('okurigana'), 'utf8'))
  return packOkurigana(new Map([...unpackOkurigana(raw), ...await readPairOverrides()]))
}

/** A pair is identified by its kanji and following kana, even when upstream leaves it ambiguous. */
export function additionalOkurigana(upstream: PackedOkurigana, entries: readonly string[]): string[] {
  const known = new Set(unpackOkurigana(upstream).map(([key]) => key))
  return [...new Set(entries)].filter((entry) => {
    const pair = parsePair(entry)
    if (!pair)
      throw new Error(`Expected an okurigana pair such as 来[こ]ない: ${entry}`)
    return !known.has(pair[0])
  })
}

/** Upstream wins each existing key; only absent keys come from the local supplement. */
export function buildOkurigana(upstream: PackedOkurigana, entries: readonly string[], lists: Omit<OkuriganaTables, 'pairs'>): PackedOkurigana {
  const local = new Map<string, string | null>()
  for (const entry of additionalOkurigana(upstream, entries)) {
    const [key, reading] = parsePair(entry)!
    local.set(key, local.has(key) && local.get(key) !== reading ? null : reading)
  }
  const pairs = new Map([...local, ...unpackOkurigana(upstream)])
  const reader = createOkuriganaReader({ pairs: {}, ...lists })
  return packOkurigana(prunePairs(pairs, (run, reading) => reader.saltOf(run, reading) > 0))
}
