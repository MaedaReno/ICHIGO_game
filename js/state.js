/*
 * state.js — 永続プロフィール(レベル/経験値/ベリー/スキン/畑)の管理
 * localStorage に保存。ウォレット接続時はアカウント別、未接続なら "guest"。
 * window.GameState として公開。
 */
window.GameState = (function () {
  let profile = null;

  function DEFAULT() {
    return { level: 1, xp: 0, berries: 0, skin: "normal", ownedSkins: ["normal"], farm: [null, null, null] };
  }
  function key() {
    const a = (window.IchigoPay && IchigoPay.connected && IchigoPay.account)
      ? IchigoPay.account.toLowerCase() : "guest";
    return "ichigo_quest_profile_" + a;
  }
  function load() {
    try { profile = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(key())) || {}); }
    catch { profile = DEFAULT(); }
    if (!Array.isArray(profile.farm)) profile.farm = [null, null, null];
    while (profile.farm.length < 3) profile.farm.push(null);
    if (!Array.isArray(profile.ownedSkins) || !profile.ownedSkins.includes("normal"))
      profile.ownedSkins = Array.from(new Set(["normal", ...(profile.ownedSkins || [])]));
    return profile;
  }
  function save() { localStorage.setItem(key(), JSON.stringify(profile)); }

  // ---- レベル ----
  function maxHp() { return GameData.maxHpForLevel(profile.level); }
  function grantXp(kind) {
    const gained = GameData.xpReward(kind);
    profile.xp += gained;
    let leveled = 0;
    while (profile.xp >= GameData.xpForNext(profile.level)) {
      profile.xp -= GameData.xpForNext(profile.level);
      profile.level++; leveled++;
    }
    profile.berries += GameData.berryReward(kind);
    save();
    return { gained, leveled, berries: GameData.berryReward(kind) };
  }

  // ---- 畑(栽培) ----
  function plotState(i) {
    const p = profile.farm[i];
    if (!p) return "empty";
    return (Date.now() - p.plantedAt >= GameData.CROP.growMs) ? "ready" : "growing";
  }
  function growthPct(i) {
    const p = profile.farm[i];
    if (!p) return 0;
    return Math.min(1, (Date.now() - p.plantedAt) / GameData.CROP.growMs);
  }
  function plant(i) { if (profile.farm[i]) return false; profile.farm[i] = { plantedAt: Date.now() }; save(); return true; }
  function harvest(i) {
    if (plotState(i) !== "ready") return 0;
    profile.farm[i] = null; profile.berries += GameData.CROP.yield; save();
    return GameData.CROP.yield;
  }

  // ---- スキン ----
  function ownSkin(id) { return profile.ownedSkins.includes(id); }
  function addSkin(id) { if (!ownSkin(id)) { profile.ownedSkins.push(id); save(); } }
  function setSkin(id) { if (ownSkin(id)) { profile.skin = id; save(); return true; } return false; }
  function skinColor() { return (GameData.SKINS[profile.skin] || GameData.SKINS.normal).color; }
  function skinName() { return (GameData.SKINS[profile.skin] || GameData.SKINS.normal).name; }

  // ---- ベリー ----
  function spendBerries(n) { if (profile.berries >= n) { profile.berries -= n; save(); return true; } return false; }

  return {
    load, save, get profile() { return profile; },
    maxHp, grantXp, plotState, growthPct, plant, harvest,
    ownSkin, addSkin, setSkin, skinColor, skinName, spendBerries,
  };
})();
