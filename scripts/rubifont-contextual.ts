import type { Plan } from '@furifont/core'
import { createRubyReader } from '@furifont/compiler'
import { formatNotation, glyphName, isHan, parseNotation, SELECTOR_SUPPRESS } from '@furifont/core'

/** Add selector-only readings without changing an unselected Han run. */
export function addContextualWordReadings(plan: Plan, notations: readonly string[]): { plan: Plan, words: Record<string, string[]> } {
  if (!notations.length)
    return { plan, words: {} }
  const insertion = 'lookup furigana useExtension {'
  const feature = 'feature rclt {'
  if (!plan.fea.includes(insertion) || !plan.fea.includes(feature) || plan.fea.includes('lookup rubifont_context_'))
    throw new Error('Expected an unextended Furifont feature file')
  const read = createRubyReader(plan)
  const words: Record<string, string[]> = {}
  const definitions: string[] = []
  const rules: string[] = []
  for (const [wordIndex, notation] of notations.entries()) {
    const { form, spans } = parseNotation(notation)
    const characters = [...form]
    if ((characters.length !== 2 && characters.length !== 3) || !characters.every(isHan) || spans.length !== characters.length
      || !spans.every((span, i) => span.start === i && span.end === i + 1)
      || formatNotation(form, spans) !== notation) {
      throw new Error(`Expected two or three kanji with one reading each: ${notation}`)
    }
    const bases = characters.map(character => glyphName(character.codePointAt(0)!))
    const variant = plan.variants.find(item => item.base === characters[0]!.codePointAt(0) && item.selector === SELECTOR_SUPPRESS + 2)
    if (!variant)
      throw new Error(`The first kanji has no existing reading selector 2: ${form}`)
    const inputs = [variant.name, ...bases.slice(1)]
    const existing = plan.fea.split('\n').some((line) => {
      const marked = [...line.matchAll(/(\S+)'/g)].map(match => match[1])
      return marked.length === inputs.length && marked.every((name, i) => name === inputs[i])
    })
    if (existing || words[form])
      throw new Error(`The contextual word already has a selected rule: ${form}`)
    const defaultReading = formatNotation(form, read(form))
    if (defaultReading === notation)
      throw new Error(`The font already shows the requested reading: ${notation}`)
    words[form] = [defaultReading, notation]
    const lookups = spans.map((span, i) => {
      const glyph = plan.glyphs.find(item => item.bases.length === 1 && item.bases[0] === characters[i]!.codePointAt(0)
        && item.ruby.length === 1 && item.ruby[0]!.start === 0 && item.ruby[0]!.end === 1 && item.ruby[0]!.text === span.ruby)
      if (!glyph)
        throw new Error(`The font has no existing ruby glyph: ${characters[i]}[${span.ruby}]`)
      const lookup = `rubifont_context_${wordIndex}_${i}`
      definitions.push(`lookup ${lookup} useExtension {\n  sub ${inputs[i]} by ${glyph.name};\n} ${lookup};\n`)
      return lookup
    })
    rules.push(`  sub ${inputs.map((input, i) => `${input}' lookup ${lookups[i]}`).join(' ')};`)
  }
  const lookup = 'rubifont_context_words'
  const prelude = `${definitions.join('\n')}\nlookup ${lookup} useExtension {\n${rules.join('\n')}\n} ${lookup};\n`
  // salt_first has finished; these selected runs must precede ordinary Han rules.
  const fea = plan.fea.replace(insertion, `${prelude}\n${insertion}`).replace(feature, `${feature}\n  lookup ${lookup};`)
  return { plan: { ...plan, fea }, words }
}
