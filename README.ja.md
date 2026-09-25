[简体中文](README.md) · [English](README.en.md) · **日本語** · [Deutsch](README.de.md)

[個人サイト](https://zakee.fun) · [Buy me a coffee](https://ifdian.net/a/zakee/plan)

# MDmeow

> **開いたら、すぐ仕事。**

MDmeow は **Tauri + Milkdown/Crepe** で構築された、軽量・高速・見た目にも心地よい WYSIWYG Markdown エディターです。Markdown 自体の純粋さと移植性を保ちながら、自然で直接的な編集体験を提供します。

既定の **Miku Cream** は、明るい文書背景、`#39C5BB` のアクセント、控えめなコード色、KaTeX 数式、コンパクトな表と落ち着いたデスクトップ UI を組み合わせています。

**すぐ開く。読みやすい。自然に編集できる。**

## 主な機能

- 見出し、リスト、引用、タスク、表、リンク、画像、脚注を WYSIWYG で編集
- 行番号・シンタックスカラー・交互行表示付き Markdown ソースビュー
- 複数タブとセッション復元
- 保存 / 名前を付けて保存
- タイトル部からファイル名を変更
- HTML / PDF エクスポート
- Markdown 画像と HTML `<img>` をサポート
- KaTeX 数式
- コードブロックのシンタックスハイライト、行番号、コピー
- ショートカットの再設定
- Windows の拡張子別ファイル関連付け
- 简体中文 / English / 日本語 / Deutsch の 4 言語

## ほかのテキストファイルも手軽に確認

JSON、YAML、TOML、INI、ENV、HTML、CSS、JavaScript、TypeScript、Python、Rust、ログ、TXT なども直接開けます。

これらは軽量な **Code モード**で表示され、行番号、シンタックスカラー、検索 / 置換、保存、カスタマイズ可能な交互行背景を利用できます。

本格的な IDE の代替ではなく、素早い確認と軽い修正のための機能です。

## ダウンロード

```text
Windows
MDmeow-<version>.exe
MDmeow_<version>_x64.msi

Linux x64 / ARM64
AppImage / deb / rpm

macOS
MDmeow-<version>-macOS-universal.dmg
```

Windows ではポータブル EXE と MSI インストーラーを提供します。Linux は AppImage / deb / rpm、macOS は Intel + Apple Silicon の universal DMG を提供します。

## Markdown・画像・数式

標準 Markdown を優先し、Markdown 画像と一般的な HTML `<img>` の両方を表示します。画像はタイトル、配置、25%～200% の拡大縮小、削除に対応します。

KaTeX で行内 / ブロック数式を表示します。

```text
$E = mc^2$

$$
\int_a^b f(x)\,dx
$$
```

## Miku Cream

- 明るい Cream 背景
- `#39C5BB` アクセント
- Markdown コードブロックと Code モードで共通の意味色
- コード背景を文書背景と統一
- 交互行の既定色は `#FAFFFF`
- 文書 / ソースのフォントとサイズを個別設定

## ファイルとウィンドウ

- ドラッグ＆ドロップ
- 複数タブ
- フルパス表示を選択可能
- 前回セッションを復元可能
- ウィンドウ位置とサイズを記憶するか選択可能
- 記憶しない場合は主画面中央に適切なサイズで起動
- Windows のファイル関連付けを拡張子ごとに選択
- 設定は即時保存

## 主なショートカット

| 操作 | 既定 |
| --- | --- |
| 新しいタブ | `Ctrl/Cmd+N` |
| 開く | `Ctrl/Cmd+O` |
| 保存 | `Ctrl/Cmd+S` |
| 名前を付けて保存 | `Ctrl/Cmd+Shift+S` |
| タブを閉じる | `Ctrl/Cmd+W` |
| HTML / PDF | `Ctrl/Cmd+E` |
| Markdown 表示 / ソース | `Ctrl/Cmd+/` |
| 検索 | `Ctrl/Cmd+F` |
| 置換 | `Ctrl/Cmd+H` |
| 設定 | `Ctrl/Cmd+,` |

## 軽量であることも機能

![MDmeow 軽量動作例](docs/assets/screenshots/lightweight.png)

MDmeow は **Tauri + Milkdown/Crepe + CodeMirror** で構築されています。重いオールインワン環境になることを目指していません。

**Markdown を扱いたいとき、MDmeow を開けばすぐ始められる。**

## ビルド

Node.js 20+、`pnpm`、Rust stable が必要です。

```bash
pnpm install
pnpm build
pnpm tauri dev
```

```powershell
pnpm release:windows
```

```bash
pnpm release:linux
pnpm release:macos
```

`vX.Y.Z` タグを push すると、GitHub Actions が Windows、Linux x64 / ARM64、macOS を自動ビルドし、1 つの Release として公開します。

## クレジット

MDmeow は **Ali Naderi / Mowl** をベースにし、**MIT License** で公開されています。

> **開いたら、すぐ仕事。**
