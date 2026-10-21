import type { Dictionary, Plan } from '@furifont/core'
import { readFile } from 'node:fs/promises'
import { addEnglishReadings, createFontPlanner, fuseDictionary, resolveOptions } from '@furifont/core'
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
  { word: 'can', reading: 'キャン' },
  { word: 'can\'t', reading: 'キャント' },
  { word: 'i\'m', reading: 'アイム' },
  { word: 'we\'ll', reading: 'ウィール' },
  { word: 'heart\'s', reading: 'ハーツ' },
  { word: 'did', reading: 'ディド' },
  { word: 'didn\'t', reading: 'ディドゥント' },
  { word: 'hurting', reading: 'ハーティング' },
  { word: 'felt', reading: 'フェルト' },
]
const japanese: Dictionary = fuseDictionary({
  versions: { fixture: '1' },
  onyomi: {},
  entries: [
    { form: '日本', furigana: '0:に;1:ほん', nf: 1, priority: 'news1 nf01', order: 0 },
    { form: '日本語', furigana: '0:に;1:ほん;2:ご', nf: 2, priority: 'news1 nf02', order: 0 },
    { form: '今日', furigana: '0-1:きょう', nf: 2, priority: 'ichi1', order: 0 },
  ],
  places: [],
  manual: {},
  defaults: [],
  bare: [],
})

interface Built {
  plan: Plan
  names: string[]
  font: hb.Font
}

/** Shape the actual compiled font, exposing its planned ruby rather than simulating FEA. */
function shape(built: Built, text: string, features: hb.Feature[] = [], language = 'en'): { names: string[], readings: string[] } {
  const buffer = new hb.Buffer()
  buffer.addText(text)
  buffer.guessSegmentProperties()
  buffer.setLanguage(language)
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
    const { plan } = createFontPlanner(japanese)(resolveOptions({ family: 'Rubifont Test' }), coverage, '日本語 今日')
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

  it.each(['en', 'ja'])('reads registered contractions with either apostrophe under %s', (language) => {
    const readings = shape(bilingual, 'can\'t Can\'t CAN\'T can’t Can’t CAN’T I\'m I’m WE\'LL WE’LL heart\'s heart’s', [], language).readings
    expect(readings).toEqual([
      'can\'t:キャント',
      'Can\'t:キャント',
      'CAN\'T:キャント',
      'can’t:キャント',
      'Can’t:キャント',
      'CAN’T:キャント',
      'I\'m:アイム',
      'I’m:アイム',
      'WE\'LL:ウィール',
      'WE’LL:ウィール',
      'heart\'s:ハーツ',
      'heart’s:ハーツ',
    ])
    expect(shape(bilingual, 'can').readings).toEqual(['can:キャン'])
  })

  it.each(['en', 'ja'])('does not take a registered contraction from inside a longer token under %s', (language) => {
    for (const text of ['xcan\'t', 'can\'tx', 'can\'t2', 'can\'t\'s', 'xcan’t', 'can’tx', 'can’t2', 'can’t’s', 'can\'tsave', 'cAn\'T'])
      expect(shape(bilingual, text, [], language).readings, text).toEqual([])
  })

  it('restores the exact apostrophe when ss01 disables contractions', () => {
    const text = 'can\'t can’t I\'m I’m heart\'s heart’s'
    const off = shape(bilingual, text, [new hb.Feature('ss01')])
    expect(off.readings).toEqual([])
    expect(off.names).toEqual([...text].map(c => bilingual.names[bilingual.font.nominalGlyph(c.codePointAt(0)!)!]!))
  })

  it.each(['en', 'ja'])('reads reported past and progressive forms in full under %s', (language) => {
    expect(shape(bilingual, 'didn\'t Didn\'t DIDN\'T didn’t Didn’t DIDN’T hurting Hurting HURTING felt Felt FELT', [], language).readings).toEqual([
      'didn\'t:ディドゥント',
      'Didn\'t:ディドゥント',
      'DIDN\'T:ディドゥント',
      'didn’t:ディドゥント',
      'Didn’t:ディドゥント',
      'DIDN’T:ディドゥント',
      'hurting:ハーティング',
      'Hurting:ハーティング',
      'HURTING:ハーティング',
      'felt:フェルト',
      'Felt:フェルト',
      'FELT:フェルト',
    ])
    for (const text of ['xdidn\'t', 'didn\'tx', 'didn’t2', 'hurtingx', 'felts'])
      expect(shape(bilingual, text, [], language).readings, text).toEqual([])
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
    const { plan } = createFontPlanner(japanese)(resolveOptions({ family: 'Rubifont Large Test' }), coverage, '日本語 今日')
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

describe('bilingual readings in a variable TrueType font', () => {
  const weights = [250, 400, 900]
  const emTop = 880
  let built: Built
  let fontBytes: Uint8Array
  let sourceFace: hb.Face

  const atWeight = (weight: number): Built => {
    const font = new hb.Font(new hb.Face(new hb.Blob(fontBytes)))
    font.setVariations([new hb.Variation('wght', weight)])
    return { ...built, font }
  }

  /** Separate the ruby ink above the em box from the original letters below it. */
  function ink(font: hb.Font, glyph: number, ruby: boolean): number[][] {
    return font.glyphToJson(glyph).flatMap(({ values }) => Array.from({ length: values.length / 2 }, (_, i) => [values[i * 2]!, values[i * 2 + 1]!])
      .filter(([, y]) => (y! > emTop) === ruby))
  }

  const glyphOf = (text: string): number => built.names.indexOf(built.plan.glyphs.find(g => String.fromCodePoint(...g.bases) === text)!.name)

  beforeAll(async () => {
    const base = await readFile(new URL('./fixtures/SourceHanSansJP-VF-Subset.ttf', import.meta.url))
    sourceFace = new hb.Face(new hb.Blob(base))
    const coverage = new Set(readFontInfo(base).codepoints)
    const { plan } = createFontPlanner(japanese)(resolveOptions({ family: 'Rubifont Variable Test' }), coverage, '日本語 今日')
    const extended = addEnglishReadings(plan, [
      { word: 'edit', reading: 'エディット' },
      { word: 'settings', reading: 'セッティングス' },
    ], coverage)
    const result = await compileFont({ plan: extended, base, subsetWasm, version: '0.0.0', date: new Date(0) })
    expect(result.variable).toBe(true)
    expect(result.outlines).toBe('truetype')
    fontBytes = result.font
    built = { plan: extended, names: result.glyphNames, font: new hb.Font(new hb.Face(new hb.Blob(result.font))) }
  })

  it.each(['今日', 'edit', 'settings'])('varies both the base and ruby outlines of %s at three weights', (text) => {
    const glyph = glyphOf(text)
    const samples = weights.map(weight => atWeight(weight))
    for (const ruby of [false, true]) {
      const outlines = samples.map(({ font }) => ink(font, glyph, ruby))
      expect(outlines.every(points => points.length > 0)).toBe(true)
      expect(outlines[0]).not.toEqual(outlines[1])
      expect(outlines[1]).not.toEqual(outlines[2])
    }
    for (const [i, { font }] of samples.entries()) {
      const original = new hb.Font(sourceFace)
      original.setVariations([new hb.Variation('wght', weights[i]!)])
      const originalAdvance = [...text].reduce((sum, char) => {
        const cp = char.codePointAt(0)!
        const advance = original.glyphHAdvance(original.nominalGlyph(cp)!)
        expect(font.glyphHAdvance(font.nominalGlyph(cp)!)).toBe(advance)
        return sum + advance
      }, 0)
      if (weights[i] === 400) {
        // HVAR rounds the summed delta once; summing separately rounded base
        // widths can differ by at most half a unit per base, plus one rounding.
        expect(Math.abs(font.glyphHAdvance(glyph) - originalAdvance)).toBeLessThanOrEqual(Math.floor(([...text].length + 1) / 2))
      }
      else {
        expect(font.glyphHAdvance(glyph)).toBe(originalAdvance)
      }
    }
  })

  it.each(['今日', 'edit', 'settings'])('keeps the ruby of %s above and centred over its base while the weight changes', (text) => {
    const glyph = glyphOf(text)
    const bounds = weights.map((weight) => {
      const { font } = atWeight(weight)
      const points = ink(font, glyph, true)
      const xs = points.map(([x]) => x!)
      const ys = points.map(([, y]) => y!)
      const left = Math.min(...xs)
      const right = Math.max(...xs)
      const centre = (left + right) / 2
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(emTop + 50)
      expect(Math.max(...ys)).toBeLessThanOrEqual(emTop + 550)
      expect(Math.abs(centre - font.glyphHAdvance(glyph) / 2)).toBeLessThan(100)
      return { centre: centre - font.glyphHAdvance(glyph) / 2, width: right - left }
    })
    expect(Math.max(...bounds.map(b => b.centre)) - Math.min(...bounds.map(b => b.centre))).toBeLessThan(10)
    expect(bounds[1]!.width).toBeGreaterThan(bounds[0]!.width)
    expect(bounds[2]!.width).toBeGreaterThan(bounds[1]!.width)
  })

  it.each(weights)('preserves bilingual shaping, unknown words and ss01 at weight %i', (weight) => {
    const sample = atWeight(weight)
    expect(shape(sample, '今日edit settings').readings).toEqual(['今日:きょう', 'edit:エディット', 'settings:セッティングス'])
    expect(shape(sample, 'edits xsettings unknown').readings).toEqual([])
    const off = shape(sample, '今日edit settings', [new hb.Feature('ss01')])
    expect(off.readings).toEqual([])
    expect(off.names).not.toContain('glyph0')
  })
})
