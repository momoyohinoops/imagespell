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
| `/blur-face/` | `public/blur-face/` | 画像を渡すと自動で顔検出→ぼかし(操作ゼロ)。顔ごとON/OFF・手動範囲追加・Blur/Pixelate切替 | 無料 |

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
├── blur-face/                   ← 3本目(無料pSEO弾。pixelate-imageのコード資産をコピーで流用)
│   ├── index.html               ← /blur-face/ で配信
│   └── js/                      ← app / blur(ぼかし・ピクセル化エンジン) / faces / config / analytics
├── _headers / _redirects / robots.txt / sitemap.xml / og-image.png
outputs/                        ← 配信対象外の生成物(SNS投稿画像など)
docs/ · README.md · .gitignore  ← リポジトリ管理物(public 外・非配信)
  └ docs/ = 各ツールの実装依頼書(`<tool>_指示書*.md`)= 実装前ブリーフの歴史的記録。
     現行構造の正はこの README。
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

## 素材(画像)の扱い
恒久ルールは `CLAUDE.md` の「素材ルール」参照。除去ツールは `scripts/strip-exif.sh`
(exiftool があれば `-all=`、無ければ Pillow でピクセルのみ新規 Image に移して保存)。
除去後は `exiftool -G -a -s <file>` で EXIF/GPS/XMP/IPTC グループが無いことを確認する。

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

### キャッシュ運用(重要 / 過去に事故あり)
CSS/JS は**コンテンツハッシュを付けていない**ため、変更が返り客に届かず、
「新HTML × 旧CSS/JS」で**レイアウトや挙動が壊れる**事故が起きた。対策は2段構え:
1. **参照URLにバージョンを付ける**: `href="/css/styles.css?v=N"` /
   `src="/…/js/main.js?v=N"`。**CSS か JS を変更したら `N` を上げる**(全ページの
   該当リンクを揃える)。HTMLは常に revalidate されるので、全員が新URL=未キャッシュを取得する。
   - ESモジュールは import 先までは自動でバージョンが付かない。**エントリ(main.js/app.js)
     だけでなく、変更した被import モジュールがあれば、その分も `?v=N` を上げるかエントリ側を
     更新して取り直させる**こと(通常はエントリのみ変更なのでエントリの版上げで足りる)。
2. `_headers` で CSS/JS を `max-age=0, must-revalidate`(既設)。以後の変更は即反映される。
   ※ ただし「バージョン変更前に旧max-ageでキャッシュ済みの端末」には 1) のURL版上げが効く。

### pages.dev の重複コンテンツ対策
各ページの `canonical`(`https://imagespell.com/...`)で対応済み。`_redirects` はパス単位のみで
ホスト名を判定できないため、`*.pages.dev` → 独自ドメインの 301 はダッシュボードの Redirect Rules
側の領域(詳細は過去コミット/元の手順を参照)。

---

## depth-map-generator について(重要な前提)

### モデルとライセンス(変更禁止のルールは CLAUDE.md 参照)
- 使用モデル: **Depth Anything V2 — Small**
  (transformers.js 用 ONNX: `onnx-community/depth-anything-v2-small-ONNX`)。
  ベースモデルは **Apache 2.0(商用可)**。Base / Large は CC-BY-NC(非商用)。
- 推論は **WebGPU=fp16 優先、WASM フォールバック**(初期化時にプローブ推論で自動降格)。
  後処理の品質パラメータは `public/depth-map-generator/js/depth-config.js` に集約(CV研究者はここだけ)。

### Lemon Squeezy(Pro 課金)
- Store 428235 / Product 1209872 / **Variant 1891543**($19 買い切り)。
- 公開設定は `public/depth-map-generator/js/lemonsqueezy.config.js`(**公開IDのみ・APIキー非含**)。
- **Pro ゲート: `PRO_ENABLED`**(同ファイル)。現在 `false` = 「Pro — coming soon」表示で
  チェックアウトを開かない。ライセンスキー入力欄は常時有効(先行キーで解錠可能)。
  **KYC 完了後に `true` に切り替える**(1箇所)。
- APIキーはリポジトリ**ルート**の `.env`(`.gitignore` 済み・`public/` の外なので配信もされない)
  にのみ置き、Variant ID 取得等の開発作業だけに使う。雛形は `.env.example`(公開値のみ・秘密なし)。
  ブラウザが叩くのは APIキー不要の公開 License API(activate/validate)のみ。
  (コミット・フロントエンド混入の禁止ルールは CLAUDE.md 参照)

