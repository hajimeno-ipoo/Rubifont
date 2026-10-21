import { createFontPlanner, fuseDictionary, resolveOptions } from '@furifont/core'
import { describe, expect, it } from 'vitest'
import { coverage, dictionary } from '../packages/core/test/fixture'
import { createOkuriganaReader } from '../packages/helper-web/src/okurigana'
import { japaneseOkurigana, mergeJapaneseReadings } from '../scripts/rubifont-japanese'

describe('rubifont Japanese supplement', () => {
  it('feeds okurigana-specific readings into the existing reading selector', () => {
    const pairs = japaneseOkurigana(['来[き]て', '来[く]る', '止[と]まった', '失[な]くした'])
    const reader = createOkuriganaReader({ pairs, readings: { 来: ['き', 'く'], 止: ['や', 'と'], 失: ['うしな', 'な'] }, words: {}, lone: { 来: 'き', 止: 'や', 失: 'うしな' } })
    expect(reader.find('来て 来る 止まった 失くした')).toEqual([
      { at: 3, length: 1, reading: 'く', salt: 2 },
      { at: 6, length: 1, reading: 'と', salt: 2 },
      { at: 11, length: 1, reading: 'な', salt: 2 },
    ])
  })

  it('keeps a same-spelling ambiguity unresolved and deduplicates repeated pairs', () => {
    const pairs = japaneseOkurigana(['止[と]めた', '止[や]めた', '止[と]まった', '止[と]まった'])
    const reader = createOkuriganaReader({ pairs, readings: { 止: ['と', 'や'] }, words: {}, lone: { 止: 'と' } })
    expect(pairs).toEqual({ 止: { '': ['めた'], 'と': ['まった'] } })
    expect(reader.find('止めた')).toEqual([])
  })

  it('collects complete kanji readings beside prefix kana and skips forms without okurigana', () => {
    expect(japaneseOkurigana(['あの日[ひ]は', '今[こん]日[にち]では', '中[なか]'])).toEqual({ 日: { ひ: ['は'] }, 今日: { こんにち: ['では'] } })
    expect(() => japaneseOkurigana(['日[に]本では'])).toThrow('Incomplete okurigana reading')
  })

  it('adds a missing word, prioritizes a custom reading and retains upstream alternatives', () => {
    const words = resolveOptions({ words: { add: ['大本[おおもと]'], pin: ['今[こん]日[にち]'] } }).words
    const { plan, report } = createFontPlanner(mergeJapaneseReadings(dictionary, words))(resolveOptions({ words }), coverage)
    expect(plan.glyphs).toContainEqual(expect.objectContaining({ bases: [0x5927, 0x672C], ruby: [{ start: 0, end: 2, text: 'おおもと' }] }))
    expect(report.ivs.words['今日']![0]).toBe('今[こん]日[にち]')
    expect(report.ivs.words['今日']).toContain('今日[きょう]')
  })

  it('merges duplicate readings without changing the upstream dictionary', () => {
    const original = structuredClone(dictionary)
    const words = resolveOptions({ words: { add: ['桜[さくら]', '桜[さくら]', '今[こん]日[にち]', '今[こん]日[にち]'] } }).words
    const merged = mergeJapaneseReadings(dictionary, words)
    expect(merged).toEqual(dictionary)
    const { report } = createFontPlanner(merged)(resolveOptions({ words }), coverage)
    expect(report.ivs.words['今日']!.filter(r => r === '今[こん]日[にち]')).toHaveLength(1)
    expect(report.ivs.kanji['桜']!.filter(r => r === 'さくら')).toHaveLength(1)
    expect(dictionary).toEqual(original)
  })

  it('retains multiple new single-kanji readings and pins only the chosen default', () => {
    const empty = fuseDictionary({ versions: { fixture: '1' }, onyomi: {}, entries: [], places: [], manual: {}, defaults: [], bare: [] })
    const words = resolveOptions({ words: { add: ['来[き]て', '来[く]る', '来[き]て'], pin: ['来[く]る'] } }).words
    const { report } = createFontPlanner(mergeJapaneseReadings(empty, words))(resolveOptions({ words }), coverage)
    expect(report.ivs.kanji['来']).toEqual(expect.arrayContaining(['き', 'く']))
    expect(report.ivs.kanji['来']!.filter(r => r === 'き')).toHaveLength(1)
    expect(report.ivs.lone['来']).toBe('く')
    expect(empty.kanji).toEqual({})
  })
})
