import type { Dictionary, PlanOptions } from '@furifont/core'
import { hanRuns, parseNotation, sourceBit } from '@furifont/core'

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
