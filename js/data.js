/*
 * ============================================================
 *  このファイルは何?
 * ------------------------------------------------------------
 *  data.js — ゲームの「データ表」だけを集めたファイル。
 *
 *  カードの強さ、敵のHP、スキンの値段、レベルアップに必要な経験値…など
 *  “数字と設定” をここにまとめてあります。バランス調整(強すぎ/弱すぎの修正)は
 *  基本この1ファイルを書き換えるだけでOK。処理(動き)は他のファイルが担当します。
 *
 *  使い方: 他ファイルから window.GameData.CARDS のように参照します。
 * ============================================================
 */

// 全体を即時実行関数 (function(){ ... })() で囲み、最後に必要なものだけ return して公開する。
// こうすると中の細かい部品を外から触れなくして、名前の衝突を防げる。
window.GameData = (function () {

  // ============================================================
  //  カード定義 — 戦闘で使うスキルカード一覧
  // ============================================================
  // 各カードの意味:
  //   type  … 効果の種類: attack(敵1体に攻撃) / aoe(敵全体に攻撃) / heal(自分回復) / block(シールド)
  //   cost  … 使うのに必要な「あまみ(エナジー)」
  //   value … 効果の大きさ(ダメージや回復量)
  //   hits  … 攻撃の回数(省略時は1回)
  //   desc  … カードに表示する説明文
  const CARDS = {
    peck:     { id: "peck",     name: "つつき",         emoji: "🐧", type: "attack", cost: 1, value: 6,  desc: "敵に 6 ダメージ" },
    combo:    { id: "combo",    name: "れんぞくつつき", emoji: "⚡", type: "attack", cost: 1, value: 3, hits: 2, desc: "敵に 3 ダメージ ×2" },
    blizzard: { id: "blizzard", name: "ふぶき",         emoji: "❄️", type: "aoe",    cost: 2, value: 5,  desc: "敵全体に 5 ダメージ" },
    milk:     { id: "milk",     name: "いちごミルク",   emoji: "🥛", type: "heal",   cost: 1, value: 6,  desc: "HP を 6 回復" },
    guard:    { id: "guard",    name: "こおりのたて",   emoji: "🛡️", type: "block",  cost: 1, value: 6,  desc: "シールド +6" },
    bigbeak:  { id: "bigbeak",  name: "だいばくちくちばし", emoji: "💥", type: "attack", cost: 2, value: 12, desc: "敵に 12 ダメージ" },
  };

  // ============================================================
  //  ヒーロー(主人公ペンギン)のベース設定
  // ============================================================
  // maxHp はここでは仮の値。実際の最大HPは「今のレベル」に応じて
  // maxHpForLevel() で計算し直されます(レベルが上がるほど増える)。
  //   energy   … 1ターンに使える「あまみ」の量
  //   handSize … 毎ターン引くカードの枚数
  //   deck     … 山札。カードidを並べたもの(同じidを複数入れると枚数が増える)
  const HERO = {
    name: "いちごペンギン",
    emoji: "🐧",
    maxHp: 42,
    energy: 3,
    handSize: 5,
    deck: ["peck", "peck", "peck", "combo", "combo", "milk", "guard", "guard", "blizzard", "bigbeak"],
  };

  // ============================================================
  //  敵の定義 — マップ上の敵1種ごとの設定
  // ============================================================
  //   kind    … 種類ラベル(normal / elite / boss)。報酬や出現に使う
  //   level   … 敵のレベル。マップ上で「自分より上=追尾/下=逃走」の判定に使う
  //   intents … 敵の行動パターン(順番に繰り返す)。attack=攻撃 / defend=シールド
  const ENEMIES = {
    slug:  { id: "slug",  name: "ナメクジ",   emoji: "🐛", kind: "normal", level: 1, maxHp: 14,
             intents: [{ type: "attack", value: 4 }, { type: "attack", value: 4 }] },
    mold:  { id: "mold",  name: "カビ",       emoji: "🦠", kind: "normal", level: 1, maxHp: 20,
             intents: [{ type: "attack", value: 5 }, { type: "attack", value: 7 }, { type: "defend", value: 5 }] },
    crow:  { id: "crow",  name: "いちご泥棒カラス", emoji: "🐦", kind: "elite", level: 3, maxHp: 24,
             intents: [{ type: "attack", value: 8 }, { type: "defend", value: 6 }, { type: "attack", value: 6 }] },
    boss:  { id: "boss",  name: "カビゴーレム王", emoji: "👹", kind: "boss", level: 5, maxHp: 55,
             intents: [{ type: "attack", value: 10 }, { type: "defend", value: 8 }, { type: "attack", value: 6 }, { type: "attack", value: 14 }] },
  };

  // ============================================================
  //  戦闘の組み合わせ — 「どの敵に触れたか」で出る敵グループを決める
  // ============================================================
  // clone() でコピーを返しているのは、戦闘でHPを削っても“元データ”を壊さないため。
  function encounter(kind) {
    if (kind === "boss")  return [clone(ENEMIES.boss)];                 // ボスは単体
    if (kind === "elite") return [clone(ENEMIES.crow), clone(ENEMIES.slug)]; // 強敵+雑魚
    return [clone(ENEMIES.mold), clone(ENEMIES.slug)];                  // 通常戦
  }

  // ============================================================
  //  スキン定義 — ペンギンのオーラ色(見た目)
  // ============================================================
  // currency(支払い方法):
  //   null     … 最初から持っている(無料)
  //   "berry"  … ゲーム内通貨「きらめきベリー」で購入
  //   "ichigo" … 任意で ICHIGO(仮想通貨)で購入 ← 課金は完全に任意
  //   color    … 0x はJSでの16進数(色コード)の書き方。0xff5a7a = #ff5a7a
  const SKINS = {
    normal:     { id: "normal",     name: "ノーマル",     color: 0x8fd0ff, price: 0,  currency: null },
    strawberry: { id: "strawberry", name: "いちご",       color: 0xff5a7a, price: 30, currency: "berry" },
    mint:       { id: "mint",       name: "ミント",       color: 0x7be0b0, price: 30, currency: "berry" },
    gold:       { id: "gold",       name: "ゴールド",     color: 0xffd24a, price: 90, currency: "berry" },
    aurora:     { id: "aurora",     name: "オーロラ✨",   color: 0xb388ff, price: 5,  currency: "ichigo" },
  };

  // ============================================================
  //  作物(いちご栽培)の設定
  // ============================================================
  //   growMs … 育つのにかかる時間(ミリ秒)。20000 = 20秒
  //   yield  … 収穫でもらえるベリーの量
  const CROP = { seed: "🌱", growing: "🌿", ready: "🍓", growMs: 20000, yield: 12 };

  // ============================================================
  //  成長の計算式 — レベルや報酬の“数式”をまとめた関数群
  // ============================================================
  function maxHpForLevel(lv) { return 42 + (lv - 1) * 6; }   // レベルが1上がるごとに最大HP +6
  function xpForNext(lv)     { return 20 + (lv - 1) * 15; }  // 次のレベルに必要な経験値(だんだん増える)
  function xpReward(kind)    { return kind === "boss" ? 60 : kind === "elite" ? 25 : 10; } // 勝った時の経験値
  function berryReward(kind) { return kind === "boss" ? 50 : kind === "elite" ? 15 : 4; }  // 勝った時のベリー

  // オブジェクトを丸ごとコピーする小道具(JSON化→復元 で簡単に複製できる)
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ここで return したものだけが window.GameData から使える(外部に公開する部品)
  return { CARDS, HERO, ENEMIES, encounter, SKINS, CROP,
           maxHpForLevel, xpForNext, xpReward, berryReward, clone };
})();
