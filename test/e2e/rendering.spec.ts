/// <reference lib="dom" />
import type { Page } from '@playwright/test'
import type { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { VERSION_PROBE } from '@furifont/core'
import { expect, test } from '@playwright/test'
import { createOkuriganaReader } from '../../packages/helper-web/src/okurigana'
import { TEST_FONT, TEST_OTF, TEST_READINGS, TEST_ROMAJI_FONT, TEST_VARIABLE_FONT, WOFF2_PAGE } from './setup'

const ORIGIN = 'https://furifont.test'
const VS = (n: number): string => String.fromCodePoint(0xE01E0 + n)

/** Shows `body` on a page that has the test font, or another, as `Furifont`, at 40px. */
async function show(page: Page, body: string, file = TEST_FONT): Promise<void> {
  const font = await readFile(file)
  await page.route(`${ORIGIN}/**`, route => route.request().url().endsWith('.woff2')
    ? route.fulfill({ body: font, contentType: 'font/woff2' })
    : route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><meta charset="utf-8"><style>
          @font-face { font-family: Furifont; src: url(/test.woff2); font-weight: 250 900 }
          body { margin: 16px; font: 40px/normal Furifont; }
          p { margin: 0 0 8px; width: fit-content; }
          .off { font-feature-settings: "ss01"; }
        </style>${body}`,
      }))
  await page.goto(`${ORIGIN}/`)
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(() => page.evaluate(() => document.fonts.check('40px Furifont'))).toBe(true)
}

const shot = (page: Page, selector: string): Promise<Buffer> => page.locator(selector).screenshot()

// Generate the actual deliverable first: pnpm build && pnpm rubifont.
const RUBIFONT = process.env.RUBIFONT_TEST_FONT ?? new URL('../../outputs/RubifontSans-Regular.woff2', import.meta.url).pathname

for (const face of [
  { name: 'Regular', font: RUBIFONT, readings: 'RubifontSans-Regular.ivs.json' },
  { name: 'VF', font: process.env.RUBIFONT_TEST_VARIABLE_FONT ?? new URL('../../outputs/RubifontSansVF.woff2', import.meta.url).pathname, readings: 'RubifontSansVF.ivs.json' },
]) {
  test(`Rubifont reads the registered full-width number expressions (${face.name})`, async ({ page }) => {
    const texts = ['１つ', '２人', 'もう１つだけ', '２人で']
    await show(page, texts.map((text, i) => `<p id="on${i}" lang="ja">${text}</p><p id="off${i}" lang="ja" class="off">${text}</p>`).join('')
    + ['１１つ', '１２人', '２２人', '１', '２', '３人'].map((text, i) => `<p id="unknown${i}" lang="ja">${text}</p><p id="unknown-off${i}" lang="ja" class="off">${text}</p>`).join(''), face.font)
    for (let i = 0; i < texts.length; i++) {
      await expect(page.locator(`#on${i}`)).toHaveText(texts[i]!)
      expect(await shot(page, `#on${i}`), texts[i]).not.toEqual(await shot(page, `#off${i}`))
    }
    for (let i = 0; i < 6; i++)
      expect(await shot(page, `#unknown${i}`)).toEqual(await shot(page, `#unknown-off${i}`))
  })

  test(`Rubifont records the numeric script-boundary limitation (${face.name})`, async ({ page }) => {
    // The preceding hiragana takes ２ into its run, so the font never sees ２人 together.
    await show(page, '<p id="on" lang="ja">わたしたち２人で</p><p id="off" lang="ja" class="off">わたしたち２人で</p>', face.font)
    expect(await shot(page, '#on')).toEqual(await shot(page, '#off'))
  })

  test(`Rubifont reads the added lyric English forms (${face.name})`, async ({ page }) => {
    const texts = ['livin\'', 'fallin\'', 'leavin\'', 'lookin\'', 'nights', 'tryin\'', 'what\'s', 'meanin\'', 'midnight', 'wanna', 'ya', 'ya,', 'moonlight', 'freedom', 'don\'t', 'lonely', 'forever', 'suppose', 'let\'s', 'beginin\'', 'doin\'', 'somebody\'s']
    await show(page, texts.map((text, i) => `<p id="on${i}" lang="ja">${text}</p><p id="off${i}" lang="ja" class="off">${text}</p>`).join(''), face.font)
    for (let i = 0; i < texts.length; i++) {
      await expect(page.locator(`#on${i}`)).toHaveText(texts[i]!)
      expect(await shot(page, `#on${i}`), texts[i]).not.toEqual(await shot(page, `#off${i}`))
    }
  })

  test(`Rubifont reads 夜待 as よる・ま without a space (${face.name})`, async ({ page }) => {
    await show(page, `
      <p id="joined" lang="ja">夜待ち合わせ</p>
      <p id="separated" lang="ja"><span style="display:inline-block">夜</span><span style="display:inline-block">待</span>ち合わせ</p>
      <p id="off" lang="ja" class="off">夜待ち合わせ</p>`, face.font)
    await expect(page.locator('#joined')).toHaveText('夜待ち合わせ')
    // Independent shaping makes the existing lone readings the reference for each kanji.
    expect(await shot(page, '#joined')).toEqual(await shot(page, '#separated'))
    expect(await shotEms(page, '#joined', 2)).not.toEqual(await shotEms(page, '#off', 2))
  })

  test(`Rubifont keeps the reported lyric readings beside other kanji (${face.name})`, async ({ page }) => {
    const [pairs, ivs] = await Promise.all(['okurigana.json', face.readings].map(async name => JSON.parse(await readFile(new URL(`../../outputs/${name}`, import.meta.url), 'utf8'))))
    const reader = createOkuriganaReader({ pairs, readings: ivs.kanji, words: ivs.words, lone: ivs.lone })
    const salt = (kanji: string, reading: string): number => {
      const value = ivs.kanji[kanji].indexOf(reading) + 1
      expect(value, `${kanji}[${reading}]`).toBeGreaterThan(0)
      return value
    }
    const hito = salt('人', 'ひと')
    const ko = salt('娘', 'こ')
    expect(reader.find('街と人が')).toEqual([{ at: 2, length: 1, reading: 'ひと', salt: hito }])
    expect(ivs.lone.娘).toBe('むすめ')
    const selected = (kanji: string, value: number, isolated = false): string => `<span style="${isolated ? 'display:inline-block;' : ''}font-feature-settings:'salt' ${value}">${kanji}</span>`
    await show(page, `
      <p id="running" lang="ja">暗闇走り抜ける</p>
      <p id="running-reference" lang="ja">${selected('暗', salt('暗', 'くら'), true)}${selected('闇', salt('闇', 'やみ'), true)}${selected('走', salt('走', 'はし'), true)}り抜ける</p>
      <p id="person" lang="ja">街と${selected('人', hito)}が</p>
      <p id="person-reference" lang="ja">街と${selected('人', hito, true)}が</p>
      <p id="girl" lang="ja">あの${selected('娘', ko)}</p>
      <p id="girl-reference" lang="ja">あの${selected('娘', ko, true)}</p>
      <p id="girl-default" lang="ja">あの娘</p>
      <p id="girl-default-reference" lang="ja">あの<span style="display:inline-block">娘</span></p>`, face.font)
    for (const id of ['running', 'person', 'girl', 'girl-default'])
      expect(await shot(page, `#${id}`), id).toEqual(await shot(page, `#${id}-reference`))
    await expect(page.locator('#running')).toHaveText('暗闇走り抜ける')
    await expect(page.locator('#person')).toHaveText('街と人が')
    await expect(page.locator('#girl')).toHaveText('あの娘')
    expect(await shot(page, '#girl')).not.toEqual(await shot(page, '#girl-default'))
  })

  test(`Rubifont selects digit readings across the numeric script boundary (${face.name})`, async ({ page }) => {
    const ivs = JSON.parse(await readFile(new URL(`../../outputs/${face.readings}`, import.meta.url), 'utf8'))
    const ri = ivs.kanji.人.indexOf('り') + 1
    expect(ri).toBeGreaterThan(0)
    const selected = (text: string, value: number, isolated: boolean): string => `<span style="${isolated ? 'display:inline-block;' : ''}font-feature-settings:'salt' ${value}">${text}</span>`
    const cases = [
      { digit: '1', after: 'つだけ', prefix: 'もう', person: false },
      { digit: '１', after: 'つだけ', prefix: 'もう', person: false },
      { digit: '2', after: 'でいても離れていても', prefix: 'わたしたち', person: true },
      { digit: '２', after: 'でいても離れていても', prefix: 'わたしたち', person: true },
    ]
    const markup = (sample: typeof cases[number], isolated: boolean): string => `${sample.prefix}${selected(sample.digit, 1, isolated)}${sample.person ? selected('人', ri, isolated) : ''}${sample.after}`
    await show(page, cases.map((sample, i) => `<p id="numeric${i}" lang="ja">${markup(sample, false)}</p><p id="numeric-reference${i}" lang="ja">${markup(sample, true)}</p><p id="numeric-off${i}" lang="ja" class="off">${sample.prefix}${sample.digit}${sample.person ? '人' : ''}${sample.after}</p>`).join(''), face.font)
    for (let i = 0; i < cases.length; i++) {
      expect(await shot(page, `#numeric${i}`), cases[i]!.digit).toEqual(await shot(page, `#numeric-reference${i}`))
      expect(await shot(page, `#numeric${i}`), cases[i]!.digit).not.toEqual(await shot(page, `#numeric-off${i}`))
      await expect(page.locator(`#numeric${i}`)).toHaveText(`${cases[i]!.prefix}${cases[i]!.digit}${cases[i]!.person ? '人' : ''}${cases[i]!.after}`)
    }
  })

  test(`Rubifont reads the newly reported lyric phrases with limited context (${face.name})`, async ({ page }) => {
    const [ivs, contexts, english] = await Promise.all([face.readings, 'context-readings.json', 'english-readings.json'].map(async name => JSON.parse(await readFile(new URL(`../../outputs/${name}`, import.meta.url), 'utf8'))))
    const salt = (text: string, reading: string): number => {
      const value = ivs.kanji[text].indexOf(reading) + 1
      expect(value, `${text}[${reading}]`).toBeGreaterThan(0)
      return value
    }
    interface Selection { start: number, count: number, salt: number }
    const cases = [
      { text: '2つの国と', readings: [['2', 'ふた']], contexts: 1 },
      { text: '２つの国と', readings: [['２', 'ふた']], contexts: 1 },
      { text: 'あの時感じた', readings: [['時', 'とき'], ['感', 'かん']], contexts: 0 },
      { text: '不満の声', readings: [['声', 'こえ']], contexts: 1 },
      { text: 'あなたの声聞きたくて', readings: [['声', 'こえ'], ['聞', 'き']], contexts: 0 },
      { text: '金のハンドルで街を飛びまわれ', readings: [['金', 'きん']], contexts: 1 },
      { text: '胸の鼓動焼きつけろ', readings: [['鼓', 'こ'], ['動', 'どう'], ['焼', 'や']], contexts: 0 },
      { text: 'AH AH いくつかの場面', readings: [], contexts: 0 },
    ]
    const markup = (text: string, selections: Selection[], isolated: boolean): string => selections.toSorted((a, b) => b.start - a.start).reduce((html, selection) => `${html.slice(0, selection.start)}<span style="${isolated ? 'display:inline-block;' : ''}font-feature-settings:'salt' ${selection.salt}">${html.slice(selection.start, selection.start + selection.count)}</span>${html.slice(selection.start + selection.count)}`, text)
    const source = (text: string): Selection[] => contexts.flatMap((rule: { text: string, selections: Selection[] }) => {
      const start = text.indexOf(rule.text)
      return start < 0 ? [] : rule.selections.map(selection => ({ ...selection, start: start + selection.start }))
    })
    expect(english.find((entry: { word: string, reading: string }) => entry.word === 'ah')?.reading).toBe('アー')
    expect(ivs.lone.金).toBe('かね')
    expect(ivs.words.声聞).toEqual(['声[こえ]聞[き]', '声[しょう]聞[もん]'])
    await show(page, `${cases.map((sample, i) => {
      const selections = source(sample.text)
      expect(selections, sample.text).toHaveLength(sample.contexts)
      const reference = sample.readings.length
        ? markup(sample.text, sample.readings.map(([text, reading]) => ({ start: sample.text.indexOf(text!), count: text!.length, salt: salt(text!, reading!) })), true)
        : sample.text.replaceAll('AH', '<span style="display:inline-block">AH</span>')
      return `<p id="reported${i}" lang="ja">${markup(sample.text, selections, false)}</p><p id="reported-reference${i}" lang="ja">${reference}</p><p id="reported-off${i}" lang="ja" class="off">${sample.text}</p>`
    }).join('')}<p id="default-gold" lang="ja">金</p><p id="default-gold-reference" lang="ja">${markup('金', [{ start: 0, count: 1, salt: salt('金', 'かね') }], true)}</p><p id="voice-default" lang="ja">声聞</p><p id="voice-alternate" lang="ja"><span style="font-feature-settings:'salt' 2">声聞</span></p>`, face.font)
    for (let i = 0; i < cases.length; i++) {
      await expect(page.locator(`#reported${i}`)).toHaveText(cases[i]!.text)
      if (cases[i]!.text.startsWith('AH')) {
        // Chromium rounds each inline-block's variable advance separately
        // (404.703125px together / 404.75px separated). Compare the first AH's
        // full ruby and glyphs before this rounding accumulates across the line.
        expect(await shotEms(page, `#reported${i}`, 1.35)).toEqual(await shotEms(page, `#reported-reference${i}`, 1.35))
        const widths = await Promise.all([`#reported${i}`, `#reported-reference${i}`].map(selector => page.locator(selector).evaluate(element => element.getBoundingClientRect().width)))
        expect(Math.abs(widths[0]! - widths[1]!)).toBeLessThan(0.1)
      }
      else {
        expect(await shot(page, `#reported${i}`), cases[i]!.text).toEqual(await shot(page, `#reported-reference${i}`))
      }
      expect(await shot(page, `#reported${i}`), cases[i]!.text).not.toEqual(await shot(page, `#reported-off${i}`))
    }
    expect(await shot(page, '#default-gold')).toEqual(await shot(page, '#default-gold-reference'))
    expect(await shot(page, '#voice-default')).not.toEqual(await shot(page, '#voice-alternate'))
  })

  test(`Rubifont distinguishes numeric readings and draws the new English words (${face.name})`, async ({ page }) => {
    const [ivs, contexts, english] = await Promise.all([face.readings, 'context-readings.json', 'english-readings.json'].map(async name => JSON.parse(await readFile(new URL(`../../outputs/${name}`, import.meta.url), 'utf8'))))
    for (const digit of ['1', '１'])
      expect(ivs.kanji[digit]).toEqual(['ひと', 'いち'])
    const nichi = ivs.kanji.日.indexOf('にち') + 1
    expect(nichi).toBe(1)
    const selected = (text: string, salt: number, isolated = false): string => `<span style="${isolated ? 'display:inline-block;' : ''}font-feature-settings:'salt' ${salt}">${text}</span>`
    const words = [{ word: 'candy', reading: 'キャンディ' }, { word: 'pretty', reading: 'プリティ' }, { word: 'doll', reading: 'ドール' }]
    for (const entry of words)
      expect(english.find((item: { word: string }) => item.word === entry.word)).toEqual(entry)
    const forms = words.flatMap(({ word }) => [word, word[0]!.toUpperCase() + word.slice(1), word.toUpperCase()])
    await show(page, `${['1', '１'].map((digit, i) => {
      const day = contexts.find((rule: { text: string }) => rule.text === `${digit}日`)
      const one = contexts.find((rule: { text: string }) => rule.text === `${digit}つ`)
      expect(day.selections).toEqual([{ start: 0, count: 1, salt: 2 }, { start: 1, count: 1, salt: nichi }])
      expect(one.selections).toEqual([{ start: 0, count: 1, salt: 1 }])
      return `<p id="day${i}" lang="ja">${selected(digit, day.selections[0].salt)}${selected('日', day.selections[1].salt)}</p><p id="day-reference${i}" lang="ja">${selected(digit, 2, true)}${selected('日', nichi, true)}</p><p id="one${i}" lang="ja">${selected(digit, one.selections[0].salt)}つ</p><p id="one-reference${i}" lang="ja">${selected(digit, 1, true)}つ</p>`
    }).join('')}${forms.map((text, i) => `<p id="new-english${i}" lang="ja">${text}</p><p id="new-english-off${i}" lang="ja" class="off">${text}</p>`).join('')}`, face.font)
    for (let i = 0; i < 2; i++) {
      expect(await shot(page, `#day${i}`)).toEqual(await shot(page, `#day-reference${i}`))
      expect(await shot(page, `#one${i}`)).toEqual(await shot(page, `#one-reference${i}`))
    }
    for (let i = 0; i < forms.length; i++)
      expect(await shot(page, `#new-english${i}`), forms[i]).not.toEqual(await shot(page, `#new-english-off${i}`))
  })

  test(`Rubifont reads 人生楽ありゃ and 中走 without changing other 人生楽 phrases (${face.name})`, async ({ page }) => {
    const [ivs, contexts, pairs] = await Promise.all([face.readings, 'context-readings.json', 'okurigana.json'].map(async name => JSON.parse(await readFile(new URL(`../../outputs/${name}`, import.meta.url), 'utf8'))))
    const reader = createOkuriganaReader({ pairs, readings: ivs.kanji, words: ivs.words, lone: ivs.lone })
    interface Selection { start: number, count: number, salt: number }
    const salt = (text: string, reading: string): number => {
      const choices: string[] = ivs.kanji[text]
      expect(choices, text).toContain(reading)
      return choices.indexOf(reading) + 1
    }
    const markup = (text: string, selections: Selection[], isolated: boolean): string => selections.toSorted((a, b) => b.start - a.start).reduce((html, selection) => `${html.slice(0, selection.start)}<span style="${isolated ? 'display:inline-block;' : ''}font-feature-settings:'salt' ${selection.salt}">${html.slice(selection.start, selection.start + selection.count)}</span>${html.slice(selection.start + selection.count)}`, text)
    const cases = [
      { text: 'あぁ、愛で全部抱きしめて愛して', readings: [['全', 'ぜん'], ['部', 'ぶ'], ['抱', 'だ']] },
      { text: '抱きしめて', readings: [['抱', 'だ']] },
      { text: '受け入れて', readings: [['入', 'い']] },
      { text: '終わんないで 見続けてる 逃さないで', readings: [['終', 'お']] },
      { text: 'Oh 人生楽ありゃ苦あり', readings: [['人', 'じん'], ['生', 'せい'], ['楽', 'らく'], ['苦', 'く']] },
      { text: '大きな声で 自由に歌っているの', readings: [['声', 'こえ']] },
      { text: 'もっと楽に生きていきたい', readings: [['楽', 'らく']] },
      { text: '今朝もミニのスカートで 人ゴミの中走ってく', readings: [['人', 'ひと'], ['中', 'なか'], ['走', 'はし']] },
      { text: '人ゴミ', readings: [['人', 'ひと']] },
      { text: 'ゴミの中走っていく', readings: [['中', 'なか'], ['走', 'はし']] },
      { text: '走っていく', readings: [['走', 'はし']] },
    ]
    expect(ivs.words.人生楽).toEqual(['人[じん]生[せい]楽', '人[じん]生[せい]楽[らく]'])
    const contextual = contexts.find((rule: { text: string }) => rule.text === '人生楽ありゃ')
    expect(contextual.selections).toEqual([{ start: 0, count: 3, salt: 2 }])
    const unchanged = ['人生楽しい', '人生楽しむ', '人生楽']
    await show(page, `${cases.map((sample, i) => {
      const selections: Selection[] = reader.find(sample.text).map(match => ({ start: match.at, count: match.length, salt: match.salt }))
      for (const context of contexts) {
        const start = sample.text.indexOf(context.text)
        if (start >= 0)
          selections.push(...context.selections.map((selection: Selection) => ({ ...selection, start: start + selection.start })))
      }
      const expected = sample.readings.map(([text, reading]) => ({ start: sample.text.indexOf(text!), count: text!.length, salt: salt(text!, reading!) }))
      const reference = [...selections.filter(selection => !expected.some(item => selection.start < item.start + item.count && item.start < selection.start + selection.count)), ...expected]
      return `<p id="latest${i}" lang="ja">${markup(sample.text, selections, false)}</p><p id="latest-reference${i}" lang="ja">${markup(sample.text, reference, true)}</p>`
    }).join('')}${unchanged.map((text, i) => `<p id="unchanged${i}" lang="ja">${text}</p><p id="unchanged-reference${i}" lang="ja"><span style="display:inline-block">人生</span><span style="display:inline-block;font-feature-settings:'ss01'">楽</span>${text.slice(3)}</p>`).join('')}`, face.font)
    for (let i = 0; i < cases.length; i++) {
      await expect(page.locator(`#latest${i}`)).toHaveText(cases[i]!.text)
      expect(await shot(page, `#latest${i}`), cases[i]!.text).toEqual(await shot(page, `#latest-reference${i}`))
    }
    for (let i = 0; i < unchanged.length; i++)
      expect(await shot(page, `#unchanged${i}`), unchanged[i]).toEqual(await shot(page, `#unchanged-reference${i}`))
  })

  test(`Rubifont okurigana pairs switch a reading while keeping the original text (${face.name})`, async ({ page }) => {
    const [pairs, ivs] = await Promise.all(['okurigana.json', face.readings].map(async name => JSON.parse(await readFile(new URL(`../../outputs/${name}`, import.meta.url), 'utf8'))))
    const reader = createOkuriganaReader({ pairs, readings: ivs.kanji, words: ivs.words, lone: ivs.lone })
    const switched = [
      { text: '綾', kanji: '綾', reading: 'あや' },
      { text: '蔭', kanji: '蔭', reading: 'かげ' },
      { text: '意', kanji: '意', reading: 'い' },
      { text: '娘', kanji: '娘', reading: 'こ' },
      { text: '方が', kanji: '方', reading: 'ほお' },
      { text: '哀く', kanji: '哀', reading: 'かなし' },
      { text: '出を', kanji: '出', reading: 'で' },
      { text: '来ない', kanji: '来', reading: 'こ' },
      { text: '来る', kanji: '来', reading: 'く' },
      { text: '重い', kanji: '重', reading: 'おも' },
      { text: '失う', kanji: '失', reading: 'うしな' },
      { text: '上の', kanji: '上', reading: 'うえ' },
    ]
    for (const { text, kanji, reading } of switched) {
      const salt = ivs.kanji[kanji].indexOf(reading) + 1
      expect(salt, text).toBeGreaterThan(0)
      // The standalone regression cases exercise explicit selection; the others use okurigana.
      if (text !== kanji)
        expect(reader.find(text), text).toEqual([{ at: 0, length: kanji.length, reading, salt }])
    }
    // The upstream ambiguous pair wins over an independent custom reading.
    expect(pairs.止['']).toContain('めた')
    expect(reader.find('止めた')).toEqual([])
    const texts = [...switched.map(({ text }) => text), '来て', '止まった', '失くした', '止めた']
    const markup = (text: string) => {
      const explicit = switched.find(item => item.text === text && item.text === item.kanji)
      const matches = explicit ? [{ at: 0, length: text.length, salt: ivs.kanji[text].indexOf(explicit.reading) + 1 }] : reader.find(text)
      return matches.toReversed().reduce((html, match) => `${html.slice(0, match.at)}<span style="font-feature-settings:'salt' ${match.salt}">${html.slice(match.at, match.at + match.length)}</span>${html.slice(match.at + match.length)}`, text)
    }
    await show(page, texts.map((text, i) => `<p id="pair${i}" lang="ja">${markup(text)}</p><p id="plain${i}" lang="ja">${text}</p>`).join(''), face.font)
    for (let i = 0; i < texts.length; i++)
      await expect(page.locator(`#pair${i}`)).toHaveText(texts[i]!)
    for (let i = 0; i < switched.length; i++) {
      await expect(page.locator(`#pair${i} span`)).toHaveCount(1)
      expect(await shot(page, `#pair${i}`), texts[i]).not.toEqual(await shot(page, `#plain${i}`))
    }
    const ambiguous = texts.indexOf('止めた')
    await expect(page.locator(`#pair${ambiguous} span`)).toHaveCount(0)
    expect(await shot(page, `#pair${ambiguous}`)).toEqual(await shot(page, `#plain${ambiguous}`))
  })
}

test('Rubifont draws English and Japanese ruby from the delivered WOFF2', async ({ page }) => {
  const texts = ['save', 'Save', 'SAVE', 'hello', 'Hello', 'HELLO', 'file', 'File', 'confirm', 'profile', 'Settings', 'Download', '日本語', '今日', '日本語Save今日', '保存してSaveを押す', 'network', 'NETWORK', 'computer', 'language', 'water', 'the', 'a', 'I', 'English', 'Japanese', 'wonder', 'gonna', 'survive', 'knives', 'sacrifice', 'wrinkle', 'twinkle', 'can\'t', 'Can\'t', 'CAN\'T', 'can’t', 'Can’t', 'CAN’T', 'I\'m', 'I’m', 'heart\'s', 'heart’s', 'makeup\'s', 'makeup’s', 'didn\'t', 'didn’t', 'hurting', 'felt', '抱いた', '止めた', '触れた', '嫌いな', '消えた', 'あの日', '負けたくない', '決して', '頼る', '来て', '閉じる', 'wanting', 'recognize', 'seems', 'speck', 'breaking', 'nite', 'saw', 'tides', 'caught', 'desperation', 'helpless', 'falling', 'sensation', 'endlessly', 'hoping', 'it\'d', 'i’ll', 'ways', 'cuz', 'feels', 'wondering', 'eyes', 'arms', 'singin', 'sigh', 'breath\'s', 'keeps', 'coming', 'oh', 'dawn', 'starts', 'expectations', 'engulfs', 'speculations', 'patience', 'cadence', 'shoulder', 'plunge', 'rests', 'you\'ve', 'held', '冷たく', '中', '陽がおとす', '重なる', '命の', '指の', '出して', '時は', '一つ', '出す', '光の', '全てを', 'ends', 'endless', '止まった', '失くした', 'singin\'', 'Singin’', 'SINGIN\'', 'hello’', 'Save\'']
  await show(page, texts.map((text, i) => `<p id="on${i}" lang="ja">${text}</p><p id="off${i}" lang="ja" class="off">${text}</p><p id="english${i}" lang="en">${text}</p>`).join(''), RUBIFONT)
  for (let i = 0; i < texts.length; i++) {
    expect(await shot(page, `#on${i}`), texts[i]).not.toEqual(await shot(page, `#off${i}`))
    // Internal quotes are drawn in the shared word glyph; a final quote keeps the base font's locale-specific shape.
    if (/[a-z]['’][a-z]/i.test(texts[i]!))
      expect(await shot(page, `#on${i}`), texts[i]).toEqual(await shot(page, `#english${i}`))
  }
  expect(await page.locator('#on14').textContent()).toBe('日本語Save今日')
  expect(await page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.querySelector('#on14')!)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    return selection.toString()
  })).toBe('日本語Save今日')
})

