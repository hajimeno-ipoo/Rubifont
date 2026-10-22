import type { Dictionary, PlanOptions } from '@furifont/core'
import { formatNotation, hanRuns, isHan, parseFurigana, parseNotation, sourceBit } from '@furifont/core'

/** Store only missing Han-run readings; upstream owns the ruby alignment of a known reading. */
export function additionalJapaneseReadings(dictionary: Dictionary, notations: readonly string[]): string[] {
  const additions = new Set<string>()
  for (const notation of notations) {
    const { form, spans } = parseNotation(notation)
    const runs = hanRuns(form, spans)
    if (runs.reduce((n, run) => n + [...run.text].length, 0) !== [...form].filter(isHan).length)
      throw new Error(`Incomplete kanji reading: ${notation}`)
    for (const run of runs) {
      const single = [...run.text].length === 1
      const table = single ? dictionary.kanji[run.text] : dictionary.runs[run.text]
      const reading = run.spans.map(span => span.ruby).join('')
      const known = single ? Boolean(table?.[reading]) : Object.keys(table ?? {}).some(key => parseFurigana(key).map(span => span.ruby).join('') === reading)
      if (!known)
        additions.add(formatNotation(run.text, run.spans))
    }
  }
  return [...additions]
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
