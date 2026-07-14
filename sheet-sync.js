(function () {
  const weightKey = "dialysisWeightRecords";
  const fluidKey = "dialysisFluidRecords";
  const urlKey = "dialysisSheetSyncUrl";
  const writeTokenKey = "dialysisSheetWriteToken";
  const readTokenKey = "dialysisSheetReadToken";
  const syncDelayMs = 900;

  let timer = null;

  injectPanel();
  patchLocalStorage();

  function injectPanel() {
    const fluidPage = document.querySelector("#fluidPage");
    if (!fluidPage || document.querySelector("#sheetSyncPanel")) return;

    const panel = document.createElement("section");
    panel.id = "sheetSyncPanel";
    panel.className = "panel sheet-sync-panel";
    panel.innerHTML = `
      <div class="section-head">
        <div>
          <h2>Googleスプレッドシート連携</h2>
          <p class="subtext">透析記録と飲水記録を、あとで別アプリから読める保存先へ送ります。</p>
        </div>
        <button id="sheetSyncNow" class="secondary" type="button">今すぐ同期</button>
      </div>
      <label><span>GAS WebアプリURL</span><input id="sheetSyncUrl" type="url" placeholder="https://script.google.com/..." /></label>
      <div class="grid-2">
        <label><span>書き込みトークン</span><input id="sheetWriteToken" type="password" autocomplete="off" /></label>
        <label><span>読み取りトークン</span><input id="sheetReadToken" type="password" autocomplete="off" /></label>
      </div>
      <div class="sheet-sync-actions">
        <button id="sheetSyncSave" class="primary" type="button">設定を保存</button>
        <span id="sheetSyncStatus" class="sheet-sync-status">未設定</span>
      </div>
    `;

    const layout = fluidPage.querySelector(".layout");
    fluidPage.insertBefore(panel, layout || null);

    const urlInput = document.querySelector("#sheetSyncUrl");
    const writeTokenInput = document.querySelector("#sheetWriteToken");
    const readTokenInput = document.querySelector("#sheetReadToken");
    const saveButton = document.querySelector("#sheetSyncSave");
    const syncButton = document.querySelector("#sheetSyncNow");

    urlInput.value = localStorage.getItem(urlKey) || "";
    writeTokenInput.value = localStorage.getItem(writeTokenKey) || "";
    readTokenInput.value = localStorage.getItem(readTokenKey) || "";
    setStatus(urlInput.value ? "設定済み" : "GAS URLを入れると同期できます");

    saveButton.addEventListener("click", () => {
      localStorage.setItem(urlKey, urlInput.value.trim());
      localStorage.setItem(writeTokenKey, writeTokenInput.value.trim());
      localStorage.setItem(readTokenKey, readTokenInput.value.trim());
      syncNow();
    });

    syncButton.addEventListener("click", syncNow);
  }

  function patchLocalStorage() {
    if (window.__dialysisSheetSyncPatched) return;
    window.__dialysisSheetSyncPatched = true;

    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      originalSetItem(key, value);
      if (key === weightKey || key === fluidKey) scheduleSync();
    };
  }

  function scheduleSync() {
    if (!localStorage.getItem(urlKey)) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(syncNow, syncDelayMs);
  }

  async function syncNow() {
    const url = localStorage.getItem(urlKey) || "";
    if (!url) {
      setStatus("GAS URLが未設定です");
      return;
    }

    const payload = {
      action: "syncAll",
      token: localStorage.getItem(writeTokenKey) || "",
      dialysisRecords: normalizeDialysis(loadJson(weightKey)),
      fluidRecords: normalizeFluid(loadJson(fluidKey)),
      sentAt: new Date().toISOString(),
    };

    setStatus("同期を送信中...");

    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      const today = localToday();
      const localTotal = payload.fluidRecords
        .filter((record) => record.date === today)
        .reduce((sum, record) => sum + record.amountMl, 0);

      try {
        const result = await readFluidTotal(url, today);
        if (Number(result.totalMl) === localTotal) {
          setStatus(`同期済み: 今日の飲水 ${localTotal} ml`);
        } else {
          setStatus("送信済み: 数分後にもう一度同期してください");
        }
      } catch {
        setStatus("送信済み: 読み取り確認は未完了です");
      }
    } catch {
      setStatus("同期できませんでした。通信状態を確認してください");
    }
  }

  function readFluidTotal(url, date) {
    return new Promise((resolve, reject) => {
      const callbackName = `dialysisSheetSync_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const script = document.createElement("script");
      const cleanup = () => {
        delete window[callbackName];
        script.remove();
      };

      window[callbackName] = (data) => {
        cleanup();
        resolve(data || {});
      };

      const query = new URLSearchParams({
        type: "fluidTotal",
        date,
        token: localStorage.getItem(readTokenKey) || "",
        callback: callbackName,
      });

      script.onerror = () => {
        cleanup();
        reject(new Error("read failed"));
      };
      script.src = `${url}${url.includes("?") ? "&" : "?"}${query.toString()}`;
      document.body.appendChild(script);
    });
  }

  function normalizeDialysis(records) {
    return records.map((record) => ({
      recordId: String(record.id || ""),
      date: String(record.date || ""),
      dryWeightKg: toNumber(record.dryWeight),
      maxRemovalKg: toNumber(record.maxRemoval),
      preWeightKg: toNumber(record.preWeight),
      postWeightKg: toNumber(record.postWeight),
      note: String(record.note || ""),
      updatedAt: String(record.updatedAt || record.createdAt || new Date().toISOString()),
    })).filter((record) => record.recordId && record.date);
  }

  function normalizeFluid(records) {
    return records.map((record) => {
      const createdAt = record.createdAt || record.updatedAt || new Date().toISOString();
      return {
        recordId: String(record.id || ""),
        date: String(record.date || localToday()),
        time: String(record.time || localTime(createdAt)),
        amountMl: Math.round(toNumber(record.amount)),
        note: String(record.note || ""),
        updatedAt: String(record.updatedAt || createdAt),
      };
    }).filter((record) => record.recordId && record.date && record.amountMl > 0);
  }

  function loadJson(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function toNumber(value) {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  }

  function localToday() {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function localTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "00:00";
    return [
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
    ].join(":");
  }

  function setStatus(message) {
    const status = document.querySelector("#sheetSyncStatus");
    if (status) status.textContent = message;
  }
})();