test('Rubifont leaves unknown words and word fragments unchanged', async ({ page }) => {
  const texts = ['qzxvunknown', 'autosaveqzxv', 'savesave', 'SaveSettings', 'save2', '2save', 'save_', '_save', 'saveé', 'ésave', 'save\'s', 'save’s', 'sAvE', 'profilex', 'offline2', 'office\'s', 'xcan\'t', 'can\'tx', 'can’t2', 'can’t’s', 'xdidn\'t', 'didn\'tx', 'didn’t2', 'hurtingx', 'felts', 'xrecognize', 'recognize2', 'xit’d', 'it’d2', 'breath’sx', 'you’vex', 'singinx', 'ends2', 'xendless', 'singin\'x', 'singin’2', 'singin\'\'', '\'singin']
  await show(page, texts.map((text, i) => `<p id="on${i}" lang="ja">${text}</p><p id="off${i}" lang="ja" class="off">${text}</p>`).join(''), RUBIFONT)
  for (let i = 0; i < texts.length; i++)
    expect(await shot(page, `#on${i}`), texts[i]).toEqual(await shot(page, `#off${i}`))
})

// The variable TTF and its compressed WOFF2 must draw the same ruby at every weight.
const RUBIFONT_VARIABLE = process.env.RUBIFONT_TEST_VARIABLE_FONT ?? new URL('../../outputs/RubifontSansVF.woff2', import.meta.url).pathname
const RUBIFONT_VARIABLE_TTF = process.env.RUBIFONT_TEST_VARIABLE_TTF ?? new URL('../../outputs/RubifontSansVF.ttf', import.meta.url).pathname

