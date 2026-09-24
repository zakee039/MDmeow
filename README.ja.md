[简体中文](README.md) · [English](README.en.md) · **日本語** · [Deutsch](README.de.md)

# MDmeow

> **開いたら、すぐ仕事。**
>
> **AI 時代のための、軽快で美しく、レビューを中心にした Markdown / コード文書ツール。**

[🌐 オンラインデモ](https://mdmeow.zakee.fun)

AI 時代では、文書の多くが空白ページから始まるとは限りません。Agent、LLM、スクリプト、自動化ツールが先に内容を生成し、人が最後に確認する場面が増えています。

README、設計案、研究ノート、JSON、YAML、コード断片、ログ。人が実際によく行う流れは：

**開く → 読む → レビューする → 少し直す → 保存する。**

MDmeow は、この流れのために作られています。

IDE でも、大規模なナレッジベースでもありません。メモ帳のようにすぐ開き、整形文書のように読みやすく、必要なときには Markdown・設定ファイル・コードの構造も理解できるツールを目指しています。

**ファイルを開けば、すぐ読める。必要なところだけ、その場で直せる。**

これが MDmeow の中心です。**開いたら、すぐ仕事。**

## レビューを優先、編集は必要な分だけ

Markdown は整形された文書として開きます。JSON、YAML、Python、Rust、JavaScript、設定ファイル、テキストは軽量な Code モードで開きます。

色、行番号、交互行背景、フォントはすべて読みやすさのためにあります。

- AI / Agent が生成した Markdown の確認
- README、設計案、研究記録、納品文書のレビュー
- JSON、YAML、TOML、INI、ENV の確認と軽い修正
- スクリプト、ソースコード、ログ、テキストの閲覧
- Markdown の整形表示とソースを行き来して確認

## 2 つのモードだけ

### Markdown レンダリングモード

- 見出し、リスト、引用、タスク、表、リンク、脚注をそのまま閲覧・編集
- 画像、数式、コードブロックを文書内で直接表示
- コードブロックにシンタックスハイライト、行番号、コピー、軽い交互行表示
- Ctrl/Cmd + / で Markdown ソースへ切り替え
- 保存されるのは通常の Markdown のまま

### Code モード

Markdown 以外のテキストファイルは Code モードで開きます。

CodeMirror の言語解析と Miku Cream の配色で、構造を読み取りやすくしています。

主な形式：

- 設定 / データ：JSON、YAML、XML、TOML、INI、CONF、ENV、JSONL、CSV
- Web：HTML、CSS、SCSS、LESS、JavaScript、TypeScript、JSX、TSX、Vue
- コード：Python、Rust、C/C++、Java、Go、PHP、SQL、Shell、PowerShell、Ruby、Swift、Kotlin、C#
- テキスト：TXT、LOG
- その他の UTF-8 テキストもプレーンテキストとして開けます

行番号、シンタックスカラー、検索 / 置換、保存、カスタマイズ可能な交互行背景を備えています。

**読みやすく、少し直せる。でも VS Code の代わりにはならない。**

## Miku Cream：レビューを心地よく

- 明るく低ノイズな画面
- 既定アクセント #39C5BB
- Markdown コードブロックと Code モードで同じ意味色を共有
- コード背景は文書背景と統一
- 交互行の既定色は #FAFFFF、設定で変更可能
- 文書とソースのフォント / サイズを個別設定
- インラインコード、数式、表、画像の階層を明確に表示

## 画像・数式・コードをそのまま確認

画像はタイトル、左右 / 中央配置、25%～200% の拡大縮小、削除に対応し、Markdown 画像と HTML img を同じ操作で扱えます。

KaTeX で数式を表示します。

~~~text
$E = mc^2$

$$
\int_a^b f(x)\,dx
$$
~~~

コードブロックにはシンタックスハイライト、独立行番号、コピー通知、Miku Cream の共通コード配色があります。

## ファイルは自然に開く

- ドラッグ＆ドロップ
- 複数タブ
- 完全パス表示を選択可能
- 前回セッションを復元可能
- ウィンドウ位置とサイズを記憶するか選択可能
- 記憶しない場合は主画面中央に適切なサイズで起動
- Windows のファイル関連付けを拡張子ごとに選択
- Markdown、設定、Web、コード、テキストを登録可能
- 「既定に設定」は登録後、Windows の既定アプリ画面へ移動

## エクスポート・プロキシ・更新

Markdown は HTML または PDF に出力できます。

HTTP / HTTPS / SOCKS5 / SOCKS5H プロキシに対応し、リモート画像と GitHub 更新で共有できます。

Windows：

~~~text
MDmeow-<version>.exe
MDmeow_<version>_x64.msi
~~~

Linux / macOS の自動ビルドも用意されています。

## 軽量であることも機能

![MDmeow 軽量動作例](docs/assets/screenshots/lightweight.png)

MDmeow は **Tauri + Milkdown/Crepe + CodeMirror** で構築されています。

IDE、ナレッジベース、巨大な執筆環境を全部まとめようとはしません。役割を絞ることで、日常的に気軽に開けるレビュー道具であり続けます。

## 主なショートカット

| 操作 | 既定 |
| --- | --- |
| 新しいタブ | Ctrl/Cmd+N |
| 開く | Ctrl/Cmd+O |
| 保存 | Ctrl/Cmd+S |
| 名前を付けて保存 | Ctrl/Cmd+Shift+S |
| タブを閉じる | Ctrl/Cmd+W |
| HTML / PDF | Ctrl/Cmd+E |
| Markdown ソース / 表示切替 | Ctrl/Cmd+/ |
| 検索 | Ctrl/Cmd+F |
| 置換 | Ctrl/Cmd+H |
| 設定 | Ctrl/Cmd+, |

## 設定

settings.toml に即時保存されます。

~~~toml
language = "system"
spellcheck = true
open_last_session = true
show_path = false

code_alternate_rows = true
code_alternate_row_color = "#FAFFFF"
remember_window_position = false

accent = "#39C5BB"
~~~

## ソースからビルド

Node.js 20+、pnpm、Rust stable が必要です。Windows では Visual C++ Build Tools、Windows SDK、WebView2 も必要です。

~~~bash
pnpm install
pnpm build
pnpm tauri dev
~~~

~~~powershell
pnpm release:windows
~~~

~~~bash
pnpm release:linux
pnpm release:macos
~~~

## 技術スタック

| レイヤー | 技術 |
| --- | --- |
| デスクトップ | Tauri v2 / Rust |
| Markdown 表示 / 編集 | Milkdown Crepe / ProseMirror |
| Code モード | CodeMirror |
| 数式 | KaTeX |
| Markdown → HTML | comrak |
| エクスポート時のハイライト | highlight.js |
| Windows インストーラー | WiX / MSI |

## クレジット

MDmeow は **Ali Naderi / Mowl** をベースにし、引き続き **MIT License** で公開されています。

MDmeow はそこから独自の方向へ進みました。Markdown・コード・AI 生成文書を **速く開き、気持ちよく読み、必要なところだけ軽く直せる** ことを重視しています。

> **開いたら、すぐ仕事。**
