/*
 * ichigo-pay.js — ICHIGO(Optimism ERC-20)の課金共通モジュール
 * index.html のガチャで実証済みの決済処理を切り出したもの。
 * 使い方: <script src="ethers CDN"></script> の後にこのファイルを読み込むと
 *         グローバルに window.IchigoPay が生えます。
 *
 *   await IchigoPay.connect();          // MetaMask接続
 *   await IchigoPay.switchToOptimism(); // Optimismへ切替
 *   await IchigoPay.pay(100);           // 100 ICHIGO を集約先へ送金(課金)
 *   const { formatted } = await IchigoPay.getBalance();
 */
(function () {
  "use strict";

  // ===== 設定 =====
  const TOKEN_ADDR  = "0x836700463Dce76D9Cc3CDf6F6EDF946312c01869"; // ICHIGO
  // 方法C: 課金はこの「集約用ウォレット(運営代表)」へ1回の送金で集める。
  // 運営2人の 5:5 精算は後でまとめて手動送金する(オンチェーン自動分配はしない=ガス節約)。
  // ★テスト中は自分のアドレスにしておくと ICHIGO が戻るのでガス代だけで検証できる。
  const GAME_WALLET = "0x0d9Ff88703b8bcB42ca7e526246C2dcf9A4aEdb9";
  const OP_CHAIN_ID = 10n;
  const OPTIMISM = {
    chainId: "0xa", chainName: "OP Mainnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.optimism.io"],
    blockExplorerUrls: ["https://optimistic.etherscan.io"],
  };
  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function transfer(address to, uint256 amount) returns (bool)",
  ];

  // ===== 内部状態 =====
  const state = {
    provider: null, signer: null, account: null, token: null, decimals: 18n, connected: false,
  };

  function ensureEthers() {
    if (typeof window.ethers === "undefined") {
      throw new Error("ethers.js が読み込まれていません。<script> の順番を確認してください。");
    }
  }

  // ===== 接続 =====
  async function connect() {
    ensureEthers();
    if (!window.ethereum) {
      throw new Error("MetaMask が見つかりません。http://localhost で開いているか確認してください。");
    }
    state.provider = new ethers.BrowserProvider(window.ethereum);
    await state.provider.send("eth_requestAccounts", []);
    state.signer = await state.provider.getSigner();
    state.account = await state.signer.getAddress();
    state.token = new ethers.Contract(TOKEN_ADDR, ERC20_ABI, state.signer);
    state.decimals = await state.token.decimals().catch(() => 18n);
    state.connected = true;
    return state.account;
  }

  // アカウント/ネットワーク変更を購読(デフォルトはページリロード)
  function onChange(handler) {
    if (!window.ethereum) return;
    const cb = handler || (() => location.reload());
    window.ethereum.on?.("chainChanged", cb);
    window.ethereum.on?.("accountsChanged", cb);
  }

  // ===== ネットワーク =====
  async function checkNetwork() {
    if (!state.provider) throw new Error("先に connect() してください。");
    const net = await state.provider.getNetwork();
    return { onOptimism: net.chainId === OP_CHAIN_ID, name: net.name, chainId: net.chainId };
  }

  async function switchToOptimism() {
    if (!window.ethereum) throw new Error("MetaMask が見つかりません。");
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: OPTIMISM.chainId }],
      });
    } catch (e) {
      if (e.code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [OPTIMISM] });
      } else {
        throw e;
      }
    }
  }

  // ===== 残高 =====
  async function getBalance() {
    if (!state.token) throw new Error("先に connect() してください。");
    const raw = await state.token.balanceOf(state.account);
    const formatted = Number(ethers.formatUnits(raw, state.decimals));
    return { raw, formatted };
  }

  // ===== 課金(送金) =====
  // amount: ICHIGO の枚数(人間が読む単位)。送金tx確定まで待って receipt を返す。
  async function pay(amount, onStatus) {
    if (!state.token) throw new Error("先に connect() してください。");
    const net = await checkNetwork();
    if (!net.onOptimism) throw new Error("ネットワークが Optimism ではありません。切り替えてください。");

    const value = ethers.parseUnits(String(amount), state.decimals);
    const bal = await state.token.balanceOf(state.account);
    if (bal < value) throw new Error(`ICHIGO が足りません(必要: ${amount})。`);

    onStatus?.("MetaMask で送金を承認してください…");
    const tx = await state.token.transfer(GAME_WALLET, value);
    onStatus?.("送金を確認中…（数秒）");
    const receipt = await tx.wait();
    onStatus?.("課金成功!");
    return { hash: tx.hash, receipt, explorer: `${OPTIMISM.blockExplorerUrls[0]}/tx/${tx.hash}` };
  }

  // ===== 保存(アカウント別に名前空間化した localStorage) =====
  function nsKey(key) {
    const who = state.account ? state.account.toLowerCase() : "anon";
    return `ichigo_${key}_${who}`;
  }
  function save(key, val) { localStorage.setItem(nsKey(key), JSON.stringify(val)); }
  function load(key, fallback = null) {
    try { const v = localStorage.getItem(nsKey(key)); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  }

  // ===== 公開 =====
  window.IchigoPay = {
    config: { TOKEN_ADDR, GAME_WALLET, OP_CHAIN_ID, OPTIMISM, ERC20_ABI },
    state,
    connect, onChange, checkNetwork, switchToOptimism, getBalance, pay, save, load,
    get account() { return state.account; },
    get connected() { return state.connected; },
  };
})();