test('Rubifont variable TTF and WOFF2 vary Japanese and English ruby together', async ({ page }) => {
  const weights = [250, 400, 900]
  // A fractional English advance can leave antialiased ink in the next pixel.
  // One pixel of horizontal padding isolates the line-height clipping check.
  const body = `<style>p { padding-right: 1px }</style>${weights.map(weight => `
    <p id="on${weight}" lang="ja" style="font-weight:${weight}">日本語 Save singin' Singin’ SINGIN' 止まった 失くした</p>
    <p id="off${weight}" lang="ja" class="off" style="font-weight:${weight}">日本語 Save singin' Singin’ SINGIN' 止まった 失くした</p>
    <p id="clipped${weight}" lang="ja" style="font-weight:${weight};overflow:hidden">日本語 Save singin' Singin’ SINGIN' 止まった 失くした</p>
    <p id="unknown${weight}" style="font-weight:${weight}">qzxvunknown save2</p>
    <p id="unknown-off${weight}" class="off" style="font-weight:${weight}">qzxvunknown save2</p>`).join('')}`
  const pictures: Buffer[][] = []
  for (const file of [RUBIFONT_VARIABLE_TTF, RUBIFONT_VARIABLE]) {
    await show(page, body, file)
    const samples: Buffer[] = []
    for (const weight of weights) {
      const on = await shot(page, `#on${weight}`)
      expect(on).not.toEqual(await shot(page, `#off${weight}`))
      expect(on).toEqual(await shot(page, `#clipped${weight}`))
      expect(await shot(page, `#unknown${weight}`)).toEqual(await shot(page, `#unknown-off${weight}`))
      samples.push(on)
    }
    expect(samples[0]).not.toEqual(samples[1])
    expect(samples[1]).not.toEqual(samples[2])
    pictures.push(samples)
  }
  expect(pictures[0]).toEqual(pictures[1])
})

