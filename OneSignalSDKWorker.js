// =========================================================
// 📲 バックグラウンドでの「②端末着信(RECEIVED)」「③通知タップ(OPENED)」自動記録
// =========================================================
const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbywoTJGglKIMRd0UCYhECGQRnopD5lLb_oSfE1OhbKnwJNA4f4vbP7_LHhxFi9ANUd7-A/exec";

// IndexedDBから保存済みの社員ID（tss_emp_id）を取得する関数
function getEmpIdFromIndexedDB() {
  return new Promise(function(resolve) {
    try {
      const req = indexedDB.open("tss_portal_push_db", 1);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
      };
      req.onsuccess = function(e) {
        try {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("kv")) return resolve("");
          const tx = db.transaction("kv", "readonly");
          const getReq = tx.objectStore("kv").get("tss_emp_id");
          getReq.onsuccess = function() { resolve(getReq.result || ""); };
          getReq.onerror = function() { resolve(""); };
        } catch (err) {
          resolve("");
        }
      };
      req.onerror = function() { resolve(""); };
    } catch (e) {
      resolve("");
    }
  });
}

// 通知データから安否ID（anpiId）を取り出す補助関数
function extractAnpiIdFromEventData(obj) {
  if (!obj || typeof obj !== "object") return "";
  if (obj.anpiId) return String(obj.anpiId);
  if (obj.custom && obj.custom.a && obj.custom.a.anpiId) return String(obj.custom.a.anpiId);
  if (obj.data && obj.data.anpiId) return String(obj.data.anpiId);
  if (obj.additionalData && obj.additionalData.anpiId) return String(obj.additionalData.anpiId);
  return "";
}

// GASへ着信・タップイベントを送信する関数
async function reportPushEventToGas(eventType, anpiId) {
  try {
    const empId = await getEmpIdFromIndexedDB();
    if (!empId) return;

    const payload = JSON.stringify({
      action: "ANPI_PUSH_TRACK",
      userId: String(empId).trim(),
      eventType: eventType, // "RECEIVED" または "OPENED"
      anpiId: anpiId || ""
    });

    await fetch(GAS_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload
    });
  } catch (e) {}
}

// 1. スマホにプッシュ通知が届いた瞬間（②端末着信日時を記録）
self.addEventListener("push", function(event) {
  let anpiId = "";
  try {
    if (event.data) {
      const json = event.data.json();
      anpiId = extractAnpiIdFromEventData(json);
    }
  } catch (e) {}
  event.waitUntil(reportPushEventToGas("RECEIVED", anpiId));
});

// 2. スマホの通知バナーをタップした瞬間（③ログイン前の通知タップ日時を記録）
self.addEventListener("notificationclick", function(event) {
  let anpiId = "";
  try {
    if (event.notification && event.notification.data) {
      anpiId = extractAnpiIdFromEventData(event.notification.data);
    }
  } catch (e) {}
  event.waitUntil(reportPushEventToGas("OPENED", anpiId));
});

// OneSignal公式Service Worker本体の読み込み
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
