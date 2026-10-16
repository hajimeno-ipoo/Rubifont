import type { Plan, PlanGlyph } from './schema'
import { codepoints, glyphName } from './glyphs'

export interface EnglishReading {
  word: string
  reading: string
}

/** Extend a Japanese plan with whole English words; keep its Han rules and metrics intact. */
export function addEnglishReadings(plan: Plan, entries: readonly EnglishReading[], coverage: ReadonlySet<number>): Plan {
  if (!entries.length)
    return plan
  if (plan.glyphs.some(g => g.name.startsWith('enRuby_')))
    throw new Error('English readings have already been added to this plan')

  const seen = new Set<string>()
  const words = entries.flatMap(({ word, reading }) => {
    if (!/^[a-z]+$/.test(word) || !/^[\u30A1-\u30FA\u30FC]+$/.test(reading))
      throw new Error(`Invalid English reading: ${word} / ${reading}`)
    if (seen.has(word))
      throw new Error(`Duplicate English word: ${word}`)
    seen.add(word)
    return [...new Set([word, word[0]!.toUpperCase() + word.slice(1), word.toUpperCase()])]
      .map(text => ({ text, reading }))
  }).sort((a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text, 'en'))

  const glyphs: PlanGlyph[] = words.map(({ text, reading }, i) => ({
    name: `enRuby_${i}`,
    bases: codepoints(text),
    ruby: [{ start: 0, end: text.length, text: reading }],
    // The Japanese 1.5em cap is too narrow for a whole English word.
    maxRubyWidth: Math.max(plan.metrics.maxRubyWidth, text.length),
  }))
  // Source Han's liga runs before our rules. It maps ff/fi/fl/ffi/ffl to
  // their Unicode ligature glyphs, so accept those shaped sequences as well.
  const ligatures = Array.from({ length: 7 }, (_, i) => 0xFB00 + i)
    .filter(cp => coverage.has(cp))
    .map(cp => ({ text: String.fromCodePoint(cp).normalize('NFKD'), cp }))
  const sequences = (text: string): number[][] => {
    if (!text.length)
      return [[]]
    return [
      ...sequences(text.slice(1)).map(rest => [text.codePointAt(0)!, ...rest]),
      ...ligatures.filter(l => text.startsWith(l.text))
        .flatMap(l => sequences(text.slice(l.text.length)).map(rest => [l.cp, ...rest])),
    ]
  }
  const substitutions = words.flatMap(({ text }, i) => sequences(text).map(input => ({ input, glyph: glyphs[i]! })))
  // Digits, accents, marks, underscore and apostrophes belong to a word too.
  const boundary = [...coverage].filter(cp => /[\p{Script=Latin}\p{Mark}\p{Number}_'’]/u.test(String.fromCodePoint(cp)))
  // Source Han's locl uses different digits in Latin runs. Resolve these
  // symbolic names in the compiler after a possible subset renumbers them.
  const aliases = Array.from({ length: 10 }, (_, i) => 0x30 + i)
    .filter(cp => coverage.has(cp))
    .map(cp => ({ name: `enDigit_${cp}`, codepoint: cp, script: 'Latn' }))
  const required = new Set([...boundary, ...substitutions.flatMap(s => s.input), ...glyphs.flatMap(g => [...g.bases, ...g.ruby.flatMap(r => codepoints(r.text))])])
  for (const cp of required) {
    if (!coverage.has(cp))
      throw new Error(`The base font does not cover U+${cp.toString(16).toUpperCase()}`)
  }

  const block = (name: string, lines: string[]): string => `lookup ${name} useExtension {\n${lines.map(l => `  ${l}`).join('\n')}\n} ${name};\n`
  // Share drawing lookups, but apply them only after whole-word guards pass.
  const draw = [
    { name: 'en_draw', substitutions: substitutions.filter(s => s.input.length > 1) },
    { name: 'en_draw_single', substitutions: substitutions.filter(s => s.input.length === 1) },
  ].filter(group => group.substitutions.length)
  const off = [
    { name: 'en_off', glyphs: glyphs.filter(g => g.bases.length > 1) },
    { name: 'en_single_off', glyphs: glyphs.filter(g => g.bases.length === 1) },
  ].filter(group => group.glyphs.length)
  const contexts = Array.from({ length: Math.ceil(substitutions.length / 256) }, (_, i) => ({
    name: `en_words_${i}`,
    rules: substitutions.slice(i * 256, (i + 1) * 256).flatMap(({ input }) => {
      const names = input.map(glyphName)
      const marked = names.map(n => `${n}'`).join(' ')
      const lookup = input.length > 1 ? 'en_draw' : 'en_draw_single'
      return [
        `ignore sub @englishWord ${marked};`,
        `ignore sub ${marked} @englishWord;`,
        `sub ${names.map((n, j) => `${n}'${j === 0 ? ` lookup ${lookup}` : ''}`).join(' ')};`,
      ]
    }),
  }))
  const prelude = [
    `@englishWord = [${[...boundary.map(glyphName), ...aliases.map(a => a.name), ...glyphs.map(g => g.name)].join(' ')}];`,
    ...draw.map(group => block(group.name, group.substitutions.map(({ input, glyph }) => `sub ${input.map(glyphName).join(' ')} by ${glyph.name};`))),
    ...contexts.map(context => block(context.name, context.rules)),
    ...off.map(group => block(group.name, group.glyphs.map(g => `sub ${g.name} by ${g.bases.map(glyphName).join(' ')};`))),
  ].join('\n')
  const header = 'languagesystem DFLT dflt;'
  if (!plan.fea.startsWith(header))
    throw new Error('Expected a Furifont feature file')
  let fea = `${header}\n${prelude}\n${plan.fea.slice(header.length)}`
  for (const [tag, names] of [
    ['rclt', contexts.map(context => context.name)],
    ['ss01', off.map(group => group.name)],
  ] as const) {
    const opening = `feature ${tag} {`
    const calls = names.map(name => `  lookup ${name};`).join('\n')
    fea = fea.includes(opening)
      ? fea.replace(opening, `${opening}\n${calls}`)
      : `${fea}\n${opening}\n${calls}\n} ${tag};\n`
  }
  return {
    ...plan,
    names: { ...plan.names, description: `${plan.names.description} English katakana readings: Rubifont curated word list.` },
    codepoints: [...new Set([...plan.codepoints, ...required])].sort((a, b) => a - b),
    aliases: [...plan.aliases ?? [], ...aliases],
    subset: plan.subset && [...new Set([...plan.subset, ...required])].sort((a, b) => a - b),
    glyphs: [...plan.glyphs, ...glyphs],
    fea,
    smoke: [...plan.smoke, ...words.map(({ text }, i) => ({ text, glyphs: [glyphs[i]!.name] }))],
  }
}
