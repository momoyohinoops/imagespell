# ImageSpell

英語圏向けの**完全ブラウザ内**画像ツール群(モノレポ)。1つのサイト `imagespell.com` の下に
ツールを増やしていく傘構造。ビルド不要のバニラ JS(ES モジュール)+ Canvas / WebGPU。
Cloudflare Pages でホスティング。

> このリポジトリは「pixelate 単体」ではなく **imagespell.com サイト全体**。
> ツールは今後 10 本以上に増える前提で、**1 ツール = 1 ディレクトリ**で並列に並べる。

## 公開中のツール
| URL | ディレクトリ | 概要 | 課金 |
|---|---|---|---|
| `/pixelate-image/` | `public/pixelate-image/` | 画像のピクセル化・顔の自動モザイク・情報の墨消し | 無料 |
| `/depth-map-generator/` | `public/depth-map-generator/` | 画像→深度マップ生成(Depth Anything V2 Small)。Proで16-bit/原寸/バッチ | 無料 + Pro $19 買い切り |

## ディレクトリ構成(公開ルート = `public/`)
```
public/                         ← Cloudflare Pages の Build output directory
├── index.html                  ← ホーム(サイト名 + ツール一覧カード)
├── css/styles.css              ← 全ツール共有のデザインシステム(トークン/ヘッダー/フッター等)
├── pixelate-image/             ← 1本目
│   ├── index.html              ← /pixelate-image/ で配信
│   └── js/                     ← このツール専用 JS(app / pixelate / faces / config / analytics)
├── depth-map-generator/        ← 2本目(pixelate の“隣”。配下ではない)
│   ├── index.html              ← /depth-map-generator/ で配信
│   ├── styles.css              ← depth 専用の補助スタイル(共有CSSの後に読む)
│   ├── js/                     ← 推論・UI・LS統合(main / depth-engine / tiling / png16 / license 等)
│   └── assets/                 ← og.jpg・LPサンプル画像
├── _headers / _redirects / robots.txt / sitemap.xml / og-image.png
outputs/                        ← 配信対象外の生成物(SNS投稿画像など)
docs/ · README.md · .gitignore  ← リポジトリ管理物(public 外・非配信)
```

### 規約: 3本目以降のツールを追加する手順(1ツール = 1ディレクトリ)
1. `public/<tool-name>/index.html` を作る(URL は `/<tool-name>/`)。
2. ツール固有の JS/CSS/画像は `public/<tool-name>/` 配下に置く(絶対パス `/<tool-name>/…` で参照)。
3. **共有デザインは `/css/styles.css`** を読み込む(`<link rel="stylesheet" href="/css/styles.css">`)。
   ヘッダー/フッターのマークアップは既存ツールからコピーして揃える(フッターの `.footer-nav` に
   相互リンクを1本追加)。
4. `public/index.html` の `.tool-grid` にカードを1枚、JSON-LD の `hasPart` に1件追加。
5. `public/sitemap.xml` に `<url>` を1件追加。各ページの `canonical` は末尾スラッシュ付き
   (`https://imagespell.com/<tool-name>/`)。
   - Cloudflare Pages は `foo/index.html` を `/foo/`(末尾スラッシュ)で配信するため、canonical も
     スラッシュ付きに統一する。

## ローカル起動
ビルド不要。`public/` を静的サーバーで開く(ES モジュールのため `file://` 不可)。
```bash
cd public && python3 -m http.server 4173
# → http://localhost:4173/                       (ホーム)
#   http://localhost:4173/pixelate-image/         (1本目)
#   http://localhost:4173/depth-map-generator/    (2本目)
```

## デプロイ(Cloudflare Pages)
- Framework preset: **None** / Build command: **(空)** / **Build output directory: `public`**
- push で自動デプロイ。独自ドメイン `imagespell.com` 接続済み・SSL 有効。
- ⚠️ **重要**: 公開ルートを `public/` にしたので、Pages の **Build output directory を `/` から
  `public` へ変更**する必要がある(未変更だと空ルートを配信して全ページ404)。