test('draws ruby that ss01 turns off', async ({ page }) => {
  await show(page, '<p id="on">日本</p><p id="off" class="off">日本</p>')
  expect(await shot(page, '#on')).not.toEqual(await shot(page, '#off'))
})

/** The first `ems` characters of `selector`, ruby included. */
async function shotEms(page: Page, selector: string, ems: number): Promise<Buffer> {
  await page.locator(selector).scrollIntoViewIfNeeded()
  const box = (await page.locator(selector).boundingBox())!
  return page.screenshot({ clip: { x: box.x, y: box.y, width: ems * 40, height: box.height } })
}

test('puts romaji over kana by the kana of its run, beside the kanji\'s, and ss01 turns it off', async ({ page }) => {
  await show(page, `
    <p id="on">かな</p><p id="off" class="off">かな</p>
    <p id="kya">きゃ</p><p id="kia">きあ</p>
    <p id="kk">っか</p><p id="ks">っさ</p>
    <p id="word">日本の</p><p id="kanji">日本</p>`, TEST_ROMAJI_FONT)
  expect(await shot(page, '#on')).not.toEqual(await shot(page, '#off'))
  // kya spans both kana, so き alone does not show ki.
  expect(await shotEms(page, '#kya', 1)).not.toEqual(await shotEms(page, '#kia', 1))
  // っ shows the consonant it doubles.
  expect(await shotEms(page, '#kk', 1)).not.toEqual(await shotEms(page, '#ks', 1))
  expect(await shotEms(page, '#word', 2)).toEqual(await shotEms(page, '#kanji', 2))
})

