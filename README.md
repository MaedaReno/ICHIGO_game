# 🍓 ichigo_game

学内通貨「ICHIGO」(ERC-20トークン / Optimism) を使うブラウザゲーム。

- **メイン: 🐧 ICHIGO QUEST** = `index.html`（Vercelのトップ）。ペンギンがいちご畑を守るターン制ローグライクRPG。
- **試作: 🍓 イチゴガチャ** = `gacha.html`。課金の仕組みを検証した初期プロトタイプ。

---

## 🍓 イチゴガチャ（`gacha.html` / 初期プロトタイプ）

ICHIGO で課金するガチャ。

## 構成
- **フロント**: 素のHTML + ethers.js v6 (CDN) — ビルド不要
- **ネットワーク**: Optimism Mainnet (chainId 10)
- **トークン**: ICHIGO `0x836700463Dce76D9Cc3CDf6F6EDF946312c01869` (decimals 18)

## 課金の仕組み(方法C:ガス節約型)
- ガチャ1回ごとに `COST` ICHIGO を **集約用ウォレット `GAME_WALLET` に1回だけ送金**する
- 運営2人の **5:5 精算は後でまとめて手動送金**(オンチェーンの自動分配コントラクトは使わない=ガス代を最小化)
- 設定は `gacha.html` 冒頭の `// ===== 設定 =====` 内（`GAME_WALLET` / `COST`）

> ⚠️ ガス代(Optimism上のETH)は限られているため、コントラクトのデプロイは行わない方針。

## ローカルで動かす
`http://localhost` で開く必要あり（`file://` だと MetaMask が反応しない）。
```bash
python3 -m http.server 8000 --bind 127.0.0.1
# → ブラウザで http://localhost:8000/
```

## GitHub → Vercel で公開
1. GitHub で空リポジトリ `ichigo_game` を作る
2. ```bash
   git add .
   git commit -m "イチゴガチャ(方法C)"
   git branch -M main
   git remote add origin https://github.com/<あなたのID>/ichigo_game.git
   git push -u origin main
   ```
3. https://vercel.com に GitHub でログイン → Add New Project → このリポジトリを選択
4. Framework は「Other」のまま Deploy → `https://...vercel.app` が発行される

## ロードマップ(ガチャ版)
- [x] ステップ1: イチゴ残高を読む
- [x] ステップ2: イチゴを送金して課金
- [x] ステップ3: 送金確認後にガチャ/アイテム付与
- [ ] ステップ4: GitHub → Vercel 公開

---

# 🐧 ICHIGO QUEST（メイン / `index.html`）

ペンギンがいちご畑を守る、ターン制ローグライク RPG。マップ探索 → 敵に接触 → カードバトル。
**プレイは完全無料**(ウォレット不要)。ICHIGO は **任意の要素だけ**に使う。
現状の任意課金ポイント: **敗北時の復活(コンティニュー)**。払わなければ無料でやり直し。
支払いは方法C(集約先へ1回送金、5:5精算は後で手動)。

- `index.html` … エントリ(タイトル/ウォレット/ゲーム起動)
- `js/ichigo-pay.js` … 課金共通モジュール(`window.IchigoPay`)
- `js/data.js` … ヒーロー/カード/敵データ(バランス調整はここ)
- `js/battle.js` … ターン制カードバトル(DOM/CSS)
- `js/explore.js` … Phaser のマップ探索シーン
- 依存: Phaser 3 + ethers.js v6(CDN・ビルド不要)
- アート: 現在は**絵文字プレースホルダ**(🐧🦠🐛🐦👹🍓)。後で CC0 / AI 生成スプライトに差し替え

## 遊び方(ローカル)
```bash
python3 -m http.server 8000 --bind 127.0.0.1
# → http://localhost:8000/ （file:// は不可。ガチャは /gacha.html）
```
1. 「冒険に出る」で**無料**開始(ウォレット不要)
2. 矢印 / WASD でペンギンを移動、敵に触れて戦闘
3. カード(あまみを消費)で戦い、カビゴーレム王を倒せばクリア
4. やられたら **任意**で「🍓 ICHIGOで復活(30)」→ HP全回復＆続行。復活を使うにはタイトルでウォレット接続

> テスト中は `js/ichigo-pay.js` の `GAME_WALLET` を自分のアドレスにしておくと、
> 復活課金しても ICHIGO は自分に戻る(ガス代のみ)ので気軽に検証できる。
> 課金ポイントの追加(ブースト購入・スキン等)は `index.html` に足すだけ。

## ロードマップ(QUEST)
- [x] 課金モジュール抽出 + タイトル/ウォレット
- [x] Phaser マップ探索(移動・当たり判定・カメラ)
- [x] ターン制カードバトル(手札/あまみ/敵意図/勝敗)
- [x] 探索→戦闘→課金→クリア/敗北(最小プレイアブル)
- [ ] アート差し替え(AI ペンギン等)・音・演出・ストーリー肉付け
- [ ] GitHub → Vercel 公開