### モバイル検証(実機必須・レスポンシブモード不可)
実装ルール(label+input関連付け・16px以上)は CLAUDE.md 参照。以下は **iPhone Safari 実機**
でしか正しく再現しない(PCのレスポンシブ/デバイスエミュレーションではすり抜ける)ため、
リリース前に実機で確認する:

1. **ファイル選択**: タップ→OSの写真ピッカーが開くこと。
   (過去バグの原因だった2点は解決済み: プログラム的 `input.click()` は iOS で不発になりやすい/
   `input` を `display:none` にすると label 経由で開かない端末がある → `.visually-hidden` で解消。
   両ツール(pixelate / depth)で同一方式)
2. **iOS 自動ズーム**: ライセンスキー入力・カラーマップ select は 16px 以上に設定済み。
   フォーカスして**ズームしない**ことを確認する。
3. **タッチ挙動**: 「Pro — coming soon」ボタンは無効(タップしても何も起きない)。
   キー入力は「already have a key?」リンクから開く(ズームせず案内が出る)。

## 公開前・公開後チェックリスト

### pixelate-image(公開済み: 2026-07-08 / 30日判定日: 2026-08-06)
- [x] 実装・モバイル実機・デプロイ・ドメイン・アナリティクス・Search Console・OGP・Day 1 告知
- Day 1 投稿: 2026-07-08(pixelate image 出荷)
  URL: (未記録 — わかり次第追記)
- 判定基準(8/6): インデックス済み かつ(インプレッション累計 100+ or クリック 5+)
- [ ] **既知バグ(2026-07-14 blur-face 開発中に発見、pixelate-image 側は未修正)**:
  「Auto-pixelate faces」ボタンで顔検出が失敗し「Face detection failed to load.」と表示される
  環境がある(報告端末: macOS 12.7.6 / Safari 17系。macOSの制約でこれ以上OS・Safariを更新できない機体)。
  - コンソールで確認した実際のエラー: `TypeError: undefined is not an object (evaluating
    'GLctx.activeTexture')`。その直前に `Couldn't create webGL 2 context.` /
    `Couldn't create webGL 1 context.` のログあり(MediaPipe内部のWebGLコンテキスト作成が失敗)
  - 一方でブラウザ自体のWebGLは正常
    (`document.createElement('canvas').getContext('webgl')` は動作する)
  - 失敗タイミングは検出器の**作成時ではなく `detector.detect()` 実行時**。
    GPU委任の作成は成功しているように見えて、実際に使う段になって壊れるパターン
  - blur-face側で試して効果がなかったもの: CPU委任への固定、MediaPipeライブラリの
    バージョン更新(0.10.18 → 0.10.35)、Safari再起動、Mac本体の再起動
  - blur-face側の最終対応: 実行時失敗も検知してCPUにフォールバックする形にした上で
    GPUを既定に戻した(`public/blur-face/js/faces.js` の `getDetector()` /
    `detectFaces()` 参照)。pixelate-image側の `public/pixelate-image/js/app.js` の
    `faceBtn` ハンドラは今のところGPU失敗時のフォールバックが無い(作成時のtry/catchのみ)ため、
    同様の対策を移植すれば直る可能性が高い
  - 古いmacOS/GPUドライバ固有の制約の可能性が高く、一般ユーザーの大半には影響しないと
    推測されるが未検証。対応するかはコスト対効果次第(判断は依頼者)

### depth-map-generator(公開済み)
- [x] 実装(コア/表示オプション/Pro:16-bit・タイル・バッチ/LS統合/LP/モバイル)
- [x] 技術検証(2048px 中央値 2.4 秒 @ WebGPU fp16・内蔵GPU)
- [x] 傘サイトへ統合(1ツール1ディレクトリ・相互リンク・sitemap・JSON-LD・OGP)
- [x] LP サンプル画像 / og.jpg(1200×630 左右分割)/ X用 16:9 を生成
- [x] Cloudflare Pages の Build output directory を `public` に変更
- [x] 公開(main マージ → push → 自動デプロイ)
- [x] 公開URL 確認: https://imagespell.com/depth-map-generator/
- [ ] Lemon Squeezy KYC 完了 → `PRO_ENABLED=true` に切替 → テストモードで
      購入→キー→解錠の **E2E 確認**
