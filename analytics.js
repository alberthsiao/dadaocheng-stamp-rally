/* ══════════════════════════════════════════════════════════
   匿名使用統計
   目的：讓主辦單位知道「有多少人在用、哪些店被走訪、多少人完成彩虹任務」，
        這些是紙本集章永遠算不出來的數字。

   設計原則（改動前請先讀）：
   1. 只送匿名聚合用的欄位，絕不送：姓名、手機、精確座標、店家筆記內容。
   2. cid 是隨機字串，只用來區分「不同裝置」以估算人數，無法反查任何人。
   3. 使用者可一鍵關閉，關閉後完全不送。
   4. 端點沒設定時整組停用，本機開發不會亂送資料。
   5. 送失敗一律吞掉 —— 統計壞掉絕不能影響逛街功能。
   ══════════════════════════════════════════════════════════ */

/** 部署 Apps Script 後把網址填進來；留空 = 停用統計 */
const ANALYTICS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwbS-1OXpYBiWcXDRJsUdn5h_JdR9FCVav_skBj-dDyNLPSDmgPjUeq4l26L2hbpgxxzg/exec';

const ANALYTICS_OPTOUT_KEY = 'yongle-analytics-off';
const ANALYTICS_CID_KEY = 'yongle-cid';
const ANALYTICS_NOTICE_KEY = 'yongle-analytics-noticed';

const analytics = {
  enabled() {
    if (!ANALYTICS_ENDPOINT) return false;
    try {
      return localStorage.getItem(ANALYTICS_OPTOUT_KEY) !== '1';
    } catch {
      return false;
    }
  },

  /** 隨機裝置識別碼，只為了算「幾個人用過」，不含任何個資 */
  cid() {
    try {
      let id = localStorage.getItem(ANALYTICS_CID_KEY);
      if (!id) {
        id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
          .replace(/-/g, '')
          .slice(0, 16);
        localStorage.setItem(ANALYTICS_CID_KEY, id);
      }
      return id;
    } catch {
      return 'anon';
    }
  },

  send(event, extra = {}) {
    if (!this.enabled()) return;
    const payload = JSON.stringify({
      v: 1,
      cid: this.cid(),
      ev: event,
      ts: Date.now(),
      ...extra,
    });
    try {
      // sendBeacon 用 text/plain 屬於 simple request，不會觸發 CORS preflight；
      // 也不阻塞畫面、頁面關掉仍會送出
      const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
      if (!navigator.sendBeacon || !navigator.sendBeacon(ANALYTICS_ENDPOINT, blob)) {
        fetch(ANALYTICS_ENDPOINT, {
          method: 'POST',
          mode: 'no-cors',
          keepalive: true,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: payload,
        }).catch(() => {});
      }
    } catch {
      /* 統計失敗絕不影響主功能 */
    }
  },

  setOptOut(off) {
    try {
      if (off) localStorage.setItem(ANALYTICS_OPTOUT_KEY, '1');
      else localStorage.removeItem(ANALYTICS_OPTOUT_KEY);
    } catch { /* 無痕模式忽略 */ }
  },

  isOptedOut() {
    try {
      return localStorage.getItem(ANALYTICS_OPTOUT_KEY) === '1';
    } catch {
      return true;
    }
  },

  /** 首次啟用時要讓使用者知道，之後不再重複打擾 */
  shouldNotice() {
    if (!ANALYTICS_ENDPOINT) return false;
    try {
      return localStorage.getItem(ANALYTICS_NOTICE_KEY) !== '1';
    } catch {
      return false;
    }
  },

  markNoticed() {
    try { localStorage.setItem(ANALYTICS_NOTICE_KEY, '1'); } catch { /* 忽略 */ }
  },
};
