# Rubifont Sans Regular 0.4.0

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

日本語はFurifont v0.5.0の辞書と読み規則を使い、従来の辞書ソースから228,356件の読みパターン、単独の漢字1,703字への読みを収録しています。新規の日本郵便の住所データは字形上限を超えるため、このフォントへの追加対象から外しています。v0.5.0では、部品の組み合わせで同じ読みになる単語の規則を整理しています。従来の271,747件について、読みと読みが付く範囲を生成規則の全件比較で維持できることを確認しています。パターン数は読める単語の総数ではありません。すべての漢字に読みが付くわけではなく、誤読もありえます。
読み選択用の異体字セレクター・`salt`の番号は、辞書の更新で変わる場合があります。番号を指定する場合は、同梱の`RubifontSans-Regular.ivs.json`を使ってください。
送り仮名による読み分けを補助するJavaScriptは、この配布物には含みません。
横書き、Regularの一種類です。アプリのOpenType対応や行間設定によって表示が異なります。
`font-feature-settings: 'ss01' 1`で日英の読みを非表示にできます。
検索・コピーの対象となる本文は元の文字列です。利用するアプリでの動作は確認してください。

MacのChromium・WebKit・CoreTextで通常の読み表示を確認しています。
WebKitでは異体字セレクターによる単語の別読み指定が正しく働かない場合があります。これは読みを自動で表示する通常の利用とは別の機能です。
MacのFirefox、Font Bookへのインストール・個々の文書アプリでの操作は未確認です。環境別の検証結果は同梱の`verification.md`に記載します。

## 再生成

Node.js 22.18以上と、このリポジトリで指定したpnpmを使います。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
node scripts/build-rubifont.ts
```

出力先はリポジトリ直下の`outputs/`です。ビルドは日本語比較用のフォントも`.cache/rubifont/`へ保存します。
試作用の出力先は`pnpm rubifont .cache/rubifont/upstream-candidate/`のように指定できます。
初回はAdobeのSource Han Sans JP Regularを取得し、`.cache/fonts/`へ保存します。
英語の読みは`rubifont/english.json`で編集します。生成済みのフォントはGitに登録しません。

## 出典とライセンス

- 基にしたコード：[antfu/furifont](https://github.com/antfu/furifont)、MIT。`CODE-LICENSE.md`を同梱。
- 基にした書体：Adobe Source Han Sans JP。派生フォントはSIL OFL 1.1。`OFL.txt`を同梱。
- 日本語辞書・読み規則：`DATA-LICENSE.md`記載の各データ。主にCC BY-SA 4.0、TatoebaはCC BY 2.0 FR。
- 英語2,562語：Rubifont用に作成。外部辞書の転載なし。この一覧はCC0 1.0として提供します。
- Rubifontの追加コード：MIT。

元データの配布条件は、同梱のライセンス文書を確認してください。生成元・容量・SHA-256は`build-manifest.json`に記録します。
