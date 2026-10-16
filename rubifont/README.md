# Rubifont Sans Regular 0.2.0

漢字の上にひらがな、登録した英単語の上にカタカナを表示するフォントです。Furifontを基に作成しています。

[ソースコード](https://github.com/hajimeno-ipoo/Rubifont)・[配布版](https://github.com/hajimeno-ipoo/Rubifont/releases)

## 使い方

- Macへのインストール：`RubifontSans-Regular.otf`を開き、Font Bookでインストールします。
- Web：`RubifontSans-Regular.woff2`を`@font-face`で読み込みます。
- 見本：同じフォルダの`index.html`をブラウザで開きます。
- 使い方・ライセンス：`usage.html`を開くと、日本語の説明とライセンス原文を読めます。
- 英語の対応語一覧：`english.html`で英単語とカタカナの読みを確認できます。
- 日本語の対応範囲：見本ページ、英語の一覧、使い方のページに、生成時の読みパターン数と読み分けの限界を掲載しています。

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

英語は`english-readings.json`の2,562語に対応します。小文字、頭だけ大文字、全大文字の3表記を収録しています。
複数形や活用形も一覧にある表記だけが対象です。未知語、任意の大小文字混在、文脈による読み分けは対象外です。カタカナは発音の目安です。
英字・数字・アクセント文字・アンダースコア・アポストロフィーに続く部分一致は抑制します。
文字列が別の要素や書式に分割される場合、フォントから見える範囲も分割されます。

日本語の辞書と読み選択は元のFurifontの標準設定を引き継ぎます。すべての漢字に読みが付くわけではなく、誤読もありえます。
送り仮名による読み分けを補助するJavaScriptは、この配布物には含みません。
横書き、Regularの一種類です。アプリのOpenType対応や行間設定によって表示が異なります。
`font-feature-settings: 'ss01' 1`で日英の読みを非表示にできます。
検索・コピーの対象となる本文は元の文字列です。利用するアプリでの動作は確認してください。

MacのChromium・WebKit・CoreTextと、Linux CIのChromium・Firefoxで読み表示を確認しています。
Linux版WebKitでは英語の読み表示テストが失敗しています。MacのFirefox、Font Bookへのインストール・個々の文書アプリでの操作は未確認です。

## 再生成

Node.js 22.18以上と、このリポジトリで指定したpnpmを使います。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
node scripts/build-rubifont.ts
```

出力先はリポジトリ直下の`outputs/`です。ビルドは日本語比較用のフォントも`.cache/rubifont/`へ保存します。
初回はAdobeのSource Han Sans JP Regularを取得し、`.cache/fonts/`へ保存します。
英語の読みは`rubifont/english.json`で編集します。生成済みのフォントはGitに登録しません。

## 出典とライセンス

- 基にしたコード：[antfu/furifont](https://github.com/antfu/furifont)、MIT。`CODE-LICENSE.md`を同梱。
- 基にした書体：Adobe Source Han Sans JP。派生フォントはSIL OFL 1.1。`OFL.txt`を同梱。
- 日本語辞書・読み規則：`DATA-LICENSE.md`記載の各データ。主にCC BY-SA 4.0、TatoebaはCC BY 2.0 FR。
- 英語2,562語：Rubifont用に作成。外部辞書の転載なし。この一覧はCC0 1.0として提供します。
- Rubifontの追加コード：MIT。

元データの配布条件は、同梱のライセンス文書を確認してください。生成元・容量・SHA-256は`build-manifest.json`に記録します。
