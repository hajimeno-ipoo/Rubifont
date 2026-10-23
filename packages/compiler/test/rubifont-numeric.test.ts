import type { Plan } from '@furifont/core'
import { readFile } from 'node:fs/promises'
import { compileFont, readFontInfo } from '@furifont/compiler'
import { subsetWasm } from '@furifont/compiler/node'
import { createFontPlanner, fuseDictionary, resolveOptions } from '@furifont/core'
import * as hb from 'harfbuzzjs'
import { beforeAll, describe, expect, it } from 'vitest'
import japanese from '../../../rubifont/japanese.json'
import { addNumericCharacterReadings, addNumericReadings } from '../../../scripts/rubifont-numeric'

describe('rubifont full-width numeric readings in a compiled font', () => {
  let font: hb.Font
  let names: string[]
  let plan: Plan
  const shape = (text: string, features: hb.Feature[] = []): string[] => {
    const buffer = new hb.Buffer()
    buffer.addText(text)
    buffer.guessSegmentProperties()
    buffer.setLanguage('ja')
    hb.shape(font, buffer, features)
    return buffer.getGlyphInfos().map(g => names[g.codepoint]!)
  }

  beforeAll(async () => {
    const base = await readFile(new URL('../../../.cache/fonts/SourceHanSansJP-Regular.otf', import.meta.url))
    const coverage = new Set(readFontInfo(base).codepoints)
    const dictionary = fuseDictionary({ versions: {}, onyomi: {}, entries: [], places: [], manual: {}, defaults: [], bare: [] })
    const original = createFontPlanner(dictionary)(resolveOptions(), coverage, '１つ２人').plan
    plan = addNumericCharacterReadings(addNumericReadings(original, japanese.numeric, coverage), japanese.numericCharacters, coverage)
    const result = await compileFont({ plan, base, subsetWasm, version: '0.0.0', date: new Date(0) })
    names = result.glyphNames
    font = new hb.Font(new hb.Face(new hb.Blob(result.font)))
  })

  it('draws the registered expressions with ruby over their specified base range', () => {
    japanese.numeric.forEach((entry, i) => {
      expect(shape(entry.text)).toEqual([`numericRuby_${i}`])
      expect(plan.glyphs.find(g => g.name === `numericRuby_${i}`)?.ruby).toEqual(entry.ruby)
    })
  })

  it('does not annotate the end of a longer number or unrelated digits', () => {
    for (const text of ['１１つ', '１２人', '２２人', '1１つ', '2２人', '１', '２', '人', '３人'])
      expect(shape(text).some(name => name.startsWith('numericRuby_')), text).toBe(false)
  })

  it('restores the original digit and kana or kanji with ss01', () => {
    for (const { text } of japanese.numeric)
      expect(shape(text, [new hb.Feature('ss01')])).toEqual(shape(text, [new hb.Feature('rclt', 0)]))
  })

  it('selects digit ruby explicitly without changing plain digit defaults', () => {
    japanese.numericCharacters.forEach(({ text, reading }, i) => {
      const salt = japanese.numericCharacters.slice(0, i + 1).filter(entry => entry.text === text).length
      expect(shape(text, [new hb.Feature('salt', salt)])).toEqual([`numericChoice_${i}`])
      expect(shape(text)).not.toContain(`numericChoice_${i}`)
      expect(shape(text, [new hb.Feature('salt', salt), new hb.Feature('ss01')])).toEqual(shape(text))
      expect(plan.glyphs.find(g => g.name === `numericChoice_${i}`)?.ruby).toEqual([{ start: 0, end: 1, text: reading }])
    })
  })
})
