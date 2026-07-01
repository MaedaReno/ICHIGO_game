/*
 * ============================================================
 *  このファイルは何?
 * ------------------------------------------------------------
 *  assets.js — 画像ファイルの「置き場所リスト」と読み込みの窓口。
 *
 *  ここに書いたファイルが assets/char/ にあれば、ゲームがそれを使います。
 *  無ければ絵文字(🐧🦠…)で表示されるので、置くだけで少しずつ綺麗になります。
 *  → 画像の作り方は ART_SPEC.md を参照。
 * ============================================================
 */
window.Assets = (function () {
  // キー(呼び名) → 画像ファイルのパス。キー名は data.js の敵id / "penguin" と対応。
  const CHAR = {
    penguin: "assets/char/penguin.png",
    slug:    "assets/char/slug.png",
    mold:    "assets/char/mold.png",
    crow:    "assets/char/crow.png",
    boss:    "assets/char/boss.png",
  };

  // load … Phaser のシーンで preload() から呼ぶ。全画像の読み込みを予約する。
  // ファイルが無ければ読み込み失敗(コンソールに警告)になるだけで、ゲームは止まらない。
  function load(scene) {
    for (const key in CHAR) {
      if (!scene.textures.exists(key)) scene.load.image(key, CHAR[key]);
    }
  }
  // has … その画像が実際に読み込めているか(=ファイルが存在したか)を返す。
  function has(scene, key) { return !!(scene.textures && scene.textures.exists(key)); }

  return { CHAR, load, has };
})();
