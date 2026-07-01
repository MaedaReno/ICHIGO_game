/*
 * ============================================================
 *  このファイルは何?
 * ------------------------------------------------------------
 *  ichigo-pay.js — 仮想通貨「ICHIGO」で課金する部分をまとめた共通ファイル。
 *
 *  ICHIGO は Optimism(オプティミズム)というブロックチェーン上のトークン(ERC-20)。
 *  このファイルは MetaMask(ウォレット)とやり取りして「残高を見る」「送金する」を担当します。
 *  ゲーム本体・ガチャの両方から使い回せるよう、部品として独立させています。
 *
 *  前提: HTMLで先に ethers.js(ブロックチェーン通信ライブラリ)を読み込むこと。
 *        その後にこのファイルを読むと、window.IchigoPay が使えるようになります。
 *
 *  よく使う流れ:
 *    await IchigoPay.connect();          // MetaMask に接続
 *    await IchigoPay.switchToOptimism(); // ネットワークを Optimism に切替
 *    await IchigoPay.pay(30);            // 30 ICHIGO を集約先へ送金(=課金)
 *    const { formatted } = await IchigoPay.getBalance(); // 残高を取得
 *
 *  ※ await/async … 通信など「時間がかかる処理」を“待ってから次へ進む”ための書き方。
 * ============================================================
 */
