/** Build the bilingual Regular and variable fonts without changing upstream presets. */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { BASE_FONTS, compileFont, readFontInfo, toWoff2 } from '@furifont/compiler'
import { brotli, subsetWasm } from '@furifont/compiler/node'
import { addEnglishReadings, createFontPlanner, parseNotation, resolveOptions, WORD_SOURCES } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'
import { fetchBaseFont } from '../packages/cli/src/base-fonts.ts'
import english from '../rubifont/english.json' with { type: 'json' }
import japanese from '../rubifont/japanese.json' with { type: 'json' }
import okuriganaSupplement from '../rubifont/okurigana.json' with { type: 'json' }
import { addContextualWordReadings } from './rubifont-contextual.ts'
import { additionalJapaneseReadings, mergeJapaneseReadings } from './rubifont-japanese.ts'
import { addNumericCharacterReadings, addNumericReadings } from './rubifont-numeric.ts'
import { additionalOkurigana, buildOkurigana, loadUpstreamOkurigana } from './rubifont-okurigana.ts'
import { writeRubifontPages } from './rubifont-pages.ts'

const root = new URL('../', import.meta.url)
const output = new URL(process.argv[2] ?? 'outputs/', root)
const cache = fileURLToPath(new URL('.cache/fonts/', root))
// Fixed release epoch: midnight in Japan. Rebuilding the same inputs keeps font bytes stable.
const date = new Date('2026-10-24T00:00:00+09:00')
const version = '0.6.19'
await mkdir(output, { recursive: true })
// Keep the existing sources. The postal-address source alone exceeds the glyph budget.
const sources = WORD_SOURCES.filter(source => source !== 'japan-post')
const upstreamPairs = await loadUpstreamOkurigana()
const additionalPairs = additionalOkurigana(upstreamPairs, okuriganaSupplement)
const upstreamDictionary = await loadDictionary()
const additions = additionalJapaneseReadings(upstreamDictionary, [...japanese.add, ...additionalPairs.filter(entry => entry.includes('['))])
const words = resolveOptions({ words: { ...japanese, add: additions } }).words
const planner = createFontPlanner(mergeJapaneseReadings(upstreamDictionary, words))

async function buildFace(baseName: string, family: string, stem: string, variable: boolean) {
  const source = BASE_FONTS.find(f => f.name === baseName)!
  const base = new Uint8Array(await readFile(await fetchBaseFont(source, cache)))
  const info = readFontInfo(base)
  const coverage = new Set(info.codepoints)
  const { plan, report } = planner(resolveOptions({ family, sources, words }), coverage)
  const contextual = addContextualWordReadings(plan, japanese.contextualWords)
  Object.assign(report.ivs.words, contextual.words)
  const japanesePlan = addNumericCharacterReadings(addNumericReadings(contextual.plan, japanese.numeric, coverage), japanese.numericCharacters, coverage)
  for (const [text, entries] of Map.groupBy(japanese.numericCharacters, entry => entry.text))
    report.ivs.kanji[text] = entries.map(entry => entry.reading)
  const bilingual = addEnglishReadings(japanesePlan, english, coverage)
  console.log('Base:', { family: info.family, style: info.style, glyphs: info.glyphCount })
  console.log('Japanese:', report.stats, 'English word forms:', bilingual.glyphs.length - japanesePlan.glyphs.length)
  const build = (p: typeof plan) => compileFont({ plan: p, base, subsetWasm, version, date, onProgress: ({ step, done, total }) => {
    if (done === null || done === total)
      console.log(`[${family}]`, step, done ?? '', total ?? '')
  } })
  let referenceGlyphs: number | undefined
  if (!variable) {
    const reference = await build({ ...japanesePlan, names: { ...plan.names, family: 'Rubifont Reference' } })
    await mkdir(new URL('.cache/rubifont/', root), { recursive: true })
    await writeFile(new URL('.cache/rubifont/JapaneseReference.otf', root), reference.font)
    referenceGlyphs = reference.glyphNames.length
  }
  const built = await build(bilingual)
  if (built.variable !== variable)
    throw new Error(`Unexpected variable state for ${family}: ${built.variable}`)
  const extension = built.outlines === 'truetype' ? 'ttf' : 'otf'
  const files = [`${stem}.${extension}`, `${stem}.woff2`]
  await writeFile(new URL(files[0]!, output), built.font)
  await writeFile(new URL(files[1]!, output), await toWoff2(built.font, brotli))
  await writeFile(new URL(`${stem}.ivs.json`, output), `${JSON.stringify(report.ivs)}\n`)
  return {
    readings: report.ivs,
    name: family,
    base: { name: source.name, url: source.url, sha256: createHash('sha256').update(base).digest('hex'), glyphs: info.glyphCount },
    japanese: report.stats,
    english: { words: english.length, wordForms: bilingual.glyphs.length - japanesePlan.glyphs.length, cases: ['lowercase', 'Titlecase', 'UPPERCASE'], apostrophes: ['\'', '’'] },
    glyphs: { ...(referenceGlyphs === undefined ? {} : { reference: referenceGlyphs }), bilingual: built.glyphNames.length, limit: 65535 },
    files,
  }
}

