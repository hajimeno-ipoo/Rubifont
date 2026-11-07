# Rubifont

Rubifontは、日本語の漢字にひらがな、登録した英単語にカタカナのルビを付けるフォントです。日英が混ざった文章でも使えます。たとえば `save`、`Save`、`SAVE` には、いずれも「セーブ」と表示します。ルビはフォントが描くので、本文の文字は変わりません。

[Rubifont 0.7.0 試用版をダウンロード（ZIP）](https://github.com/hajimeno-ipoo/Rubifont/releases/download/rubifont-v0.7.0/Rubifont-0.7.0.zip) · [リリースノート](https://github.com/hajimeno-ipoo/Rubifont/releases/tag/rubifont-v0.7.0)

## 使い方

まずZIPを展開し、`index.html` をブラウザで開いてみてください。見本の文章を書き換えて表示を試せます。英語の対応語は `english.html` に載っています。

| 書体 | インストール用 | Web用 |
| --- | --- | --- |
| Rubifont Sans Regular（標準の太さ） | `RubifontSans-Regular.otf` | `RubifontSans-Regular.woff2` |
| Rubifont Sans VF（太さ250〜900） | `RubifontSansVF.ttf` | `RubifontSansVF.woff2` |

同梱の2書体は横書き用です。読みの対応範囲は共通で、両方をインストールできます。

### Macで使う

1. 使いたい書体のOTFまたはTTFを開き、Font Bookでインストールします。
2. 使いたいアプリのフォント一覧から、Regularなら「Rubifont Sans」、可変版なら「Rubifont Sans VF」を選びます。

太さの指定方法やルビの表示はアプリによって異なります。ルビが切れる場合は行間を広げてください。

### Webサイトで使う

`RubifontSans-Regular.woff2` をページと同じフォルダに置き、CSSで読み込みます。

```css
@font-face {
  font-family: 'Rubifont Sans';
  src: url('./RubifontSans-Regular.woff2') format('woff2');
  font-weight: 400;
}
.reading {
  font-family: 'Rubifont Sans', sans-serif;
  font-weight: 400;
  line-height: 1.9;
}
```

```html
<p class="reading">日本語で Hello。Settings を開いて Save。</p>
```

可変版を使う場合は、上のCSSでファイル名を `RubifontSansVF.woff2` に替え、`@font-face` の `font-weight` を `250 900` にします。表示する太さは `.reading` の `font-weight` で選びます。ルビをまとめて非表示にするには、本文に `font-feature-settings: 'ss01' 1` を指定してください。

## 対応する読み

| 対象 | 0.7.0の収録範囲 |
| --- | --- |
| 日本語 | 228,382の読みパターンと、単独漢字1,727字への読み設定 |
| 英語 | 登録した2,684語・8,113表記。小文字・頭大文字・全大文字に対応 |

日本語はFurifontの辞書にRubifont独自の読みを加えています。読みパターン数はフォントが持つ規則の件数です。辞書にない語や文脈で読み分ける語では、ルビが付かなかったり、意図と異なる読みが付いたりすることがあります。日本郵便の住所データは字形数の上限に収めるため収録対象から外しています。

英語は対応語一覧に載っている表記にルビが付きます。カタカナは発音の目安です。登録済みの短縮形や所有形には、`can't` と `can’t` のように両方のアポストロフィが使えます。登録語の直後にアポストロフィだけが付く `singin'` や `singin’` も対象です。

### 別の読みを指定する

フォント単体では送り仮名や前後の文脈を使って読みを自動で切り替えられません。たとえば「来」は通常「き」と表示するので、「来る」を「くる」と表示するには「く」を指定します。Webでは、別読みの指定にOpenTypeの `salt` または異体字セレクターを使えます。

| 同梱データ | 用途 |
| --- | --- |
| `RubifontSans-Regular.ivs.json`、`RubifontSansVF.ivs.json` | 書体ごとの別読みと指定番号の一覧 |
| `okurigana.json` | 「来ない」の「来＝こ」など、送り仮名に応じた読み |
| `context-readings.json` | 「あの娘」の「娘＝こ」など、特定の表記に応じた読み |

アプリ側で送り仮名や文脈に応じた読みを表示する場合は、フォントと同じ配布版の対応表を組み合わせて使います。WebKitでは異体字セレクターで指定した単語の別読みが表示に反映されない場合があります。検証環境と結果はZIP内の `verification.md` をご覧ください。

## 0.7.0で変わったこと

Furifont v0.7.0の辞書修正を取り込み、「東大＝とうだい」「税込＝ぜいこみ」などの読みを更新しました。本家のアプリとCLIには縦書き用フォントの生成機能が入り、ユーザースクリプトにはサイト別設定が加わりました。

[これまでの更新履歴](docs/rubifont-changelog.md) · [公開済みの配布版](https://github.com/hajimeno-ipoo/Rubifont/releases)

## フォントを再生成する

Node.js 22.18以上と、`package.json` で指定したpnpmを使います。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm rubifont
```

フォント、対応表、見本ページは `outputs/` に生成します。初回はAdobeの元フォントを取得し、`.cache/fonts/` に保存します。

生成処理は `scripts/build-rubifont.ts` にあります。英語の読みは `rubifont/english.json`、日本語の追加読みと通常読みの指定は `rubifont/japanese.json` の `add` と `pin` で管理します。

```sh
pnpm rubifont:japanese '来[く]る'
pnpm rubifont:okurigana '来[こ]ない'
```

1行目はフォントの読み候補を登録するコマンドです。2行目は送り仮名に応じた読みを `rubifont/okurigana.json` に登録します。どちらも本家に同じ読みや対応がある場合は、そのデータを使います。変更を出力へ反映するには `pnpm rubifont` を実行してください。

## 出典とライセンス

Anthony FuのFurifont v0.7.0を基に、AdobeのSource Han Sans JP RegularとSource Han Sans JP VFから生成しています。[FurifontのREADMEと謝辞](https://github.com/antfu/furifont/blob/v0.7.0/README.md)

| 対象 | ライセンス |
| --- | --- |
| FurifontとRubifontのコード | [MIT](LICENSE.md) |
| 生成したフォント | [SIL Open Font License 1.1](OFL.txt) |
| 日本語の辞書と読み規則 | 主にCC BY-SA 4.0。TatoebaはCC BY 2.0 FR。[出典と個別条件](packages/dictionary/LICENSE.md) |
| Rubifont独自の英語の読みと日本語追加辞書 | CC0 1.0 |

ZIPにはライセンス文書、生成記録の `build-manifest.json`、確認結果の `verification.md` も同梱しています。
