# Rubifont

漢字の上にひらがな、登録した英単語の上にカタカナを表示するフォントです。同じ文章の中で、日本語と英語の両方に読みを添えられます。

横書きの **Rubifont Sans Regular** と、太さを250〜900の範囲で指定できる可変フォント **Rubifont Sans VF** を用意しています。別のフォント名なので、両方をインストールして使えます。

## 主な機能

- 日本語の漢字・単語に、辞書に基づくひらがなの読みを表示します。
- 英語2,614語に対応し、小文字・頭だけ大文字・全大文字の7,879表記を収録しています。たとえば`save`・`Save`・`SAVE`には「セーブ」が付きます。
- 本文の文字データは元のままです。読みはフォントの文字の形として表示します。
- Webでは`font-feature-settings: 'ss01' 1`で、日英の読みをまとめて非表示にできます。

## ダウンロード

[Rubifont 0.6.3のZIPをダウンロード](https://github.com/hajimeno-ipoo/Rubifont/releases/download/rubifont-v0.6.3/Rubifont-0.6.3.zip)

ほかの配布版は[Releases](https://github.com/hajimeno-ipoo/Rubifont/releases)から取得できます。ZIPを展開すると、次のファイルを使えます。

| ファイル | 用途 |
| --- | --- |
| `RubifontSans-Regular.otf` | Regularのインストール用フォント |
| `RubifontSans-Regular.woff2` | RegularのWeb用フォント |
| `RubifontSansVF.ttf` | 可変フォントのインストール用ファイル |
| `RubifontSansVF.woff2` | 可変フォントのWeb用ファイル |
| `index.html` | 自分の文章を入力できる見本ページ |
| `usage.html` | 使い方とライセンス原文 |
| `english.html` | 英単語とカタカナ読みの対応一覧 |

ZIPには、読み選択用の一覧、生成記録、検証報告書、ライセンス文書も同梱しています。

## 使い方

### Macで使う

1. ダウンロードしたZIPを展開します。
2. `RubifontSans-Regular.otf`を開き、Font Bookでインストールします。
3. 使いたいアプリで、フォントを「Rubifont Sans」に指定します。

可変フォントを使う場合は`RubifontSansVF.ttf`をインストールし、「Rubifont Sans VF」を選びます。太さをどのように指定できるかは、利用するアプリによって異なります。

読みが切れる場合は、アプリの行間設定を広げてください。表示はアプリのOpenType対応や組版の設定によって異なります。

### Webサイトで使う

`RubifontSans-Regular.woff2`をページと同じフォルダに置き、CSSで読み込みます。

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

可変フォントは`RubifontSansVF.woff2`を置き、次のように読み込みます。`font-weight`で250〜900の太さを指定できます。

```css
@font-face {
  font-family: 'Rubifont Sans VF';
  src: url('./RubifontSansVF.woff2') format('woff2');
  font-weight: 250 900;
}
.reading-variable {
  font-family: 'Rubifont Sans VF', sans-serif;
  font-weight: 400;
  line-height: 1.9;
}
```

```html
<p class="reading-variable">日本語で Hello。Settings を開いて Save。</p>
```

ダウンロードしたZIPの`index.html`を開くと、Webページを作らずに表示を試せます。

登録した短縮形・所有形は、`can't`・`can’t`のような直線形と曲線形のアポストロフィに対応します。未登録の短縮形や所有形へ、自動で読みを付ける機能はありません。

## 対応範囲と制限

| 対象 | 対応内容 |
| --- | --- |
| 日本語 | 228,368の読みパターンと、単独漢字1,716字への読み設定 |
| 英語 | 登録した2,614語・7,879表記。複数形や活用形は一覧にある表記のみ |
| 書体 | 横書きのSans RegularとSans VF（太さ250〜900）。読みの対応範囲は共通 |

日本語は本家の辞書に、Rubifont独自の追加辞書を合わせています。追加辞書では11漢字の通常読みを指定しています。同じ漢字が単独で現れるほかの語にも適用されます。「来」は「き」、「止」は「や」を通常表示し、「く」「と」も別読みとして収録しています。「来る」を「くる」、「止めた」を「とめた」と表示する場合は別読みの指定が必要です。送り仮名や文脈による自動切替には対応していません。

日本語のパターン数は生成規則の数で、正しく読める単語の総数ではありません。部品の組み合わせで同じ読みになる単語もあります。日本郵便の住所データは、フォントの字形数の上限を超えるため収録対象から外しています。

辞書にない語や、文脈によって読みが変わる語には対応できない場合があります。日本語の誤読や、読みが付かない場合もあります。英語のカタカナは発音の目安で、未知語や任意の大小文字混在、文脈による発音の変更には対応しません。

単語が別の要素や書式に分かれると、フォントから見える範囲も分かれます。英語では、長い単語の一部分へ読みが付かないよう、前後の英字・数字などを確認しています。

WebKitでは、異体字セレクターによる単語の別読み指定が正しく働かない場合があります。読みを指定する場合は、同じ配布版の、Regularには`RubifontSans-Regular.ivs.json`、可変フォントには`RubifontSansVF.ivs.json`を使ってください。

Firefoxの描画は未確認です。確認した環境と検証結果の詳細は、配布ZIP内の`verification.md`をご覧ください。

## 出典とライセンス

Anthony Fuの[Furifont](https://github.com/antfu/furifont)を基に、英語のカタカナ読みと、日本語の追加辞書を組み込んでいます。現在の基準はFurifont v0.6.2です。書体にはAdobeのSource Han Sans JP RegularとSource Han Sans JP VFを使用しています。

| 対象 | ライセンス |
| --- | --- |
| FurifontのコードとRubifontの追加コード | [MIT](LICENSE.md) |
| 生成フォント | [SIL Open Font License 1.1](OFL.txt) |
| 日本語辞書・読み規則 | 主にCC BY-SA 4.0、TatoebaはCC BY 2.0 FR。[出典と個別条件](packages/dictionary/LICENSE.md) |
| Rubifont用に作成した英語2,614語の一覧と日本語追加辞書 | CC0 1.0。外部辞書の転載はありません |

配布ZIPには、`CODE-LICENSE.md`・`OFL.txt`・`DATA-LICENSE.md`としてライセンス文書を同梱しています。基になったFurifontの説明・謝辞は[元のREADME](https://github.com/antfu/furifont/blob/v0.6.2/README.md)を参照してください。

## 開発者向け：フォントの再生成

ソースコードを取得したリポジトリで、Node.js 22.18以上と`package.json`で指定したpnpmを使います。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm rubifont
```

フォント・見本ページ・対応語一覧は`outputs/`へ生成します。初回はAdobeの元フォントを取得し、`.cache/fonts/`へ保存します。

日本語の追加辞書は`rubifont/japanese.json`、英語の一覧は`rubifont/english.json`、生成処理は`scripts/build-rubifont.ts`です。構成の詳細は[開発用の説明](<FOR[hazimeno_ipoo].md>)を参照してください。
