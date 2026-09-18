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

## 配布物

正式リリースは Windows / Linux / macOS を提供します。

```text
Windows
MDmeow-<version>.exe
MDmeow_<version>_x64.msi

Linux x64
MDmeow-<version>-linux-x86_64.AppImage
MDmeow-<version>-linux-x86_64.deb
MDmeow-<version>-linux-x86_64.rpm

Linux ARM64
MDmeow-<version>-linux-aarch64.AppImage
MDmeow-<version>-linux-aarch64.deb
MDmeow-<version>-linux-aarch64.rpm

macOS
MDmeow-<version>-macOS-universal.dmg
```

Windows の EXE は単一ファイルのポータブル版、MSI はインストール版です。MSI には中国語・英語・日本語・ドイツ語の言語選択があります。

Linux は AppImage / deb / rpm を x64 と ARM64 の両方で提供します。設定は `~/.config/MDmeow`、ローカルデータは `~/.local/share/MDmeow` に保存されます。

macOS は Intel + Apple Silicon 対応の universal DMG です。設定は `~/Library/Application Support/MDmeow` に保存されます。現在のコミュニティビルドは未署名・未公証のため、初回起動時に Finder で右クリック →「開く」が必要な場合があります。

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

各プラットフォームの最終配布ビルド:

```powershell
# Windows
pnpm release:windows
```

```bash
# Linux
pnpm release:linux

# macOS universal
pnpm release:macos
```

各コマンドは対象プラットフォームの正式な配布物だけをリポジトリ直下の `release/` に出力します。バージョン tag を push すると、GitHub Actions が Linux x64/ARM64 と macOS universal を自動ビルドし、`SHA256SUMS.txt` も生成します。Windows の EXE/MSI はメンテナーがローカルでビルドして手動アップロードします。

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
