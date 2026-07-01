/*
 * ============================================================
 *  このファイルは何?
 * ------------------------------------------------------------
 *  state.js — プレイヤーの「セーブデータ」を管理するファイル。
 *
 *  レベル / 経験値 / きらめきベリー / 選んでいるスキン / 持っているスキン / 畑の状態
 *  …といった “ずっと覚えておきたい情報” をまとめて持ち、ブラウザに保存します。
 *
 *  保存先は localStorage(ブラウザ内の小さな保存箱)。
 *  ウォレット接続中はアカウント別に、未接続なら "guest" として保存します。
 *
 *  使い方: GameState.load() で読み込み → GameState.profile で中身参照 →
 *          変更する関数(grantXp / plant など)を呼ぶと自動で保存されます。
 * ============================================================
 */
window.GameState = (function () {
  let profile = null; // 現在のセーブデータ(1つ)をここに持つ

  // ============================================================
  //  読み込み・保存 — localStorage との出し入れ
  // ============================================================

  // DEFAULT() … まだセーブが無い時に使う「初期状態」を返す
  function DEFAULT() {
    return { level: 1, xp: 0, berries: 0, skin: "normal", ownedSkins: ["normal"], farm: [null, null, null] };
  }
  // key() … 保存に使う名前。接続中はアカウント別、未接続は "guest"
  function key() {
    const a = (window.IchigoPay && IchigoPay.connected && IchigoPay.account)
      ? IchigoPay.account.toLowerCase() : "guest";
    return "ichigo_quest_profile_" + a;
  }
  // load() … 保存を読み込む。JSON文字列 → オブジェクトに戻す(JSON.parse)。
  //          Object.assign(DEFAULT(), 保存) で、足りない項目は初期値で補う。
  function load() {
    try { profile = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(key())) || {}); }
    catch { profile = DEFAULT(); } // 壊れていたら初期状態に
    // 古いセーブでも壊れないよう、畑とスキン所持リストの形を整える
    if (!Array.isArray(profile.farm)) profile.farm = [null, null, null];
    while (profile.farm.length < 3) profile.farm.push(null);
    if (!Array.isArray(profile.ownedSkins) || !profile.ownedSkins.includes("normal"))
      profile.ownedSkins = Array.from(new Set(["normal", ...(profile.ownedSkins || [])]));
    return profile;
  }
  // save() … 今の profile を JSON文字列にして保存(JSON.stringify)。
  function save() { localStorage.setItem(key(), JSON.stringify(profile)); }

  // ============================================================
  //  レベル — 経験値をためてレベルアップ
  // ============================================================
  function maxHp() { return GameData.maxHpForLevel(profile.level); } // 今のレベルの最大HP
  // grantXp() … 戦闘に勝った時に呼ぶ。経験値とベリーを加算し、
  //             必要量に届いたらレベルアップ(何回でも)。結果を返す。
  function grantXp(kind) {
    const gained = GameData.xpReward(kind);
    profile.xp += gained;
    let leveled = 0;
    // while … 条件が続く間くり返す。経験値が余ったら連続でレベルアップする
    while (profile.xp >= GameData.xpForNext(profile.level)) {
      profile.xp -= GameData.xpForNext(profile.level);
      profile.level++; leveled++;
    }
    profile.berries += GameData.berryReward(kind);
    save();
    return { gained, leveled, berries: GameData.berryReward(kind) };
  }

  // ============================================================
  //  畑(いちご栽培) — 3区画の植える/育つ/収穫
  // ============================================================
  // plotState() … 区画 i の状態を返す: "empty"(空) / "growing"(育成中) / "ready"(収穫可)
  //   Date.now() は「今の時刻(ミリ秒)」。植えた時刻との差で育ったか判定する。
  function plotState(i) {
    const p = profile.farm[i];
    if (!p) return "empty";
    return (Date.now() - p.plantedAt >= GameData.CROP.growMs) ? "ready" : "growing";
  }
  // growthPct() … 育ち具合を 0〜1 で返す(進捗バーなどに使える)
  function growthPct(i) {
    const p = profile.farm[i];
    if (!p) return 0;
    return Math.min(1, (Date.now() - p.plantedAt) / GameData.CROP.growMs);
  }
  function plant(i) { if (profile.farm[i]) return false; profile.farm[i] = { plantedAt: Date.now() }; save(); return true; }
  function harvest(i) {
    if (plotState(i) !== "ready") return 0; // まだ育っていなければ何もしない
    profile.farm[i] = null; profile.berries += GameData.CROP.yield; save();
    return GameData.CROP.yield; // 収穫できたベリー量を返す
  }

  // ============================================================
  //  スキン — 見た目の所持・装備・購入判定
  // ============================================================
  function ownSkin(id) { return profile.ownedSkins.includes(id); }         // 持っているか
  function addSkin(id) { if (!ownSkin(id)) { profile.ownedSkins.push(id); save(); } } // 手に入れる
  function setSkin(id) { if (ownSkin(id)) { profile.skin = id; save(); return true; } return false; } // 装備する
  function skinColor() { return (GameData.SKINS[profile.skin] || GameData.SKINS.normal).color; } // 今のスキンの色
  function skinName() { return (GameData.SKINS[profile.skin] || GameData.SKINS.normal).name; }   // 今のスキン名

  // ============================================================
  //  ベリー — ゲーム内通貨の消費
  // ============================================================
  function spendBerries(n) { if (profile.berries >= n) { profile.berries -= n; save(); return true; } return false; }

  // 外部に公開する部品。profile は getter(関数)にして常に最新の中身を返す。
  return {
    load, save, get profile() { return profile; },
    maxHp, grantXp, plotState, growthPct, plant, harvest,
    ownSkin, addSkin, setSkin, skinColor, skinName, spendBerries,
  };
})();
