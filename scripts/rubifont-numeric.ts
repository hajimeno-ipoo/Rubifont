import type { Plan, PlanGlyph } from '@furifont/core'
import { glyphName } from '@furifont/core'

export interface NumericReading {
  text: string
  ruby: PlanGlyph['ruby']
}

export interface NumericCharacterReading {
  text: string
  reading: string
}

/** Selectable digit ruby for consumers that preserve the original text and timing. */
export function addNumericCharacterReadings(plan: Plan, entries: readonly NumericCharacterReading[], coverage: ReadonlySet<number>): Plan {
  if (!entries.length)
    return plan
  const glyphs: PlanGlyph[] = entries.map(({ text, reading }, i) => {
    if ([...text].length !== 1 || !/^\p{Number}$/u.test(text))
      throw new Error(`Expected one numeric character: ${text}`)
    return { name: `numericChoice_${i}`, bases: [text.codePointAt(0)!], ruby: [{ start: 0, end: 1, text: reading }] }
  })
  const required = new Set(glyphs.flatMap(g => [...g.bases, ...[...g.ruby[0]!.text].map(c => c.codePointAt(0)!)]))
  for (const cp of required) {
    if (!coverage.has(cp))
      throw new Error(`The base font does not cover U+${cp.toString(16).toUpperCase()}`)
  }
  const groups = Map.groupBy(glyphs, glyph => glyph.bases[0]!)
  const aliases = [...groups.keys()].filter(cp => /^\d$/.test(String.fromCodePoint(cp))).map(cp => ({ name: `numericLatin_${String.fromCodePoint(cp)}`, codepoint: cp, script: 'Latn' }))
  const substitutions = [...groups].flatMap(([cp, choices]) => [glyphName(cp), ...aliases.filter(a => a.codepoint === cp).map(a => a.name)].map(base => `  sub ${base} from [${choices.map(glyph => glyph.name).join(' ')}];`))
  const prelude = `lookup numeric_choices useExtension {\n${substitutions.join('\n')}\n} numeric_choices;\n`
  const header = 'languagesystem DFLT dflt;'
  if (!plan.fea.startsWith(header))
    throw new Error('Expected a Furifont feature file')
  let fea = `${header}\n${prelude}${plan.fea.slice(header.length)}`
  const opening = 'feature salt {'
  fea = fea.includes(opening)
    ? fea.replace(opening, `${opening}\n  lookup numeric_choices;`)
    : `${fea}\n${opening}\n  lookup numeric_choices;\n} salt;\n`
  const off = `lookup numeric_choices_off useExtension {\n${glyphs.map(g => `  sub ${g.name} by ${glyphName(g.bases[0]!)};`).join('\n')}\n} numeric_choices_off;\n`
  fea += `\n${off}\nfeature ss01 {\n  lookup numeric_choices_off;\n} ss01;\n`
  return {
    ...plan,
    aliases: [...plan.aliases ?? [], ...aliases],
    codepoints: [...new Set([...plan.codepoints, ...required])].sort((a, b) => a - b),
    subset: plan.subset && [...new Set([...plan.subset, ...required])].sort((a, b) => a - b),
    glyphs: [...plan.glyphs, ...glyphs],
    fea,
  }
}

/** Exact full-width number expressions, separate from the upstream Han-only rules. */
export function addNumericReadings(plan: Plan, entries: readonly NumericReading[], coverage: ReadonlySet<number>): Plan {
  if (!entries.length)
    return plan
  const glyphs: PlanGlyph[] = entries.map(({ text, ruby }, i) => ({
    name: `numericRuby_${i}`,
    bases: [...text].map(c => c.codePointAt(0)!),
    ruby,
  }))
  const digits = [...coverage].filter(cp => /\p{Number}/u.test(String.fromCodePoint(cp)))
  const required = new Set([...digits, ...glyphs.flatMap(g => [...g.bases, ...g.ruby.flatMap(r => [...r.text].map(c => c.codePointAt(0)!))])])
  for (const cp of required) {
    if (!coverage.has(cp))
      throw new Error(`The base font does not cover U+${cp.toString(16).toUpperCase()}`)
  }
  const digitNames = [...new Set([
    ...digits.map(glyphName),
    ...plan.aliases?.filter(a => digits.includes(a.codepoint)).map(a => a.name) ?? [],
  ])]
  const block = (name: string, lines: string[]): string => `lookup ${name} useExtension {\n${lines.map(line => `  ${line}`).join('\n')}\n} ${name};\n`
  const prelude = [
    `@numericDigit = [${digitNames.join(' ')}];`,
    block('numeric_draw', glyphs.map(g => `sub ${g.bases.map(glyphName).join(' ')} by ${g.name};`)),
    block('numeric_words', glyphs.flatMap((g) => {
      const bases = g.bases.map(glyphName)
      return [
        // Do not read the final ２人 of １２人 as ふたり.
        `ignore sub @numericDigit ${bases.map(base => `${base}'`).join(' ')};`,
        `sub ${bases.map((base, i) => `${base}'${i ? '' : ' lookup numeric_draw'}`).join(' ')};`,
      ]
    })),
    block('numeric_off', glyphs.map(g => `sub ${g.name} by ${g.bases.map(glyphName).join(' ')};`)),
  ].join('\n')
  const header = 'languagesystem DFLT dflt;'
  if (!plan.fea.startsWith(header))
    throw new Error('Expected a Furifont feature file')
  // Run after the Han lookups: a number ligature must not change their neighbour tests.
  let fea = `${plan.fea}\n${prelude}`
  for (const [tag, lookup] of [['rclt', 'numeric_words'], ['ss01', 'numeric_off']]) {
    const opening = `feature ${tag} {`
    fea = fea.includes(opening)
      ? fea.replace(opening, `${opening}\n  lookup ${lookup};`)
      : `${fea}\n${opening}\n  lookup ${lookup};\n} ${tag};\n`
  }
  return {
    ...plan,
    codepoints: [...new Set([...plan.codepoints, ...required])].sort((a, b) => a - b),
    subset: plan.subset && [...new Set([...plan.subset, ...required])].sort((a, b) => a - b),
    glyphs: [...plan.glyphs, ...glyphs],
    fea,
    smoke: [...plan.smoke, ...entries.map(({ text }, i) => ({ text, glyphs: [glyphs[i]!.name] }))],
  }
}
