import type { Dictionary, Plan } from '@furifont/core'
import { readFile } from 'node:fs/promises'
import { addEnglishReadings, createFontPlanner, resolveOptions } from '@furifont/core'
import * as hb from 'harfbuzzjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileFont, readFontInfo } from '../src'
import { subsetWasm } from '../src/node'

// The committed fixture lacks é and ー. Prepare this integration-test base with:
// curl --fail --location --create-dirs --output .cache/fonts/SourceHanSansJP-Regular.otf https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/SubsetOTF/JP/SourceHanSansJP-Regular.otf
const BASE = new URL('../../../.cache/fonts/SourceHanSansJP-Regular.otf', import.meta.url)
const entries = [
  { word: 'a', reading: 'ア' },
  { word: 'he', reading: 'ヒー' },
  { word: 'hello', reading: 'ハロー' },
  { word: 'save', reading: 'セーブ' },
  { word: 'settings', reading: 'セッティングス' },
  { word: 'file', reading: 'ファイル' },
  { word: 'office', reading: 'オフィス' },
  { word: 'offline', reading: 'オフライン' },
]
const japanese: Dictionary = {
  sources: { fixture: '1' },
  onyomi: {},
  entries: [
    { form: '日本', furigana: '0:に;1:ほん', nf: 1, priority: 'news1 nf01', order: 0 },
    { form: '日本語', furigana: '0:に;1:ほん;2:ご', nf: 2, priority: 'news1 nf02', order: 0 },
    { form: '今日', furigana: '0-1:きょう', nf: 2, priority: 'ichi1', order: 0 },
  ],
}

interface Built {
  plan: Plan
  names: string[]
  font: hb.Font
}

/** Shape the actual compiled font, exposing its planned ruby rather than simulating FEA. */
function shape(built: Built, text: string, features: hb.Feature[] = []): { names: string[], readings: string[] } {
  const buffer = new hb.Buffer()
  buffer.addText(text)
  buffer.guessSegmentProperties()
  hb.shape(built.font, buffer, features)
  const names = buffer.getGlyphInfos().map(g => built.names[g.codepoint]!)
  const readings = names.flatMap((name) => {
    const glyph = built.plan.glyphs.find(g => g.name === name)
    return glyph ? [`${String.fromCodePoint(...glyph.bases)}:${glyph.ruby.map(r => r.text).join('|')}`] : []
  })
  return { names, readings }
}

