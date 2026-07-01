/*
 * explore.js — Phaser のマップ探索シーン
 * ペンギンを動かして敵に触れると戦闘、ボスを倒すとクリア。
 * アセット無しで動くよう、キャラ/敵は絵文字テキストで表現(後で画像に差し替え可)。
 *
 *   Explore.launch({
 *     parent: "game-container",
 *     hero,                        // battle と共有(hp を持ち越す)
 *     onEncounter: (kind) => Promise<"win"|"lose">,
 *     onDefeat:    () => Promise<"revive"|"quit">,  // 敗北時。revive なら hero.hp を回復して続行
 *     onClear:     () => {},
 *     onGameOver:  () => {},        // あきらめてタイトルへ
 *   });
 */
window.Explore = (function () {
  const TILE = 48, COLS = 24, ROWS = 18;
  let game = null;

  // 0=地面, 1=障害物(茂み/水)。外周は壁。
  function buildMap() {
    const m = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
        // 障害物をまばらに(通行できる程度に)。開始/ゴール付近は空ける。
        const nearStart = x < 4 && y < 4;
        const nearGoal = x > COLS - 5 && y > ROWS - 5;
        const bush = !border && !nearStart && !nearGoal && Math.random() < 0.10;
        row.push(border || bush ? 1 : 0);
      }
      m.push(row);
    }
    return m;
  }

  function launch(opts) {
    const scene = {
      key: "explore",
      create() { create.call(this, opts); },
      update() { update.call(this); },
    };
    const config = {
      type: Phaser.AUTO,
      width: COLS * TILE,
      height: ROWS * TILE,
      parent: opts.parent || "game-container",
      backgroundColor: "#8fca6b",
      physics: { default: "arcade", arcade: { debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene,
    };
    game = new Phaser.Game(config);
    return game;
  }

  function create(opts) {
    const scene = this;
    scene.opts = opts;
    scene.inBattle = false;
    const map = buildMap();

    // --- 地面のマス目を描く ---
    const g = scene.add.graphics();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const light = (x + y) % 2 === 0;
        g.fillStyle(light ? 0x93cf72 : 0x8bc86a, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // --- 障害物(茂み/壁)を静的ボディで ---
    scene.walls = scene.physics.add.staticGroup();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (map[y][x] === 1) {
          const isBorder = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
          const rect = scene.add.rectangle(
            x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE,
            isBorder ? 0x5b8f3e : 0x3f7a34
          );
          scene.walls.add(rect);
          if (!isBorder) scene.add.text(x * TILE + TILE / 2, y * TILE + TILE / 2, "🌳",
            { fontSize: "26px" }).setOrigin(0.5);
        }
      }
    }

    // --- ゴール(いちご畑) ---
    scene.goal = emojiSprite(scene, (COLS - 2.5) * TILE, (ROWS - 2.5) * TILE, "🍓", 34);

    // --- 敵の配置(kind: normal/elite/boss) ---
    const placements = [
      { c: 8,  r: 4,  kind: "normal", emoji: "🦠" },
      { c: 14, r: 9,  kind: "normal", emoji: "🐛" },
      { c: 6,  r: 13, kind: "elite",  emoji: "🐦" },
      { c: COLS - 3, r: ROWS - 3, kind: "boss", emoji: "👹" },
    ];
    scene.enemies = scene.physics.add.group();
    placements.forEach((p) => {
      const e = emojiSprite(scene, p.c * TILE + TILE / 2, p.r * TILE + TILE / 2, p.emoji, p.kind === "boss" ? 40 : 30);
      e.kind = p.kind;
      e.body.setImmovable(true);
      scene.enemies.add(e);
    });

    // --- プレイヤー(ペンギン) ---
    scene.player = emojiSprite(scene, 2 * TILE + TILE / 2, 2 * TILE + TILE / 2, "🐧", 34);
    scene.player.body.setCollideWorldBounds(true);

    // --- 物理 ---
    scene.physics.world.setBounds(0, 0, COLS * TILE, ROWS * TILE);
    scene.physics.add.collider(scene.player, scene.walls);
    scene.cameras.main.setBounds(0, 0, COLS * TILE, ROWS * TILE);
    scene.cameras.main.startFollow(scene.player, true, 0.1, 0.1);

    // 敵との接触 → 戦闘
    scene.physics.add.overlap(scene.player, scene.enemies, (player, enemy) => {
      if (scene.inBattle) return;
      onTouchEnemy(scene, enemy);
    });
    // ゴール
    scene.physics.add.overlap(scene.player, scene.goal, () => {
      if (scene.inBattle || scene.cleared) return;
      if (scene.enemies.countActive(true) > 0) {
        toast(scene, "まだ敵がいる! 全部たおそう");
      } else {
        scene.cleared = true;
        scene.opts.onClear && scene.opts.onClear();
      }
    });

    // 入力
    scene.cursors = scene.input.keyboard.createCursorKeys();
    scene.wasd = scene.input.keyboard.addKeys("W,A,S,D");

    // HUD
    scene.hud = scene.add.text(10, 10, "", { fontSize: "18px", color: "#fff", backgroundColor: "#0006", padding: { x: 8, y: 4 } })
      .setScrollFactor(0).setDepth(100);
    updateHud(scene);
    toast(scene, "矢印/WASD で移動。敵に触れると戦闘、🍓を目指せ!");
  }

  function emojiSprite(scene, x, y, emoji, size) {
    const t = scene.add.text(x, y, emoji, { fontSize: size + "px" }).setOrigin(0.5);
    scene.physics.add.existing(t);
    t.body.setSize(size * 0.7, size * 0.7);
    t.body.setOffset((t.width - size * 0.7) / 2, (t.height - size * 0.7) / 2);
    return t;
  }

  async function onTouchEnemy(scene, enemy) {
    scene.inBattle = true;
    scene.physics.pause();
    scene.player.body.setVelocity(0, 0);
    const result = await scene.opts.onEncounter(enemy.kind);
    const wasBoss = enemy.kind === "boss";

    if (result === "lose") {
      // 敗北 → 復活するかタイトルへ戻るかを呼び出し側に委ねる
      const choice = scene.opts.onDefeat ? await scene.opts.onDefeat() : "quit";
      if (choice !== "revive") {
        scene.opts.onGameOver && scene.opts.onGameOver();
        return;
      }
      // 復活: hero.hp は呼び出し側で回復済み。倒せなかった敵は撤退させて続行。
    }

    // 勝利、または復活を選んだ場合 → 敵を消して探索へ復帰
    enemy.destroy();
    scene.inBattle = false;
    scene.physics.resume();
    updateHud(scene);
    if (wasBoss) {
      scene.cleared = true;
      scene.opts.onClear && scene.opts.onClear();
    } else if (scene.enemies.countActive(true) === 1) {
      toast(scene, "ラスボスは🍓の前だ!");
    }
  }

  function update() {
    const scene = this;
    if (!scene.player || scene.inBattle || scene.cleared) return;
    const speed = 170;
    const c = scene.cursors, w = scene.wasd;
    let vx = 0, vy = 0;
    if (c.left.isDown || w.A.isDown) vx = -speed;
    else if (c.right.isDown || w.D.isDown) vx = speed;
    if (c.up.isDown || w.W.isDown) vy = -speed;
    else if (c.down.isDown || w.S.isDown) vy = speed;
    scene.player.body.setVelocity(vx, vy);
  }

  function updateHud(scene) {
    const h = scene.opts.hero;
    scene.hud.setText(`🐧 HP ${h.hp}/${h.maxHp}   残り敵 ${scene.enemies.countActive(true)}`);
  }

  let toastObj = null;
  function toast(scene, msg) {
    if (toastObj) toastObj.destroy();
    toastObj = scene.add.text(scene.scale.width / 2, scene.scale.height - 40, msg,
      { fontSize: "18px", color: "#fff", backgroundColor: "#000000aa", padding: { x: 12, y: 6 } })
      .setOrigin(0.5).setScrollFactor(0).setDepth(100);
    scene.time.delayedCall(2600, () => { if (toastObj) { toastObj.destroy(); toastObj = null; } });
  }

  function destroy() { if (game) { game.destroy(true); game = null; } }

  return { launch, destroy };
})();
