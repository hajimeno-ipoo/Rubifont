import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { loadDictionary } from '@furifont/dictionary'
import { additionalJapaneseReadings } from './rubifont-japanese.ts'

const requested = process.argv.slice(2)
if (!requested.length)
  throw new Error('Usage: pnpm rubifont:japanese \'来[く]る\'')
const file = new URL('../rubifont/japanese.json', import.meta.url)
const current: { add: string[], pin: string[] } = JSON.parse(await readFile(file, 'utf8'))
const upstream = await loadDictionary()
const additions = requested.map(entry => ({ entry, missing: additionalJapaneseReadings(upstream, [entry]) }))
const next = { ...current, add: additionalJapaneseReadings(upstream, [...current.add, ...additions.flatMap(a => a.missing)]) }
if (JSON.stringify(next) !== JSON.stringify(current))
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`)
for (const { entry, missing } of additions)
  console.log(missing.length ? `独自の読み候補に登録済み: ${missing.join('、')}` : `本家の読みを使用（独自のaddには追加しません）: ${entry}`)