test('reads a kanji no word claims after another kanji as a suffix, before a kanji only if it seldom starts words', async ({ page }) => {
  // 京学 is no word: 学 reads がく, as it does ending most runs. 都 starts more runs than it ends: と ending 読都, nothing inside 読都読.
  await show(page, `
    <p id="suffix">京学</p><p id="suffix-off" class="off">京学</p>
    <p id="end">読都</p><p id="end-off" class="off">読都</p>
    <p id="inside">読都読</p><p id="inside-off" class="off">読都読</p>`)
  expect(await shot(page, '#suffix')).not.toEqual(await shot(page, '#suffix-off'))
  expect(await shot(page, '#end')).not.toEqual(await shot(page, '#end-off'))
  expect(await shot(page, '#inside')).toEqual(await shot(page, '#inside-off'))
})

test('picks a reading with a variation selector, or none', async ({ page }) => {
  await show(page, `
    <p id="default">市場</p><p id="second">市${VS(2)}場</p>
    <p id="suppressed">日${VS(0)}本</p><p id="plain" class="off">日本</p>`)
  expect(await shot(page, '#second')).not.toEqual(await shot(page, '#default'))
  expect(await shot(page, '#suppressed')).toEqual(await shot(page, '#plain'))
})

test('picks a reading of a kanji with salt on markup, as a selector does in the text', async ({ page }) => {
  // 来 is こ in 来ない: the font never sees the ない, so the markup has to say it.
  const { kanji } = JSON.parse(await readFile(TEST_READINGS, 'utf8')) as { kanji: Record<string, string[]> }
  const salt = kanji['来']!.indexOf('こ') + 1
  expect(salt).toBeGreaterThan(0)
  await show(page, `
    <p id="salt"><span style="font-feature-settings:'salt' ${salt}">来</span>ない</p>
    <p id="selector">来${VS(salt)}ない</p><p id="plain">来ない</p>
    <p id="zero"><span style="font-feature-settings:'salt' 0">来</span>ない</p>`)
  expect(await shot(page, '#salt')).toEqual(await shot(page, '#selector'))
  expect(await shot(page, '#salt')).not.toEqual(await shot(page, '#plain'))
  expect(await shot(page, '#zero')).toEqual(await shot(page, '#plain'))
})

