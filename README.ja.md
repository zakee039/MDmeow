![MDmeow](docs/logo.png)

[简体中文](README.md) · [English](README.en.md) · **日本語** · [Deutsch](README.de.md)

# MDmeow

MDmeow は、**Tauri + Milkdown/Crepe** で構築された軽量で高速な WYSIWYG Markdown エディターです。Markdown ファイルを通常のテキストとして保ちながら、Typora に近いインライン編集体験を提供します。

現在の版では **Miku Cream** レンダリングを採用し、明るいドキュメント背景、`#39C5BB` のアクセント、ライトテーマのコード表示、KaTeX 数式、コンパクトな表、控えめなデスクトップ UI を組み合わせています。

## 主な機能

- WYSIWYG Markdown 編集。
- 行番号付き Markdown ソース表示。
- タブと前回セッションの復元。
- ツールバーに **保存** と **名前を付けて保存** を個別配置。
- タイトルバーのファイル名をクリックして、その場でファイル名を変更。
- 自己完結型 HTML エクスポートと、システム印刷を利用した PDF 出力。
- 標準 Markdown 画像と一般的な HTML `<img>` の互換表示。
- KaTeX 数式。
- アプリ内ショートカットの再設定。
- `MDmeow.Markdown` を使った Windows「プログラムから開く」統合。
- 简体中文 / English / 日本語 / Deutsch の 4 言語 UI。

## Windows 配布物

公開するファイルは 2 つだけです。

```text
MDmeow-<version>.exe
MDmeow_<version>_x64.msi
```

EXE は単一ファイルのポータブル版、MSI はインストール版です。MSI には中国語・英語・日本語・ドイツ語の言語選択画面が含まれます。

ポータブル版は EXE と同じ場所に `settings.toml` と `data/` を保存します。インストール版は `%APPDATA%\MDmeow` と `%LOCALAPPDATA%\MDmeow` を使用します。

有効な MSI インストールが存在する場合、ポータブル版は Windows の Markdown 関連付けを奪いません。MSI が存在しない場合のみ、ポータブル版がフォールバックとして登録できます。

## 言語

- 简体中文 (`zh-CN`)
- English (`en`)
- 日本語 (`ja`)
- Deutsch (`de`)
- システムに従う (`system`)

`system` は上記 4 言語のみに自動マッピングされ、それ以外の OS 言語では English にフォールバックします。

## ショートカット

| 操作 | 既定 |
| --- | --- |
| 新しいタブ | `Ctrl/Cmd+N` |
| 開く | `Ctrl/Cmd+O` |
| 保存 | `Ctrl/Cmd+S` |
| 名前を付けて保存 | `Ctrl/Cmd+Shift+S` |
| タブを閉じる | `Ctrl/Cmd+W` |
| HTML / PDF エクスポート | `Ctrl/Cmd+E` |
| ソース表示切替 | `Ctrl/Cmd+/` |
| 検索 | `Ctrl/Cmd+F` |
| 置換 | `Ctrl/Cmd+H` |
| Emoji | `Ctrl/Cmd+.` |
| 設定 | `Ctrl/Cmd+,` |

## 設定

```toml
language = "system"         # system | zh-CN | en | ja | de
spellcheck = true
quit_on_escape = false
list_marker = "*"
show_path = false
open_last_session = true
always_show_tabbar = false
accent = "#39C5BB"
```

## ビルド

必要環境: Node.js 20+、`pnpm`、Rust stable、Tauri の各プラットフォーム依存環境。

```bash
pnpm install
pnpm build
pnpm tauri dev
```

Windows の最終配布ビルド:

```powershell
pnpm release:windows
```

正式な 2 ファイルはリポジトリ直下の `release/` に出力されます。

## 技術スタック

| レイヤー | 技術 |
| --- | --- |
| デスクトップ | Tauri v2 / Rust |
| WYSIWYG | Milkdown Crepe / ProseMirror |
| ソース編集 | CodeMirror |
| 数式 | KaTeX |
| Markdown → HTML | comrak |
| Windows インストーラー | WiX / MSI |

## クレジットとライセンス

MDmeow は **Ali Naderi / Mowl** をベースにしたフォークで、**MIT License** のもとで公開されています。このフォークは **zakee039** が保守しています。
