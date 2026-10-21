import { createFontPlanner, fuseDictionary, resolveOptions } from '@furifont/core'
import { describe, expect, it } from 'vitest'
import { coverage, dictionary } from '../packages/core/test/fixture'
import { mergeJapaneseReadings } from '../scripts/rubifont-japanese'

describe('rubifont Japanese supplement', () => {
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
