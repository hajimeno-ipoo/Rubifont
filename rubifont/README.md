# Rubifont Sans 0.6.6

漢字の上にひらがな、登録した英単語の上にカタカナを表示するフォントです。同じ文章の中で、日本語と英語の両方に読みを添えられます。

[配布版をダウンロード](https://github.com/hajimeno-ipoo/Rubifont/releases/tag/rubifont-v0.6.6) · [ソースコード](https://github.com/hajimeno-ipoo/Rubifont)

## 主な機能

- 漢字・単語に、辞書に基づくひらがなの読みを表示します。
- 英語2,657語・8,020表記に対応します。`save`・`Save`・`SAVE`のような小文字・頭だけ大文字・全大文字に同じ読みが付きます。
- 本文の文字データは元のままです。読みはフォントの文字の形として表示します。
- Webでは`font-feature-settings: 'ss01' 1`で日英の読みをまとめて非表示にできます。

横書きのRubifont Sans Regularと、太さを250〜900の範囲で指定できる可変フォントRubifont Sans VFを同梱しています。読みの対応範囲は共通です。別のフォント名なので、両方をインストールして使えます。

| 書体 | インストール用 | Web用 |
| --- | --- | --- |
| Rubifont Sans Regular | `RubifontSans-Regular.otf` | `RubifontSans-Regular.woff2` |
| Rubifont Sans VF | `RubifontSansVF.ttf` | `RubifontSansVF.woff2` |

## 使い方

### Macで使う

1. 配布ZIPを展開します。
2. `RubifontSans-Regular.otf`を開き、Font Bookでインストールします。
3. 使いたいアプリで、フォントを「Rubifont Sans」に指定します。

可変フォントを使う場合は`RubifontSansVF.ttf`をインストールし、「Rubifont Sans VF」を選びます。太さをどのように指定できるかは、利用するアプリによって異なります。

読みが切れる場合は行間を広げてください。表示はアプリのOpenType対応や組版の設定によって異なります。

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

### 同梱ページで試す

ZIPを展開したフォルダで、次のHTMLファイルを開いてください。

| ファイル | 内容 |
| --- | --- |
| `index.html` | 自分の文章で試せる見本 |
| `usage.html` | 使い方とライセンス原文 |
| `english.html` | 英単語とカタカナ読みの対応一覧 |

登録した短縮形・所有形は、`can't`・`can’t`のような直線形と曲線形のアポストロフィに対応します。未登録の短縮形や所有形へ、自動で読みを付ける機能はありません。登録済みの単語の末尾に単独の`'`・`’`が付く場合も、記号を残したまま読みを表示します。たとえば`singin`・`singin'`・`singin’`には「シンギン」が付きます。`singin'x`や未登録の`save's`のように、アポストロフィの後ろにも文字が続く表記は対象外です。

## 対応範囲と制限

日本語は本家の辞書に、Rubifont独自の追加辞書を合わせています。追加辞書では23漢字の通常読みを指定しています。同じ漢字が単独で現れるほかの語にも適用されます。たとえば「重＝かさ」「出＝だ」「失＝な」の指定は、「重い」「出る」「失う」にも適用されるため、異なる読みでは別読みの指定が必要です。「来」は「き」、「止」は「と」を通常表示し、「く」「や」も別読みとして収録しています。「来る」を「くる」、「止めた」を「やめた」と表示する場合は別読みの指定が必要です。フォント単体では、送り仮名や文脈による自動切替には対応していません。

送り仮名に応じた読みの切り替えに使う対応表を、`okurigana.json`として同梱しています。独自辞書に登録した送り仮名付きの表記24件を収録し、「来て→き」「来る→く」「止まった→と」「失くした→な」などを参照できます。「止めた」の2通りの読みは曖昧な対応として残し、通常読みの「と」を使います。利用側の読み切替処理で、この対応表と、使用する書体の`.ivs.json`を組み合わせてください。既存の`createOkuriganaReader`に対応する形式です。

日本語は228,368の読みパターンと、単独漢字1,725字への読み設定を収録しています。パターン数は生成規則の数で、正しく読める単語の総数ではありません。部品の組み合わせで同じ読みになる単語もあります。日本郵便の住所データは、字形数の上限を超えるため収録対象から外しています。

英語は同梱の`english-readings.json`にある2,657語が対象です。複数形や活用形も一覧にある表記だけに対応します。カタカナは発音の目安で、未知語、任意の大小文字混在、文脈による発音の変更には対応しません。

日本語も、辞書や文脈による限界があり、誤読や読みが付かない場合があります。送り仮名による読み分けを補助するJavaScriptは同梱していません。

単語が別の要素や書式に分かれると、フォントから見える範囲も分かれます。英語では、前後の英字・数字・アクセント文字・アンダースコア・アポストロフィーを確認し、単語の一部分への読み付けを抑制します。

WebKitでは、異体字セレクターによる単語の別読み指定が正しく働かない場合があります。異体字セレクターや`salt`で読みを指定する場合は、同じ配布版の、Regularには`RubifontSans-Regular.ivs.json`、可変フォントには`RubifontSansVF.ivs.json`を使ってください。指定番号は更新によって変わる場合があります。

Firefoxの描画は未確認です。確認した環境と検証結果の詳細は、同梱の`verification.md`をご覧ください。生成元・容量・SHA-256は`build-manifest.json`に記録しています。

## 出典とライセンス

Anthony Fuの[Furifont](https://github.com/antfu/furifont)を基に、英語のカタカナ読みと、日本語の追加辞書を組み込んでいます。基準はFurifont v0.6.2、書体はAdobeのSource Han Sans JP RegularとSource Han Sans JP VFです。

| 対象 | ライセンス |
| --- | --- |
| FurifontのコードとRubifontの追加コード | MIT。`CODE-LICENSE.md`を同梱 |
| 生成フォント | SIL Open Font License 1.1。`OFL.txt`を同梱 |
| 日本語辞書・読み規則 | 主にCC BY-SA 4.0、TatoebaはCC BY 2.0 FR。出典と個別条件は`DATA-LICENSE.md`に記載 |
| Rubifont用に作成した英語2,657語の一覧と日本語追加辞書 | CC0 1.0。外部辞書の転載はありません |

## 開発者向け：フォントの再生成

再生成には、配布ZIPとは別に[ソースコード](https://github.com/hajimeno-ipoo/Rubifont)を取得してください。リポジトリ内でNode.js 22.18以上と、`package.json`で指定したpnpmを使います。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm rubifont
```

出力先はリポジトリ直下の`outputs/`です。初回はAdobeの元フォントを取得し、`.cache/fonts/`へ保存します。日本語の追加辞書は`rubifont/japanese.json`、英語の一覧は`rubifont/english.json`で編集できます。
