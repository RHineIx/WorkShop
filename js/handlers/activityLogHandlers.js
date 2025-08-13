// js/handlers/activityLogHandlers.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { showConfirmationModal } from "../ui_helpers.js";
import { showStatus, hideSyncStatus } from "../notifications.js";
import { renderAuditLog } from "../renderer.js";

async function handleLogCleanup() {
  if (!appState.auditLog || appState.auditLog.length === 0) {
    showStatus("سجل النشاطات فارغ بالفعل.", "success");
    return;
  }

  const confirmed = await showConfirmationModal({
    title: "تأكيد تنظيف السجل",
    message:
      "هل أنت متأكد من رغبتك في حذف جميع إدخالات سجل النشاطات نهائياً؟ لا يمكن التراجع عن هذا الإجراء.",
    confirmText: "نعم, حذف الكل",
  });

  if (!confirmed) return;

  showStatus("جاري تنظيف السجل...", "syncing");
  const originalLog = [...appState.auditLog];
  try {
    appState.auditLog = [];
    await api.saveAuditLog();
    saveLocalData();
    if (appState.currentView === "activity-log") {
      renderAuditLog();
    }
    hideSyncStatus();
    showStatus("تم تنظيف سجل النشاطات بنجاح!", "success");
  } catch (error) {
    appState.auditLog = originalLog; // Rollback on failure
    hideSyncStatus();
    showStatus(`فشل تنظيف السجل: ${error.message}`, "error", {
      duration: 5000,
    });
  }
}

export function setupActivityLogListeners(elements) {
  if (elements.clearLogBtn) {
    elements.clearLogBtn.addEventListener("click", handleLogCleanup);
  }
}