test('picks the reading of a word with salt on a span around its kanji, and leaves the second kanji alone', async ({ page, browserName }) => {
  // 今日 is こんにち before では, and 日日 shows that only the first kanji of a run takes salt.
  const { words } = JSON.parse(await readFile(TEST_READINGS, 'utf8')) as { words: Record<string, string[]> }
  const salt = words['今日']!.findIndex(w => w.startsWith('今[こん]')) + 1
  expect(salt).toBeGreaterThan(1)
  const on = `font-feature-settings:'salt' ${salt}`
  await show(page, `
    <p id="salt"><span style="${on}">今日</span>では</p>
    <p id="selector">今${VS(salt)}日では</p><p id="plain">今日では</p>
    <p id="gate"><span style="${on}">日日</span></p><p id="split"><span style="${on}">日</span>日</p>`)
  expect(await shot(page, '#salt')).not.toEqual(await shot(page, '#plain'))
  expect(await shot(page, '#gate')).toEqual(await shot(page, '#split'))
  // WebKit draws a word's selector as the first kanji's own reading: the selector is what is wrong there, not salt.
  if (browserName !== 'webkit')
    expect(await shot(page, '#salt')).toEqual(await shot(page, '#selector'))
})

test('draws a variable font\'s ruby at the weight of the text, inside its line', async ({ page }) => {
  await show(page, `
    <p id="light" style="font-weight:250">日本</p><p id="heavy" style="font-weight:900">日本</p>
    <p id="clipped" style="font-weight:900;overflow:hidden">日本</p>`, TEST_VARIABLE_FONT)
  /** The band above the em box, where the ruby is. */
  const ruby = async (selector: string): Promise<Buffer> => {
    const box = (await page.locator(selector).boundingBox())!
    return page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height * 0.3 } })
  }
  expect(await ruby('#heavy')).not.toEqual(await ruby('#light'))
  expect(await shot(page, '#clipped')).toEqual(await shot(page, '#heavy'))
})

