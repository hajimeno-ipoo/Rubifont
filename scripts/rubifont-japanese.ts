import type { Dictionary, PlanOptions } from '@furifont/core'
import { hanRuns, parseNotation, sourceBit } from '@furifont/core'

/** The existing okurigana reader's packed format; an empty reading leaves ambiguous pairs to the font. */
export function japaneseOkurigana(notations: readonly string[]): Record<string, Record<string, string[]>> {
  const pairs = new Map<string, { run: string, after: string, readings: Set<string> }>()
  for (const notation of notations) {
    const { form, spans } = parseNotation(notation)
    for (const match of form.matchAll(/(\p{sc=Han}+)(\p{sc=Hiragana}+)/gu)) {
      const key = match[0]
      const run = match[1]!
      const after = match[2]!
      const start = [...form.slice(0, match.index)].length
      const end = start + [...run].length
      const inside = spans.filter(span => span.start >= start && span.end <= end)
      if (inside.reduce((count, span) => count + span.end - span.start, 0) !== end - start)
        throw new Error(`Incomplete okurigana reading: ${notation}`)
      const pair = pairs.get(key) ?? { run, after, readings: new Set<string>() }
      pair.readings.add(inside.map(span => span.ruby).join(''))
      pairs.set(key, pair)
    }
  }
  const packed: Record<string, Record<string, string[]>> = {}
  for (const { run, after, readings } of pairs.values()) {
    const reading = readings.size === 1 ? [...readings][0]! : ''
    ;((packed[run] ??= {})[reading] ??= []).push(after)
  }
  return packed
}

/** Keep custom single-kanji alternatives selectable; words.add handles multi-kanji runs. */
export function mergeJapaneseReadings(dictionary: Dictionary, words: PlanOptions['words']): Dictionary {
  const kanji = { ...dictionary.kanji }
  for (const notation of words.add) {
    const { form, spans } = parseNotation(notation)
    for (const run of hanRuns(form, spans)) {
      if ([...run.text].length !== 1)
        continue
      const ruby = run.spans[0]!.ruby
      const readings = kanji[run.text] ?? {}
      if (!readings[ruby])
        kanji[run.text] = { ...readings, [ruby]: [0, sourceBit('inflecting')] }
    }
  }
  return { ...dictionary, kanji }
}
