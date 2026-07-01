# 🎨 アニメ調イラストの作り方・入れ方

このゲームは「画像を所定の場所に置くだけ」でアニメ調の見た目に差し替わる仕組みです。
画像が無い間は絵文字(🐧🦠…)で動くので、用意できたものから順に綺麗になります。

---

## 1. まず用意する画像(キャラクター)

`assets/char/` フォルダに、下の**ファイル名ちょうど**で PNG を置いてください。

| ファイル名 | 中身 | 絵文字(仮) |
|---|---|---|
| `assets/char/penguin.png` | 主人公ペンギン | 🐧 |
| `assets/char/slug.png`    | ナメクジ(敵) | 🐛 |
| `assets/char/mold.png`    | カビ(敵)     | 🦠 |
| `assets/char/crow.png`    | いちご泥棒カラス(強敵) | 🐦 |
| `assets/char/boss.png`    | カビゴーレム王(ボス) | 👹 |

### 画像の仕様(そろえると綺麗に出ます)
- **形式**: PNG(**背景は透過**=まわりが透明)
- **サイズ**: 正方形。**512×512px 程度**(大きめでOK。ゲーム内で自動縮小します)
- **向き**: 正面〜少し斜めの1ポーズ(まずは動かない1枚絵でOK)
- **画風**: アニメ調・かわいい系。**全キャラで線の太さ・塗り・色調をそろえる**と統一感が出ます
- **余白**: キャラの周りに少し余白を入れる(端で切れないように)

> まずはこの5枚だけで、見た目がぐっとアニメ調になります。歩行アニメ(複数コマ)は後の段階で対応します。

---

## 2. AIで生成するときのプロンプト例

画像生成AI(Midjourney / DALL·E / Stable Diffusion 等)向けの例です。**同じ画風**にするため、
各キャラで「共通の指定(スタイル)」+「そのキャラの説明」を組み合わせるのがコツです。

**共通スタイル(毎回つける)**
```
cute anime style, chibi, thick clean outline, soft cel shading, pastel colors,
full body, front view, centered, simple, transparent background, game character sprite
```

**キャラ別の例**
- ペンギン:`a small round penguin hero holding a tiny sword, red strawberry motif scarf`
- ナメクジ:`a cute green slug monster, slightly slimy, harmless looking`
- カビ  :`a round fluffy mold monster, teal color, googly eyes`
- カラス :`a mischievous crow holding a stolen strawberry, cheeky expression`
- ボス  :`a big menacing mold golem king with a crown, boss monster, imposing`

> 生成後、背景が残っていたら「背景透過(remove background)」ツールで透明にしてから保存してください。
> ファイル名を上の表どおりにして `assets/char/` に置くだけで反映されます。

---

## 3. 反映のされ方(仕組み)

- ゲーム(マップ)側: `js/assets.js` に書かれたファイルを読み込み、**あれば画像・無ければ絵文字**で表示。
- 戦闘側: 同じ画像を使い、読み込めなければ自動で絵文字に戻ります。
- つまり **置くだけ**。コードを書き換える必要はありません(ファイル名だけ正確に)。

---

## 4. これから(フェーズ2以降の素材・任意)

余裕があれば、さらに綺麗にできます(対応は順次追加します):
- **背景/タイル**: 村の草地・道・畑、フィールドの荒地・岩(`assets/tiles/`)
- **UI**: カード枠・ボタン・HP/あまみバー・タイトルロゴ(`assets/ui/`)。UIは Canva でも作れます。
- **歩行アニメ**: 1キャラ複数コマ(スプライトシート)にすると歩行が動きます。

これらを作りたくなったら、必要なサイズ・枚数の仕様をこちらで用意します。まずは §1 のキャラ5枚から!