describe('english readings in an actual Japanese font', () => {
  let baseline: Built
  let bilingual: Built

  beforeAll(async () => {
    const base = await readFile(BASE)
    const coverage = new Set(readFontInfo(base).codepoints)
    const { plan } = createFontPlanner(japanese)(resolveOptions({ family: 'Rubifont Test', untagged: false }), coverage, '日本語 今日')
    const extended = addEnglishReadings(plan, entries, coverage)
    const build = async (spec: Plan): Promise<Built> => {
      const result = await compileFont({ plan: spec, base, subsetWasm, version: '0.0.0', date: new Date(0) })
      return { plan: spec, names: result.glyphNames, font: new hb.Font(new hb.Face(new hb.Blob(result.font))) }
    }
    baseline = await build(plan)
    bilingual = await build(extended)
  }, 120_000)

  it('matches a complete word before its shorter dictionary prefix', () => {
    expect(shape(bilingual, 'he hello').readings).toEqual(['he:ヒー', 'hello:ハロー'])
  })

  it('keeps lowercase, title case and uppercase text while adding the same reading', () => {
    expect(shape(bilingual, 'save Save SAVE').readings).toEqual(['save:セーブ', 'Save:セーブ', 'SAVE:セーブ'])
    expect(shape(bilingual, 'sAvE').readings).toEqual([])
  })

  it('annotates single-letter words alongside longer words', () => {
    expect(shape(bilingual, 'a A save Save').readings).toEqual(['a:ア', 'A:ア', 'save:セーブ', 'Save:セーブ'])
  })

  it('restores single-letter and longer words together when ss01 disables readings', () => {
    const text = 'a A save Save'
    const off = shape(bilingual, text, [new hb.Feature('ss01')])
    expect(off.readings).toEqual([])
    expect(off.names).toEqual([...text].map((c) => {
      const glyph = bilingual.font.nominalGlyph(c.codePointAt(0)!)!
      return bilingual.names[glyph]!
    }))
  })

  it.each(['saved', 'autosave', 'savesave', 'SaveSettings', 'save2', '2save', 'save_', '_save', 'saveé', 'ésave', 'save\'s', 'save’s'])('does not annotate a fragment inside %s', (text) => {
    expect(shape(bilingual, text).readings).toEqual([])
  })

  it('allows punctuation and whitespace around English words', () => {
    expect(shape(bilingual, '(Save), hello!\nSAVE　he').readings).toEqual(['Save:セーブ', 'hello:ハロー', 'SAVE:セーブ', 'he:ヒー'])
  })

  it('survives the base font shaping common f and i combinations', () => {
    expect(shape(bilingual, 'file office offline').readings).toEqual(['file:ファイル', 'office:オフィス', 'offline:オフライン'])
  })

  it('restores the original English letters when ss01 disables readings', () => {
    const text = 'he hello save Save SAVE settings'
    const off = shape(bilingual, text, [new hb.Feature('ss01')])
    expect(off.readings).toEqual([])
    const expected = [...text].map((c) => {
      const glyph = bilingual.font.nominalGlyph(c.codePointAt(0)!)!
      return bilingual.names[glyph]!
    })
    expect(off.names).toEqual(expected)
  })

  it.each(['日本', '日本語', '今日', '日本語 今日'])('retains the Japanese shaping of %s', (text) => {
    expect(shape(bilingual, text)).toEqual(shape(baseline, text))
  })

  it('annotates both languages together', () => {
    const readings = shape(bilingual, '日本語Save今日').readings
    expect(readings).toEqual(['日:に', '本:ほん', '語:ご', 'Save:セーブ', '今日:きょう'])
  })

  it('compiles 2500 English words and preserves boundaries and reading suppression', async () => {
    const expanded = [
      { word: 'a', reading: 'ア' },
      { word: 'he', reading: 'ヒー' },
      { word: 'file', reading: 'ファイル' },
      { word: 'office', reading: 'オフィス' },
      { word: 'offline', reading: 'オフライン' },
      ...Array.from({ length: 2495 }, (_, i) => ({
        word: `${String.fromCharCode(97 + i % 26)}word${[0, 1, 2].map(j => String.fromCharCode(97 + Math.floor(i / 26 ** j) % 26)).join('')}`,
        reading: 'ワード',
      })),
    ]
    const base = await readFile(BASE)
    const coverage = new Set(readFontInfo(base).codepoints)
    const { plan } = createFontPlanner(japanese)(resolveOptions({ family: 'Rubifont Large Test', untagged: false }), coverage, '日本語 今日')
    const extended = addEnglishReadings(plan, expanded, coverage)
    // compileFont also shapes every generated spelling in the plan's smoke list.
    const result = await compileFont({ plan: extended, base, subsetWasm, version: '0.0.0', date: new Date(0) })
    const large: Built = { plan: extended, names: result.glyphNames, font: new hb.Font(new hb.Face(new hb.Blob(result.font))) }
    const plainPlan = { ...extended, glyphs: plan.glyphs, fea: plan.fea, smoke: plan.smoke }
    const plainResult = await compileFont({ plan: plainPlan, base, subsetWasm, version: '0.0.0', date: new Date(0) })
    const plain: Built = { plan: plainPlan, names: plainResult.glyphNames, font: new hb.Font(new hb.Face(new hb.Blob(plainResult.font))) }
    const word = expanded.at(-1)!.word
    expect(shape(large, `${word} ${word.toUpperCase()}`).readings).toEqual([`${word}:ワード`, `${word.toUpperCase()}:ワード`])
    for (const text of [`x${word}`, `${word}x`, `${word}${word}`, `a${word}`, `${word}a`, `${word}'s`])
      expect(shape(large, text).readings).toEqual([])
    for (const text of ['profilex', 'offline2', 'office\'s', 'officeoffice'])
      expect(shape(large, text)).toEqual(shape(plain, text))
    expect(shape(large, `a he ${word}`, [new hb.Feature('ss01')]).readings).toEqual([])
    expect(shape(large, '日本語 今日')).toEqual(shape(baseline, '日本語 今日'))
  }, 120_000)
})
