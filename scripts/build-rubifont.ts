/** Build the bilingual Regular and variable fonts without changing upstream presets. */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { BASE_FONTS, compileFont, readFontInfo, toWoff2 } from '@furifont/compiler'
import { brotli, subsetWasm } from '@furifont/compiler/node'
import { addEnglishReadings, createFontPlanner, resolveOptions, WORD_SOURCES } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'
import { fetchBaseFont } from '../packages/cli/src/base-fonts.ts'
import english from '../rubifont/english.json' with { type: 'json' }
import japanese from '../rubifont/japanese.json' with { type: 'json' }
import { mergeJapaneseReadings } from './rubifont-japanese.ts'
import { writeRubifontPages } from './rubifont-pages.ts'

const root = new URL('../', import.meta.url)
const output = new URL(process.argv[2] ?? 'outputs/', root)
const cache = fileURLToPath(new URL('.cache/fonts/', root))
// Fixed release epoch: midnight in Japan. Rebuilding the same inputs keeps font bytes stable.
const date = new Date('2026-10-21T00:00:00+09:00')
const version = '0.6.2'
await mkdir(output, { recursive: true })
// Keep the existing sources. The postal-address source alone exceeds the glyph budget.
const sources = WORD_SOURCES.filter(source => source !== 'japan-post')
const words = resolveOptions({ words: japanese }).words
const planner = createFontPlanner(mergeJapaneseReadings(await loadDictionary(), words))

async function buildFace(baseName: string, family: string, stem: string, variable: boolean) {
  const source = BASE_FONTS.find(f => f.name === baseName)!
  const base = new Uint8Array(await readFile(await fetchBaseFont(source, cache)))
  const info = readFontInfo(base)
  const coverage = new Set(info.codepoints)
  const { plan, report } = planner(resolveOptions({ family, sources, words }), coverage)
  const bilingual = addEnglishReadings(plan, english, coverage)
  console.log('Base:', { family: info.family, style: info.style, glyphs: info.glyphCount })
  console.log('Japanese:', report.stats, 'English word forms:', bilingual.glyphs.length - plan.glyphs.length)
  const build = (p: typeof plan) => compileFont({ plan: p, base, subsetWasm, version, date, onProgress: ({ step, done, total }) => {
    if (done === null || done === total)
      console.log(`[${family}]`, step, done ?? '', total ?? '')
  } })
  let referenceGlyphs: number | undefined
  if (!variable) {
    const reference = await build({ ...plan, names: { ...plan.names, family: 'Rubifont Reference' } })
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
    name: family,
    base: { name: source.name, url: source.url, sha256: createHash('sha256').update(base).digest('hex'), glyphs: info.glyphCount },
    japanese: report.stats,
    english: { words: english.length, wordForms: bilingual.glyphs.length - plan.glyphs.length, cases: ['lowercase', 'Titlecase', 'UPPERCASE'], apostrophes: ['\'', '’'] },
    glyphs: { ...(referenceGlyphs === undefined ? {} : { reference: referenceGlyphs }), bilingual: built.glyphNames.length, limit: 65535 },
    files,
  }
}

const regular = await buildFace('Source Han Sans JP Regular', 'Rubifont Sans', 'RubifontSans-Regular', false)
const variable = await buildFace('Source Han Sans JP VF', 'Rubifont Sans VF', 'RubifontSansVF', true)
await writeFile(new URL('english-readings.json', output), `${JSON.stringify(english, null, 2)}\n`)
await writeFile(new URL('japanese-readings.json', output), `${JSON.stringify(japanese, null, 2)}\n`)
await writeRubifontPages(root, output, regular.japanese)
const manifest = {
  name: 'Rubifont Sans',
  version,
  fontDate: date.toISOString(),
  createdAt: new Date().toISOString(),
  upstreamVersion: '0.6.1',
  upstreamCommit: 'afcb999aac301225b3b69b9a06c18add32aff471',
  japaneseSources: sources,
  japaneseSupplement: japanese,
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