test('fits the ruby in the default line height', async ({ page }) => {
  // Clipped to its line box, the ruby must still show in full.
  await show(page, '<p id="clipped" style="overflow:hidden">日本</p><p id="free" style="overflow:visible">日本</p>')
  expect(await shot(page, '#clipped')).toEqual(await shot(page, '#free'))
})

test('tells a canvas its version by the width of its probe', async ({ page }) => {
  await show(page, '<p>日本</p>')
  // The test font is 0.0.0: two ems and no thousandths, which WebKit measures a little short.
  expect(await page.evaluate((probe) => {
    const context = document.createElement('canvas').getContext('2d')!
    context.font = '1000px Furifont'
    return Math.round(context.measureText(probe).width)
  }, String.fromCodePoint(VERSION_PROBE.base, VERSION_PROBE.selector))).toBe(2000)
})

// Firefox compresses with its own Brotli; Chromium and Playwright's WebKit have no Brotli compression stream and load brotli-wasm.
test('compresses a WOFF2 in the browser that draws like its OpenType font', async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/')
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><script type="module" src="/woff2.js"></script>' })
    return route.fulfill({ path: path === '/test.otf' ? TEST_OTF : join(WOFF2_PAGE, path) })
  })
  await page.goto(`${ORIGIN}/`)
  await page.waitForFunction(() => 'toWoff2' in window)
  const sizes = await page.evaluate(async () => {
    const otf = new Uint8Array(await (await fetch('/test.otf')).arrayBuffer())
    const woff2 = await window.toWoff2(otf)
    for (const [family, data] of [['OTF', otf], ['WOFF2', woff2]] as const)
      document.fonts.add(await new FontFace(family, data).load())
    document.body.innerHTML = '<p id="otf" style="font: 40px OTF">日本語の市場</p><p id="woff2" style="font: 40px WOFF2">日本語の市場</p>'
    return { otf: otf.length, woff2: woff2.length }
  })
  expect(sizes.woff2).toBeLessThan(sizes.otf)
  expect(await shot(page, '#woff2')).toEqual(await shot(page, '#otf'))
})