- [ ] LS 製品ギャラリーの仮アイコンを、実写ベースのビフォー/アフター製品画像へ差し替え
- [ ] X(@imagespell)で **"Day N"** 出荷投稿(16:9 は `outputs/` に生成済み)
- [ ] (任意)実 Chrome での WASM フォールバック疎通確認

### blur-face(公開済み: 2026-07-14 / 30日判定日: 2026-08-13)
- [x] 実装(コア体験・顔ごとON/OFF・手動矩形追加・Blur/Pixelate切替・強度スライダー・全解像度書き出し)
- [x] モバイル対応(font-size 16px以上・label+input file・touch-action確認は実機で要再確認)
- [x] 傘サイトへ統合(ホーム・sitemap.xml・既存2ツールとの相互リンク・JSON-LD・OGP)
- [x] デスクトップChrome・iPhone Safari実機での受け入れ基準(指示書§受け入れ基準)最終確認
      (実機テストで見つかった不具合4件は修正済み。詳細は上の作業ログ・pixelate-imageメモ参照)
- [x] Lighthouse Performance 90以上の実機測定(97点)
- [x] 受け入れ基準5(等倍解像度書き出し・EXIF非含有)をGPS付きEXIF埋め込みテスト画像で実ファイル検証
      (exiftool。GPS/Artist/Software含むExif一式が書き出し後に完全に除去されていることを確認)
- [x] 公開(main マージ → push → 自動デプロイ済み。https://imagespell.com/blur-face/ で稼働中)
- 公開日: 2026-07-14(https://imagespell.com/blur-face/)
- 30日判定日: **2026-08-13**
  - 合格基準: GSCインデックス済み かつ(インプレッション100+ or クリック5+)。X経由はノーカウント
  - 不合格時: 追加投資停止(削除しない。放置=pSEO資産)
- [ ] GSCでsitemap再送信
- [ ] X(@imagespell)で "Day N" 出荷投稿

## Depth Map Generator — 判定台帳

- 公開日: 2026-07-12(https://imagespell.com/depth-map-generator)
- Day 2 投稿: 2026-07-13(depth map generator 出荷 + fp16知見)
  URL: https://x.com/imagespell/status/2076499487099654309?s=20

### 30日判定(二軸・事後の下方修正禁止)
1. SEO軸 — 判定日: **2026-08-11**
   - 合格基準: Google Search Console でインデックス登録済み、かつ
     オーガニックのインプレッションが発生していること
   - 不合格時: 本ページへの追加投資を停止(削除はしない。放置で熟成)
2. 課金軸 — 判定日: **Pro有効化日 + 30日**(有効化日: ____ / 判定日: ____)
   - 合格基準: 初課金 1件
   - 前提: LS KYC完了 → テスト購入E2E → PRO_ENABLED=true
   - 不合格時: 価格・訴求の変更を1回試す($14早割 等)→それでもゼロなら
     Pro機能は維持したまま追加投資停止、次弾へ

### 備考
- X経由・直接流入はSEO判定にカウントしない(GSCオーガニックのみ)
- KYCトリップワイヤー: 2026-07-24までに審査完了しない場合はPolar移行を検討

## 作業ログ
簡潔な1行ログ(履歴が追える程度)。新しいものを上に追加。
- 2026-07-14: blur-faceの実機テストでバグ3件を修正・本番反映(ぼかし範囲が画像端付近でズーム/
  顔が透ける、Safari旧バージョンでのぼかし無効、blur-face用JSのキャッシュ設定漏れ)。加えて
  顔検出がGPU実行時にのみ失敗する既知バグをpixelate-image側にも発見、README「公開前・公開後
  チェックリスト」のpixelate-image項に調査メモを記録(コードは変更していない)。
- 2026-07-13: blur-face(3本目・無料pSEO弾)実装完了。pixelate-imageのコード資産をコピーで流用、
  自動顔検出→ぼかしのゼロ操作体験・Blur/Pixelate切替・顔ごとON/OFFを実装。統合作業(ホーム/sitemap/
  相互リンク)まで完了。公開は依頼者判断待ち。
- 2026-07-13: LPヒーローを grove ペアに刷新、トンネル素材撤去、公開画像のEXIF/地名ポリシー適用、Day 2投稿。

## リポジトリ名について
このリポジトリの実体は imagespell サイト全体。GitHub 上の名称は運用に合わせて
`imagespell` 等へリネーム予定(リネーム後も Cloudflare Pages の Git 連携は維持される想定)。
