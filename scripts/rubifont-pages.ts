import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import english from '../rubifont/english.json' with { type: 'json' }

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Write the specimen and UTF-8 documentation without rebuilding the fonts. */
export async function writeRubifontPages(root: URL, output: URL, japanese: { patterns: number, isolated: number }): Promise<void> {
  await mkdir(output, { recursive: true })
  const count = (value: number) => value.toLocaleString('ja-JP')
  const fontRevision = createHash('sha256').update(await readFile(new URL('RubifontSans-Regular.woff2', output))).digest('hex').slice(0, 12)
  const forms = english.reduce((total, { word }) => total + new Set([word, word[0]!.toUpperCase() + word.slice(1), word.toUpperCase()]).size, 0)
  const japaneseCoverage = `<p>日本語はFurifont v0.6.1の辞書・読み規則を使い、漢字の上にひらがなを表示します。従来の辞書ソースを収録し、日本郵便の住所データは、英語と同じフォントに収めるため追加対象から外しています。</p>
<ul><li>単語・地名の読みパターン：${count(japanese.patterns)}件</li><li>単独の漢字への読み設定：${count(japanese.isolated)}字</li></ul>
<p>部品の組み合わせで同じ読みになる単語の規則を整理しています。件数は生成時に採用した読みパターンの数です。日本語の単語をすべて正しく読めることを示す数ではありません。辞書にない語や、文脈で読みが変わる語には限界があり、読みが付かない場合や誤読もあります。</p>
<p>WebKitでは異体字セレクターによる単語の別読み指定が正しく働かない場合があります。読みを自動で表示する通常の利用とは別の機能です。読みの指定番号は辞書の更新で変わる場合があるため、同じ版のRubifontSans-Regular.ivs.jsonを使ってください。</p>`
  const withCoverage = (html: string) => html
    .replace('<!-- JAPANESE_COVERAGE -->', japaneseCoverage)
    .replaceAll('<!-- ENGLISH_COUNT -->', count(english.length))
    .replaceAll('<!-- FORM_COUNT -->', count(forms))
  const specimen = await readFile(new URL('rubifont/specimen.html', root), 'utf8')
  await writeFile(new URL('index.html', output), withCoverage(specimen)
    .replace('FONT_REVISION', fontRevision)
    .replace('/* ENGLISH_WORDS */[]', JSON.stringify(english)), 'utf8')
  const list = await readFile(new URL('rubifont/english.html', root), 'utf8')
  const rows = english.map(({ word, reading }) => `<tr><td lang="en">${escapeHtml(word)}</td><td>${escapeHtml(reading)}</td></tr>`).join('\n')
  await writeFile(new URL('english.html', output), withCoverage(list)
    .replace('<!-- ENGLISH_ROWS -->', rows), 'utf8')
  let usage = await readFile(new URL('rubifont/usage.html', root), 'utf8')
  for (const [from, to, placeholder] of [
    ['OFL.txt', 'OFL.txt', 'FONT_LICENSE'],
    ['LICENSE.md', 'CODE-LICENSE.md', 'CODE_LICENSE'],
    ['packages/dictionary/LICENSE.md', 'DATA-LICENSE.md', 'DATA_LICENSE'],
    ['rubifont/README.md', 'README.md', null],
  ] as const) {
    await copyFile(new URL(from, root), new URL(to, output))
    if (placeholder) {
      const text = await readFile(new URL(from, root), 'utf8')
      usage = usage.replace(`<!-- ${placeholder} -->`, escapeHtml(text))
    }
  }
  await writeFile(new URL('usage.html', output), withCoverage(usage), 'utf8')
}
