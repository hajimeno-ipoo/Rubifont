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

test('Rubifont okurigana pairs switch a reading while keeping the original text', async ({ page }) => {
  const [pairs, ivs] = await Promise.all(['okurigana.json', 'RubifontSans-Regular.ivs.json'].map(async name => JSON.parse(await readFile(new URL(`../../outputs/${name}`, import.meta.url), 'utf8'))))
  const reader = createOkuriganaReader({ pairs, readings: ivs.kanji, words: ivs.words, lone: ivs.lone })
  expect(reader.find('来る')).toEqual([expect.objectContaining({ reading: 'く' })])
  expect(reader.find('止めた')).toEqual([])
  const texts = ['来て', '来る', '止まった', '失くした', '止めた']
  const markup = (text: string) => reader.find(text).toReversed().reduce((html, match) => `${html.slice(0, match.at)}<span style="font-feature-settings:'salt' ${match.salt}">${html.slice(match.at, match.at + match.length)}</span>${html.slice(match.at + match.length)}`, text)
  await show(page, texts.map((text, i) => `<p id="pair${i}">${markup(text)}</p><p id="plain${i}">${text}</p>`).join(''), RUBIFONT)
  for (let i = 0; i < texts.length; i++)
    await expect(page.locator(`#pair${i}`)).toHaveText(texts[i]!)
  expect(await shot(page, '#pair1')).not.toEqual(await shot(page, '#plain1'))
  expect(await shot(page, '#pair4')).toEqual(await shot(page, '#plain4'))
})

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
