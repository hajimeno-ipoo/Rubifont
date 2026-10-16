/** Build the bilingual font and its Japanese reference without changing upstream presets. */
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
import { writeRubifontPages } from './rubifont-pages.ts'

const root = new URL('../', import.meta.url)
const output = new URL(process.argv[2] ?? 'outputs/', root)
const cache = fileURLToPath(new URL('.cache/fonts/', root))
// Fixed release epoch: midnight in Japan. Rebuilding the same inputs keeps font bytes stable.
const date = new Date('2026-10-16T00:00:00+09:00')
const version = '0.4.0'
await mkdir(output, { recursive: true })
const source = BASE_FONTS.find(f => f.name === 'Source Han Sans JP Regular')!
const base = new Uint8Array(await readFile(await fetchBaseFont(source, cache)))
const info = readFontInfo(base)
console.log('Base:', { family: info.family, style: info.style, glyphs: info.glyphCount })
const coverage = new Set(info.codepoints)
// Keep the existing sources. The new postal-address source alone exceeds the glyph budget.
const sources = WORD_SOURCES.filter(source => source !== 'japan-post')
const { plan, report } = createFontPlanner(await loadDictionary())(resolveOptions({ family: 'Rubifont Sans', sources }), coverage)
const bilingual = addEnglishReadings(plan, english, coverage)
console.log('Japanese:', report.stats, 'English word forms:', bilingual.glyphs.length - plan.glyphs.length)
async function build(p: typeof plan) {
  return compileFont({ plan: p, base, subsetWasm, version, date, onProgress: ({ step, done, total }) => {
    if (done === null || done === total)
      console.log(step, done ?? '', total ?? '')
  } })
}
console.log('Building the Japanese reference')
const reference = await build({ ...plan, names: { ...plan.names, family: 'Rubifont Reference' } })
await mkdir(new URL('.cache/rubifont/', root), { recursive: true })
await writeFile(new URL('.cache/rubifont/JapaneseReference.otf', root), reference.font)
console.log('Building Rubifont Sans Regular')
const built = await build(bilingual)
await writeFile(new URL('RubifontSans-Regular.otf', output), built.font)
await writeFile(new URL('RubifontSans-Regular.woff2', output), await toWoff2(built.font, brotli))
await writeFile(new URL('RubifontSans-Regular.ivs.json', output), `${JSON.stringify(report.ivs)}\n`)
await writeFile(new URL('english-readings.json', output), `${JSON.stringify(english, null, 2)}\n`)
await writeRubifontPages(root, output, report.stats)
const files = ['RubifontSans-Regular.otf', 'RubifontSans-Regular.woff2']
const manifest = {
  name: 'Rubifont Sans Regular',
  version,
  fontDate: date.toISOString(),
  createdAt: new Date().toISOString(),
  upstreamVersion: '0.5.0',
  upstreamCommit: 'c8fc985db18860cfe2b3f48e87714302253e9a36',
  japaneseSources: sources,
  base: { name: source.name, url: source.url, sha256: createHash('sha256').update(base).digest('hex'), glyphs: info.glyphCount },
  japanese: report.stats,
  english: { words: english.length, wordForms: bilingual.glyphs.length - plan.glyphs.length, cases: ['lowercase', 'Titlecase', 'UPPERCASE'] },
  glyphs: { reference: reference.glyphNames.length, bilingual: built.glyphNames.length, limit: 65535 },
  files: await Promise.all(files.map(async (name) => {
    const data = await readFile(new URL(name, output))
    return { name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }
  })),
}
await writeFile(new URL('build-manifest.json', output), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