(function () {
  "use strict"; // 書き間違いを厳しくチェックするモード(バグを見つけやすくする)

  // ============================================================
  //  設定 — トークンの住所やネットワーク情報(ここを変えれば別トークンにも対応)
  // ============================================================

  const TOKEN_ADDR  = "0x836700463Dce76D9Cc3CDf6F6EDF946312c01869"; // ICHIGO トークンの住所(コントラクトアドレス)
  // 方法C: 課金はこの「集約用ウォレット(運営代表)」へ1回の送金で集める。
  // 運営2人の 5:5 精算は後でまとめて手動送金する(オンチェーン自動分配はしない=ガス代を節約)。
  // ★テスト中は自分のアドレスにしておくと ICHIGO が戻るのでガス代だけで検証できる。
  const GAME_WALLET = "0x0d9Ff88703b8bcB42ca7e526246C2dcf9A4aEdb9";
  const OP_CHAIN_ID = 10n; // Optimism のネットワーク番号(末尾の n は「大きな整数」を表すBigInt)
  // Optimism をウォレットに登録/切替するための情報一式
  const OPTIMISM = {
    chainId: "0xa", chainName: "OP Mainnet", // 0xa は16進数で 10(=OP_CHAIN_ID)
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.optimism.io"],           // ブロックチェーンへの接続先
    blockExplorerUrls: ["https://optimistic.etherscan.io"], // 取引を確認できるサイト
  };
  // ABI … コントラクトの「使える関数の一覧表」。使う3つだけ書けばOK。
  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)", // 残高を見る
    "function decimals() view returns (uint8)",           // 小数の桁数
    "function transfer(address to, uint256 amount) returns (bool)", // 送金する
  ];

  // ============================================================
  //  内部状態 — 接続中の情報を1か所にまとめて持つ
  // ============================================================
  const state = {
    provider: null, // ブロックチェーンへの“窓口”
    signer: null,   // 署名者(=あなた。送金などの承認をする人)
    account: null,  // あなたのアドレス(0x…)
    token: null,    // ICHIGO コントラクトを操作するための道具
    decimals: 18n,  // ICHIGO の小数桁(通常18)
    connected: false,
  };

  // ethers.js が読み込まれているか確認する(読み込み忘れの事故を防ぐ)
  function ensureEthers() {
    if (typeof window.ethers === "undefined") {
      throw new Error("ethers.js が読み込まれていません。<script> の順番を確認してください。");
    }
  }

  // ============================================================
  //  接続 — MetaMask につなぐ
  // ============================================================
  async function connect() {
    ensureEthers();
    if (!window.ethereum) { // window.ethereum は MetaMask が用意する“接続口”
      throw new Error("MetaMask が見つかりません。http://localhost で開いているか確認してください。");
    }
    state.provider = new ethers.BrowserProvider(window.ethereum); // 窓口を作る
    await state.provider.send("eth_requestAccounts", []);          // 接続の許可をユーザーに求める
    state.signer = await state.provider.getSigner();               // 署名者を取得
    state.account = await state.signer.getAddress();               // 自分のアドレスを取得
    state.token = new ethers.Contract(TOKEN_ADDR, ERC20_ABI, state.signer); // ICHIGO操作の道具を用意
    state.decimals = await state.token.decimals().catch(() => 18n);// 小数桁を取得(失敗時は18)
    state.connected = true;
    return state.account;
  }

  // アカウントやネットワークが変わったら知らせてもらう(標準はページを再読み込み)
  function onChange(handler) {
    if (!window.ethereum) return;
    const cb = handler || (() => location.reload());
    window.ethereum.on?.("chainChanged", cb);     // ネットワーク変更時
    window.ethereum.on?.("accountsChanged", cb);  // アカウント変更時
  }

  // ============================================================
  //  ネットワーク — 今つながっている先の確認と切替
  // ============================================================
  async function checkNetwork() {
    if (!state.provider) throw new Error("先に connect() してください。");
    const net = await state.provider.getNetwork();
    // 今が Optimism かどうか(onOptimism)と、名前・番号を返す
    return { onOptimism: net.chainId === OP_CHAIN_ID, name: net.name, chainId: net.chainId };
  }

  async function switchToOptimism() {
    if (!window.ethereum) throw new Error("MetaMask が見つかりません。");
    try {
      // まず「Optimism に切り替えて」とお願いする
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: OPTIMISM.chainId }],
      });
    } catch (e) {
      // エラーコード 4902 =「そのネットワークが未登録」→ 追加してから切り替える
      if (e.code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [OPTIMISM] });
      } else {
        throw e; // それ以外のエラーはそのまま投げる
      }
    }
  }

  // ============================================================
  //  残高 — ICHIGO をいくつ持っているか
  // ============================================================
  async function getBalance() {
    if (!state.token) throw new Error("先に connect() してください。");
    const raw = await state.token.balanceOf(state.account); // 内部表現(とても大きい整数)
    // formatUnits … 小数桁を考慮して人間が読める数値に直す(例: 42060)
    const formatted = Number(ethers.formatUnits(raw, state.decimals));
    return { raw, formatted };
  }

  // ============================================================
  //  課金(送金) — ここが“お金を払う”中心の処理
  // ============================================================
  // amount   … ICHIGO の枚数(人間が読む単位)
  // onStatus … 進捗メッセージを受け取る関数(画面表示に使う。省略可)
  async function pay(amount, onStatus) {
    if (!state.token) throw new Error("先に connect() してください。");
    const net = await checkNetwork();
    if (!net.onOptimism) throw new Error("ネットワークが Optimism ではありません。切り替えてください。");

    // parseUnits … 人間の数値を、送金に使う内部表現(整数)へ変換
    const value = ethers.parseUnits(String(amount), state.decimals);
    const bal = await state.token.balanceOf(state.account);
    if (bal < value) throw new Error(`ICHIGO が足りません(必要: ${amount})。`);

    onStatus?.("MetaMask で送金を承認してください…");
    const tx = await state.token.transfer(GAME_WALLET, value); // 送金を送信(MetaMaskが承認を求める)
    onStatus?.("送金を確認中…（数秒）");
    const receipt = await tx.wait(); // ブロックチェーンに“確定”するまで待つ(ここが完了で課金成立)
    onStatus?.("課金成功!");
    // 取引ハッシュと、確認用サイトのリンクを返す
    return { hash: tx.hash, receipt, explorer: `${OPTIMISM.blockExplorerUrls[0]}/tx/${tx.hash}` };
  }

  // ============================================================
  //  保存(おまけ) — アカウント別に localStorage へ小さなデータを出し入れ
  // ============================================================
  function nsKey(key) {
    const who = state.account ? state.account.toLowerCase() : "anon";
    return `ichigo_${key}_${who}`; // 例: ichigo_clears_0xabc...
  }
  function save(key, val) { localStorage.setItem(nsKey(key), JSON.stringify(val)); }
  function load(key, fallback = null) {
    try { const v = localStorage.getItem(nsKey(key)); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  }

  // ============================================================
  //  公開 — 外から使える窓口(window.IchigoPay)
  // ============================================================
  window.IchigoPay = {
    config: { TOKEN_ADDR, GAME_WALLET, OP_CHAIN_ID, OPTIMISM, ERC20_ABI },
    state,
    connect, onChange, checkNetwork, switchToOptimism, getBalance, pay, save, load,
    get account() { return state.account; },   // 今のアドレス
    get connected() { return state.connected; }, // 接続済みか
  };
})();