const { readings: regularReadings, ...regular } = await buildFace('Source Han Sans JP Regular', 'Rubifont Sans', 'RubifontSans-Regular', false)
const { readings: variableReadings, ...variable } = await buildFace('Source Han Sans JP VF', 'Rubifont Sans VF', 'RubifontSansVF', true)
function candidates(lists: typeof regularReadings, text: string): string[] | undefined {
  return [...text].length === 1
    ? lists.kanji[text]
    : lists.words[text]?.map(notation => parseNotation(notation).spans.map(span => span.ruby).join(''))
}
const contextReadings = japanese.context.map(({ selections, ...rule }) => ({
  ...rule,
  selections: selections.map(({ start, text, reading }) => {
    if ([...rule.text].slice(start, start + [...text].length).join('') !== text)
      throw new Error(`Invalid context selection: ${rule.text} / ${text}`)
    const index = candidates(regularReadings, text)?.indexOf(reading) ?? -1
    if (index < ([...text].length > 1 ? 1 : 0) || index >= 15 || candidates(variableReadings, text)?.[index] !== reading)
      throw new Error(`Unavailable context reading: ${text} / ${reading}`)
    return { start, count: [...text].length, salt: index + 1 }
  }),
}))
await writeFile(new URL('context-readings.json', output), `${JSON.stringify(contextReadings, null, 2)}\n`)
await writeFile(new URL('english-readings.json', output), `${JSON.stringify(english, null, 2)}\n`)
await writeFile(new URL('japanese-readings.json', output), `${JSON.stringify(japanese, null, 2)}\n`)
const pairs = buildOkurigana(upstreamPairs, additionalPairs, { readings: regularReadings.kanji, words: regularReadings.words, lone: regularReadings.lone })
const variablePairs = buildOkurigana(upstreamPairs, additionalPairs, { readings: variableReadings.kanji, words: variableReadings.words, lone: variableReadings.lone })
if (JSON.stringify(pairs) !== JSON.stringify(variablePairs))
  throw new Error('Regular and variable fonts need different okurigana tables')
const pairsFile = `${JSON.stringify(pairs, null, 2)}\n`
await writeFile(new URL('okurigana.json', output), pairsFile)
await writeRubifontPages(root, output, regular.japanese)
const manifest = {
  name: 'Rubifont Sans',
  version,
  fontDate: date.toISOString(),
  createdAt: new Date().toISOString(),
  upstreamVersion: '0.6.2',
  upstreamCommit: 'da8ddae359aab8ba3df43b5156fb77fb1aa2b2c3',
  japaneseSources: sources,
  japaneseSupplement: japanese,
  japaneseOkurigana: {
    file: 'okurigana.json',
    upstreamPairs: Object.values(upstreamPairs).flatMap(group => Object.values(group).flat()).length,
    additionalPairs: new Set(additionalPairs.map(entry => entry.replace(/\[[^\]]*\]/g, ''))).size,
    pairs: Object.values(pairs).flatMap(group => Object.values(group).flat()).length,
    ambiguous: Object.values(pairs).flatMap(group => group[''] ?? []).length,
    sha256: createHash('sha256').update(pairsFile).digest('hex'),
  },
  base: regular.base,
  japanese: regular.japanese,
  english: regular.english,
  glyphs: regular.glyphs,
  variable,
  files: await Promise.all([...regular.files, ...variable.files].map(async (name) => {
    const data = await readFile(new URL(name, output))
    return { name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }
  })),
}
await writeFile(new URL('build-manifest.json', output), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
