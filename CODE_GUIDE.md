# 🧭 コードの歩き方（初心者向けガイド）

このプロジェクトの「どのファイルが何をしているか」「どこを直せば何が変わるか」を、
プログラミング初心者の目線でまとめたメモです。まずここを読むと全体像がつかめます。

---

## 1. まず全体像

ゲームは **HTML + CSS + JavaScript** だけで動く「静的サイト」です。
特別なビルド作業は不要で、`index.html` をブラウザで開けば動きます（正確には `http://localhost` 経由）。

外部の道具(ライブラリ)を2つだけ、インターネット(CDN)から借りています:
- **Phaser 3** … 2Dゲームエンジン(キャラの移動やマップ描画を楽にしてくれる)
- **ethers.js** … ブロックチェーン(仮想通貨ICHIGO)と通信するための道具

---

## 2. ファイル地図

```
index.html      ← メインのゲーム「ICHIGO QUEST」。ここが入口(Vercelのトップ)
gacha.html      ← 初期プロトタイプの「イチゴガチャ」(課金の仕組みを試したもの)
js/
├─ ichigo-pay.js ← 課金(ICHIGO送金)の共通部品。ウォレット接続・残高・送金
├─ data.js       ← ゲームの「数字と設定」表(カード/敵/スキン/成長式)
├─ state.js      ← セーブデータ管理(レベル/ベリー/スキン/畑)。localStorageに保存
├─ battle.js     ← ターン制カードバトル(戦闘画面まるごと。DOM/CSSで作る)
└─ explore.js    ← マップ探索(Phaser)。村シーンとフィールドシーンの2つ
```

**読み始めるおすすめ順**: `data.js`(一番やさしい) → `state.js` → `ichigo-pay.js` → `battle.js` → `explore.js` → `index.html`

---

## 3. 読み込みの順番(index.html の下のほう)

`<script>` は **上から順に** 読み込まれます。順番が大事です:

```
1. ethers.js (CDN)      … ブロックチェーンの道具
2. phaser.js (CDN)      … ゲームエンジン
3. js/ichigo-pay.js     … 課金(ethersを使うので、ethersの後)
4. js/data.js           … データ表
5. js/state.js          … セーブ(dataを使う)
6. js/battle.js         … 戦闘(dataを使う)
7. js/explore.js        … マップ(data/state/battleを使う)
8. index.html 内の <script> … 全部を組み合わせてゲームを起動
```

各JSファイルは `window.○○ =` の形で「窓口」を1つ公開します
（例: `window.GameData`, `window.GameState`, `window.Battle`, `window.Explore`, `window.IchigoPay`）。
他のファイルはこの窓口を通してお互いを使います。

---

## 4. ゲームの流れ(どう繋がっているか)

```
[タイトル画面(index.html)]
   │ 「冒険に出る」を押す
   ▼
[Explore.launch() でゲーム起動] ── explore.js
   │
   ├─ 🏡 村シーン(VillageScene)
   │     ・畑で栽培(state.js の plant/harvest)
   │     ・🎨スキン屋(index.html の openSkinShop)
   │     ・⛩️門 → フィールドへ
   │
   └─ 🌾 フィールドシーン(FieldScene)
         ・動く敵AI(自分より上=追尾/下=逃走)
         ・敵に接触 → Battle.start() で戦闘 ── battle.js
              勝ち → state.js の grantXp(経験値・ベリー・レベルアップ)
              負け → index.html の onDefeat(任意でICHIGO復活 ── ichigo-pay.js)
```

---

## 5. 「ここを直せば、これが変わる」早見表

| やりたいこと | 直す場所 |
|---|---|
| カードの強さ・コストを変える | `js/data.js` の `CARDS` |
| 敵のHP・攻撃・レベルを変える | `js/data.js` の `ENEMIES` |
| レベルアップの必要経験値・HP増加量 | `js/data.js` の `maxHpForLevel` / `xpForNext` |
| スキンの種類・値段・色 | `js/data.js` の `SKINS` |
| いちごが育つ時間・収穫量 | `js/data.js` の `CROP` |
| 復活にかかるICHIGO | `index.html` の `REVIVE_COST` |
| プレイヤーの移動速度 | `js/explore.js` の `movePlayer` の `speed` |
| 敵の追尾/逃走スピード | `js/explore.js` の `enemyAI` の `CHASE` / `FLEE` |
| 敵の配置(どこに何を置くか) | `js/explore.js` の `FieldScene` 内の敵配置リスト |
| 送金先(集約ウォレット) | `js/ichigo-pay.js` の `GAME_WALLET` |
| 画面の色・見た目 | 各HTMLの `<style>`、`js/battle.js` の `injectStyle` |

---

## 6. 初心者がつまずきやすい用語メモ

- **関数** `function name(){...}` … 処理のまとまり。呼ぶと中身が実行される。
- **アロー関数** `() => {...}` … `function` を短く書いた形。中身は同じ。
- **`const` / `let`** … 変数(データの入れ物)の宣言。`const`は基本入れ替えない、`let`は入れ替える。
- **オブジェクト** `{ 名前: 値 }` … 名前つきのデータの集まり。`obj.名前` で取り出す。
- **配列** `[a, b, c]` … 順番に並んだデータ。`arr[0]` で0番目。
- **`async` / `await`** … 時間がかかる処理(通信など)を「待ってから次へ」進める書き方。
- **`Promise`** … 「あとで結果が返る約束」。`await` で結果を待てる。
- **テンプレートリテラル** `` `合計 ${x} 個` `` … 文字列の中に `${変数}` を埋め込める。
- **`addEventListener("click", ...)`** … ボタン等が押された時に処理を実行する“予約”。
- **`localStorage`** … ブラウザに小さなデータを保存する箱(セーブに使用)。
- **Phaser の Scene** … ゲームの「場面」。`create()`=最初に1回、`update()`=毎フレーム。

---

## 7. 動かし方(おさらい)

```bash
# プロジェクトのフォルダで:
python3 -m http.server 8000 --bind 127.0.0.1
# ブラウザで http://localhost:8000/ を開く(ゲーム)
#          http://localhost:8000/gacha.html(初期ガチャ)
```
`file://`(ファイルを直接ダブルクリック)だと MetaMask が反応しないので、必ず `http://localhost` で開きます。
