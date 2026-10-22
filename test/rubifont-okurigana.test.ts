import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createOkuriganaReader } from '../packages/helper-web/src/okurigana'
import { additionalOkurigana, buildOkurigana, loadUpstreamOkurigana } from '../scripts/rubifont-okurigana'

const lists = {
  readings: { 来: ['らい', 'き', 'く', 'こ'], 重: ['じゅう', 'おも', 'かさ'], 失: ['しつ', 'うしな', 'な'], 止: ['と', 'や'], 光: ['ひかり'] },
  words: {},
  lone: { 来: 'き', 重: 'かさ', 失: 'な', 止: 'と', 光: 'ひかり' },
}

describe('rubifont upstream and supplemental okurigana', () => {
  it('uses upstream for an existing spelling, including ambiguous readings', () => {
    const upstream = { 来: { こ: ['ない'] }, 止: { '': ['めた'] } }
    const entries = ['来[き]ない', '止[や]めた', '光[ひかり]のなか']
    expect(additionalOkurigana(upstream, entries)).toEqual(['光[ひかり]のなか'])
    const pairs = buildOkurigana(upstream, entries, lists)
    const reader = createOkuriganaReader({ pairs, ...lists })
    expect(reader.find('来ない')).toEqual([{ at: 0, length: 1, reading: 'こ', salt: 4 }])
    expect(reader.find('止めた')).toEqual([])
  })

  it('adds only absent keys and keeps conflicting local readings unresolved', () => {
    const entries = ['来[こ]ない', '来[こ]ない', '止[や]めた', '止[と]めた']
    expect(additionalOkurigana({}, entries)).toEqual(['来[こ]ない', '止[や]めた', '止[と]めた'])
    const reader = createOkuriganaReader({ pairs: buildOkurigana({}, entries, lists), ...lists })
    expect(reader.find('来ない')).toEqual([{ at: 0, length: 1, reading: 'こ', salt: 4 }])
    expect(reader.find('止めた')).toEqual([])
    expect(() => additionalOkurigana({}, ['来'])).toThrow('Expected an okurigana pair')
  })

  it('re-evaluates raw pairs against Rubifont defaults instead of dropping upstream defaults', () => {
    const upstream = { 重: { おも: ['い'] }, 失: { うしな: ['う'] }, 来: { き: ['て'], く: ['る'], こ: ['ない'] } }
    const reader = createOkuriganaReader({ pairs: buildOkurigana(upstream, [], lists), ...lists })
    expect(reader.find('重い 失う 来る 来ない')).toEqual([
      { at: 0, length: 1, reading: 'おも', salt: 2 },
      { at: 3, length: 1, reading: 'うしな', salt: 2 },
      { at: 6, length: 1, reading: 'く', salt: 3 },
      { at: 9, length: 1, reading: 'こ', salt: 4 },
    ])
    expect(reader.find('来て')).toEqual([])
  })

  it('keeps longer ambiguous keys from inheriting a shorter reading', () => {
    const upstream = { 来: { 'こ': ['な'], '': ['ながら'] } }
    const reader = createOkuriganaReader({ pairs: buildOkurigana(upstream, ['来[く]ながら'], lists), ...lists })
    expect(reader.find('来ない')).toEqual([{ at: 0, length: 1, reading: 'こ', salt: 4 }])
    expect(reader.find('来ながら')).toEqual([])
  })

  it('loads curated upstream corrections and keeps pairs needed after custom defaults change', async () => {
    const upstream = await loadUpstreamOkurigana()
    expect(upstream.上?.うえ).toContain('の')
    expect(upstream.来?.こ).toContain('ない')
    expect(upstream.重?.おも).toContain('い')
    expect(upstream.失?.うしな).toContain('う')
    const local: string[] = JSON.parse(await readFile(new URL('../rubifont/okurigana.json', import.meta.url), 'utf8'))
    expect(additionalOkurigana(upstream, local)).toEqual(local)
    expect(additionalOkurigana(upstream, ['来[こ]ない', '触[ふ]れた', ...local])).toEqual(local)
  })
})
