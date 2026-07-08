# pixelate-tool (PixelTools)

英語圏向け画像ツールポートフォリオの1本目。「pixelate image」(月間14,800 / KD11)向けの
**完全ブラウザ内処理**のピクセル化ツール。ビルド不要のバニラJS(ESモジュール)+ Canvas。

- ドラッグ&ドロップ / ファイル選択 / クリップボード貼り付け(Ctrl/⌘+V)
- 読み込んだ瞬間に全体ピクセル化プレビュー(操作ゼロで結果)
- ブロックサイズのスライダー(リアルタイム)
- 全体 / 矩形選択(複数可)モード
- **顔の自動モザイク**(MediaPipe Tasks Vision を初回押下時にCDNから遅延ロード)
- PNG / JPEG / WebP で元解像度のままダウンロード(透かし・制限なし)
- 画像は一切アップロードされない(すべてローカル処理)

## 構成(傘構造 ImageSpell)
```
index.html                  ルート = ImageSpell ホーム(サイト名 + ツール一覧)
pixelate-image/index.html   ツール本体 + LP(/pixelate-image で配信)
css/styles.css              スタイル(ホーム/ツール共有・モバイル対応)
js/config.js                サイト名・URL・アナリティクスIDを1箇所で差し替え ← ここだけ編集
js/pixelate.js              Canvasピクセル化コア(依存なし)
js/app.js                   UI/入力/選択/ダウンロード制御
js/faces.js                 顔検出(遅延ロード。MediaPipe CDN)
js/analytics.js             Cookieレス計測の薄いラッパー
robots.txt / sitemap.xml / _headers / _redirects   デプロイ用
```
- 公開URL: ホーム `https://imagespell.com/` / ツール `https://imagespell.com/pixelate-image`
- CSS/JS はルート絶対パス(`/css` `/js`)参照なので、どの階層のページからも共有される
- 2本目以降のツールは `tool-name/index.html` を追加し、ホームの `.tool-grid` にカードを1枚足すだけ

## ローカル起動
ビルド不要。静的サーバーで開くだけ(ESモジュールのため `file://` では不可)。
```bash
python3 -m http.server 4173
# → http://localhost:4173
```

## デプロイ(Cloudflare Pages)
1. このフォルダをGitリポジトリにして GitHub 等へ push
   ```bash
   git init && git add -A && git commit -m "PixelTools v1"
   git branch -M main && git remote add origin <YOUR_REPO> && git push -u origin main
   ```
2. Cloudflare ダッシュボード → **Workers & Pages → Create → Pages → Connect to Git**
3. ビルド設定:
   - **Framework preset:** None
   - **Build command:** (空欄)
   - **Build output directory:** `/`(リポジトリのルート)
4. Deploy → `https://<project>.pages.dev` で公開。以降 push で自動デプロイ。

## 独自ドメイン接続(imagespell.com)
1. Pages プロジェクト → **Custom domains → Set up a domain** → `imagespell.com`(と
   `www.imagespell.com`)を追加。ドメインが Cloudflare 管理下なら DNS は自動設定。
   外部レジストラなら表示される CNAME を DNS に登録。
2. URL 類はすでに imagespell.com に更新済み(`js/config.js` / 各 `index.html` の
   canonical・OGP / `robots.txt` / `sitemap.xml`)。

### pages.dev → imagespell.com の 301(SEO重複回避)
Cloudflare Pages の `_redirects` は**パス単位のみ**でホスト名を判定できず、catch-all は
imagespell.com 自身にも当たってループする。よってこのリダイレクトは **Redirect Rules** で行う:

**imagespell.com のゾーン → Rules → Redirect Rules → Create rule**
- **When incoming requests match:** `Hostname` `equals` `pixelate-tool.pages.dev`
- **Then / URL redirect:**
  - Type: **Dynamic**
  - Expression: `concat("https://imagespell.com", http.request.uri.path)`
  - Status: **301**、**Preserve query string** ON
- Deploy。以降 pages.dev へのアクセスは同じパスで imagespell.com へ 301。

## 公開前チェック(受け入れ基準)
- [ ] 画像を渡す→ダウンロードまで10秒・3操作以内
- [ ] スマホ実機で顔モザイクまで動く
- [ ] DevTools Network で画像がPOSTされていない(GETのCDN取得のみ)
- [ ] `*.pages.dev` で誰でもアクセス可

## 公開後に依頼者がやること
1. **アナリティクスID差し替え:** `js/config.js` を編集し、`index.html` の
   `<head>` 内アナリティクススニペット(Cloudflare か Plausible のどちらか)の
   コメントを外して ID/ドメインを設定。
2. **OGP画像:** 1200×630 の `og-image.png` をルートに配置。
3. ドメイン取得・接続 → Google Search Console 登録・`sitemap.xml` 送信。
4. 公開告知(X英語アカウント "Day 1" 投稿)。

## 状態
- [x] 実装
- [ ] モバイル実機確認(デスクトップ/エミュレータでは確認済み)
- [ ] Cloudflare Pagesデプロイ
- [ ] アナリティクスID設定
- [ ] ドメイン接続
- [ ] Search Console登録
- [ ] 公開告知(X英語 "Day 1")

公開日:
30日クイットメトリクス判定日:
