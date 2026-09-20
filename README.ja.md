[简体中文](README.md) · [English](README.en.md) · **日本語** · [Deutsch](README.de.md)

# MDmeow

> **Markdown を開く。すぐ作業を始める。**
>
> **AI 時代のための、軽快な WYSIWYG Markdown エディター。**

[🌐 オンラインデモ](https://mdmeow.zakee.fun)

AI エージェントとやり取りする機会が増えるにつれて、**Markdown は人と AI のあいだで最もよく使われる文書形式のひとつ**になりつつあります。

要件定義、開発メモ、AI の出力、研究ノート、README……日々の作業の多くが、最終的にはひとつの `.md` ファイルにまとまります。

でも、いつも大きな執筆プラットフォームが必要なわけではありません。必要なのは、**すぐ開けて、見たまま編集できて、作業の邪魔をしない** Markdown エディターです。

そこで **MDmeow** が生まれました。

目標はとてもシンプルです。

**テキストファイルのように素早く Markdown を開き、普通の文書のようにそのまま編集すること。**

軽く、速く、静かに。AI が生成した文書でも、README でも、ちょっとしたメモでも、開いたらすぐ作業を始められます。

## 軽快さは機能のひとつ

![MDmeow 軽量動作例](docs/assets/screenshots/lightweight.png)

> 上の画像は、ある Windows 環境で空の文書を開いたときの一例です。実際のリソース使用量は、文書内容、WebView2、システム環境によって変わります。

MDmeow は **Tauri + Milkdown/Crepe** で構築されています。大規模なナレッジ管理ツールを目指すのではなく、日常の Markdown 作業にちょうどよいデスクトップエディターを目指しています。

## なぜ MDmeow なのか

### WYSIWYG でも、ファイルは Markdown のまま

画面では整形された文書を編集しながら、保存されるファイルは他のツールでも読める Markdown のままです。

- 見出し、リスト、引用、タスクリスト、表、リンク、脚注などをそのまま編集
- いつでも専用の **ソース表示** に切り替え
- 独自形式に閉じ込めず、Markdown の可搬性を維持
- 標準 Markdown 画像と一般的な HTML `<img>` の両方に対応
- `<!--more-->` などはソースに保持しつつ、WYSIWYG 表示では邪魔をしない

MDmeow はあなたのワークフローに溶け込みます。文書を囲い込むためのツールではありません。

### 画像も普通の内容と同じように編集

画像をクリックすると、コンパクトな画像ツールバーが開きます。

- 画像タイトルの編集
- 左寄せ / 中央 / 右寄せ
- 25% ～ 200% の拡大縮小
- 画像の削除
- Markdown 画像と HTML 画像を同じ操作で編集

拡大率や配置情報が必要な場合、MDmeow は Typedown と高い互換性を持つ HTML を使います。

```html
<img title="diagram" src="./assets/diagram.png" alt="diagram" style="zoom:50%;" data-align="center">
```

相対パスは引き続き現在の Markdown ファイルを基準に解決されます。

### コードも数式も、同じエディターで

MDmeow には **Miku Cream** のドキュメントスタイルが組み込まれています。

- 明るいコードブロック
- シンタックスハイライト
- 独立したコード行番号
- コピー成功のフィードバック
- 見分けやすいインラインコード
- KaTeX のインライン数式 / ブロック数式
- 数式は通常プレビュー表示し、編集したいときだけソースを開く

例：

```text
$E = mc^2$

$$
\int_a^b f(x)\,dx
$$
```

### ファイルを開く操作も自然に

- `.md` / `.markdown` / `.mdx` / `.txt` をドラッグ＆ドロップ
- Windows の Markdown「プログラムから開く」に登録可能
- インストール版がある場合は、そちらがファイル関連付けを優先
- 有効なインストール版がない場合は、ポータブル版がフォールバック
- タイトルバーのファイル名をクリックして、その場で名前変更
- 複数タブ
- 前回セッションの復元

### HTML / PDF へ、そのまま出力

エクスポートボタンには 2 つの明確な出口があります。

- **HTML をエクスポート**：単独で開けるページを生成
- **PDF をエクスポート**：システム印刷フローから PDF を出力

文書を書き終えたあと、別のエディターに持ち替える必要はありません。

### リモート画像向けのプロキシ

Markdown が GitHub Raw、画像ホスティング、その他のリモートリソースを参照する場合、MDmeow ではプロキシを設定できます。

- HTTP / HTTPS
- SOCKS5 / SOCKS5H
- 接続テスト
- 無効時でもアドレスは保持・編集可能
- リモート画像と更新確認で同じプロキシ設定を利用

例：

```text
http://127.0.0.1:7897
socks5://127.0.0.1:7893
```

### GitHub から直接アップデート

MDmeow は GitHub Releases から新しいバージョンを確認し、ダウンロードした更新ファイルを署名で検証します。

Windows では：

- **インストール版**：新しい MSI をダウンロードして更新処理を開始
- **ポータブル版**：新しい EXE を現在のプログラムと同じフォルダーに保存
- 実行中の EXE を勝手に上書きしない
- 手動でいつでも更新確認
- 自動確認は既定で最大 24 時間に 1 回
- 自動確認に失敗しても編集を邪魔しない

追加の更新サーバーは不要です。GitHub Release がそのまま更新元になります。

## 日常作業のための機能

- **4 言語 UI**：简体中文 / English / 日本語 / Deutsch
- **ショートカットの再設定**
- **本文とソース表示のフォントを個別設定**
- **アクセント色の変更**（既定は `#39C5BB`）
- **スペルチェック**
- フルパス表示、タブバー常時表示などの動作設定
- **ポータブル EXE / MSI インストール版** を用途に合わせて選択可能

## ダウンロード

最新リリース：

**https://github.com/zakee039/MDmeow/releases/latest**

### Windows

用途に合わせて選べます。

```text
MDmeow-<version>.exe
```

単一ファイルのポータブル版です。ツールフォルダーや USB ドライブなど、インストールせずに使いたい場所へ置けます。

```text
MDmeow_<version>_x64.msi
```

長期利用や Windows のファイル関連付けに向いた標準 MSI インストール版です。

リポジトリには Linux / macOS 向けのビルドフローも残されています。Release に必要なパッケージがない場合は、ソースからビルドできます。

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
| ブロック種別を切替 | `Ctrl/Cmd+0` – `7` |

アプリのショートカットは **設定 → ショートカット** から変更できます。

## 設定

MDmeow の設定は `settings.toml` に保存され、ホットリロードに対応しています。

主な設定：

```toml
language = "system"
spellcheck = true
quit_on_escape = false
open_last_session = true
always_show_tabbar = false
show_path = false

editor_font = ""
editor_font_size = 16
source_font = ""
source_font_size = 15

accent = "#39C5BB"

proxy_enabled = false
proxy_url = ""
auto_check_updates = true
```

`Mod` は Windows/Linux では Ctrl、macOS では Cmd を表します。

## ソースからビルド

必要環境：

- Node.js 20+
- `pnpm`
- Rust stable
- Windows：Visual C++ Build Tools、Windows SDK、WebView2

開発：

```bash
pnpm install
pnpm build
pnpm tauri dev
```

正式ビルド：

```powershell
# Windows
pnpm release:windows
```

```bash
# Linux
pnpm release:linux

# macOS
pnpm release:macos
```

主なチェック：

```bash
pnpm exec tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## 技術スタック

| レイヤー | 技術 |
| --- | --- |
| デスクトップ | Tauri v2 / Rust |
| WYSIWYG | Milkdown Crepe / ProseMirror |
| ソース編集 | CodeMirror |
| 数式 | KaTeX |
| Markdown → HTML | comrak |
| エクスポート時のシンタックスハイライト | highlight.js |
| Windows インストーラー | WiX / MSI |

## クレジット

MDmeow は **Ali Naderi / Mowl** をベースにし、引き続き **MIT License** のもとで公開されています。

シンプルで優れた出発点を提供してくれた上流プロジェクトに感謝します。

MDmeow はそこから、実際のデスクトップ作業を中心に再構成されました。WYSIWYG / ソースの二重表示、Miku Cream、画像編集、コードと数式、HTML/PDF 出力、多言語、ショートカット、Windows ファイル関連付け、ポータブル/インストール版、プロキシ、GitHub 署名付き更新などを追加しています。

> **Markdown を開く。すぐ作業を始める。**
