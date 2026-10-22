import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { additionalOkurigana, loadUpstreamOkurigana } from './rubifont-okurigana.ts'

const requested = process.argv.slice(2)
if (!requested.length)
  throw new Error('Usage: pnpm rubifont:okurigana \'来[こ]ない\'')
const file = new URL('../rubifont/okurigana.json', import.meta.url)
const current: string[] = JSON.parse(await readFile(file, 'utf8'))
const upstream = await loadUpstreamOkurigana()
const additions = additionalOkurigana(upstream, requested)
const next = additionalOkurigana(upstream, [...current, ...additions])
if (JSON.stringify(next) !== JSON.stringify(current))
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`)
for (const entry of requested)
  console.log(additions.includes(entry) ? `独自の送り仮名に登録済み: ${entry}` : `本家の送り仮名を使用（独自には追加しません）: ${entry}`)