### pages.dev の重複コンテンツ対策
各ページの `canonical`(`https://imagespell.com/...`)で対応済み。`_redirects` はパス単位のみで
ホスト名を判定できないため、`*.pages.dev` → 独自ドメインの 301 はダッシュボードの Redirect Rules
側の領域(詳細は過去コミット/元の手順を参照)。

---

## depth-map-generator について(重要な前提)

### モデルとライセンス(厳守)
- 使用モデルは **Depth Anything V2 — Small のみ**
  (transformers.js 用 ONNX: `onnx-community/depth-anything-v2-small-ONNX`)。
  ベースモデルは **Apache 2.0(商用可)**。
- **Base / Large は CC-BY-NC(非商用)のため使用禁止**。変更しないこと。
- 推論は **WebGPU=fp16 優先、WASM フォールバック**(初期化時にプローブ推論で自動降格)。
  後処理の品質パラメータは `public/depth-map-generator/js/depth-config.js` に集約(CV研究者はここだけ)。

### Lemon Squeezy(Pro 課金)
- Store 428235 / Product 1209872 / **Variant 1891543**($19 買い切り)。
- 公開設定は `public/depth-map-generator/js/lemonsqueezy.config.js`(**公開IDのみ・APIキー非含**)。
- **Pro ゲート: `PRO_ENABLED`**(同ファイル)。現在 `false` = 「Pro — coming soon」表示で
  チェックアウトを開かない。ライセンスキー入力欄は常時有効(先行キーで解錠可能)。
  **KYC 完了後に `true` に切り替える**(1箇所)。
- **API キーはこのリポジトリには存在しない/コミットしない。** キーは開発用の別ワーキングコピーの
  `.env`(git-ignored)にのみ置き、Variant ID 取得等の開発作業だけに使う。ブラウザが叩くのは
  APIキー不要の公開 License API(activate/validate)のみ。

---

## 公開前・公開後チェックリスト

### pixelate-image(公開済み: 2026-07-08 / 30日判定日: 2026-08-06)
- [x] 実装・モバイル実機・デプロイ・ドメイン・アナリティクス・Search Console・OGP・Day 1 告知
- 判定基準(8/6): インデックス済み かつ(インプレッション累計 100+ or クリック 5+)

### depth-map-generator(公開準備)
- [x] 実装(コア/表示オプション/Pro:16-bit・タイル・バッチ/LS統合/LP/モバイル)
- [x] 技術検証(2048px 中央値 2.4 秒 @ WebGPU fp16・内蔵GPU)
- [x] 傘サイトへ統合(1ツール1ディレクトリ・相互リンク・sitemap・JSON-LD・OGP)
- [x] LP サンプル画像 / og.jpg(1200×630 左右分割)/ X用 16:9 を生成
- [ ] **Cloudflare Pages の Build output directory を `public` に変更**(このPR構成の前提)
- [ ] 公開(main マージ → push → 自動デプロイ)
- [ ] 公開URL 確認: https://imagespell.com/depth-map-generator/
- [ ] **公開日を記入: __________**（30日判定日: 公開日 + 29日 = __________）
- [ ] Lemon Squeezy KYC 完了 → `PRO_ENABLED=true` に切替 → テストモードで
      購入→キー→解錠の **E2E 確認**
- [ ] LS 製品ギャラリーの仮アイコンを、実写ベースのビフォー/アフター製品画像へ差し替え
- [ ] X(@imagespell)で **"Day N"** 出荷投稿(16:9 は `outputs/` に生成済み)
- [ ] (任意)実 Chrome での WASM フォールバック疎通確認

#### 判定基準(30日クイットメトリクス)
判定日 = 公開日 + 29日。合格 = **インデックス済み** かつ(**インプレッション累計 100+** or
**クリック 5+**)。Pro は KYC 後に有効化するため、初期は無料機能の集客力で判定する。

## リポジトリ名について
このリポジトリの実体は imagespell サイト全体。GitHub 上の名称は運用に合わせて
`imagespell` 等へリネーム予定(リネーム後も Cloudflare Pages の Git 連携は維持される想定)。
