// js/handlers/activityLogHandlers.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { showConfirmationModal } from "../ui_helpers.js";
import { showStatus, updateStatus } from "../notifications.js";
import { renderAuditLog } from "../renderer.js";
import { ConflictError } from "../api.js";

async function handleLogCleanup() {
  if (!appState.auditLog || appState.auditLog.length === 0) {
    showStatus("سجل النشاطات فارغ بالفعل.", "info");
    return;
  }

  const confirmed = await showConfirmationModal({
    title: "تأكيد تنظيف السجل",
    message:
      "هل أنت متأكد من رغبتك في حذف جميع إدخالات سجل النشاطات نهائياً؟ لا يمكن التراجع عن هذا الإجراء.",
    confirmText: "نعم, حذف الكل",
  });
  if (!confirmed) return;

  const originalLog = JSON.parse(JSON.stringify(appState.auditLog));
  const originalLogFileSha = appState.auditLogFileSha;

  appState.auditLog = [];
  saveLocalData();
  if (appState.currentView === "activity-log") {
    renderAuditLog();
  }
  showStatus("تم تنظيف السجل محليًا.", "success", { duration: 2000 });

  const syncToastId = showStatus("جاري مزامنة السجل...", "syncing");
  try {
    const { sha: latestSha } = await api.fetchAuditLog();
    if (latestSha !== originalLogFileSha) {
      throw new ConflictError("Audit log was updated elsewhere.");
    }
    await api.saveAuditLog();
    updateStatus(syncToastId, "تمت مزامنة السجل بنجاح!", "success");
  } catch (error) {
    console.error("Log cleanup sync failed, rolling back:", error);
    appState.auditLog = originalLog; 
    saveLocalData();
    if (appState.currentView === "activity-log") {
      renderAuditLog();
    }
    updateStatus(syncToastId, "فشل المزامنة! تم استرجاع البيانات.", "error");
  }
}

export function setupActivityLogListeners(elements) {
  if (elements.clearLogBtn) {
    elements.clearLogBtn.addEventListener("click", handleLogCleanup);
  }

  // NEW: Add event listener for the filter dropdown
  if (elements.activityLogFilter) {
      elements.activityLogFilter.addEventListener('change', (e) => {
          appState.activityLogFilter = e.target.value;
          renderAuditLog();
      });
  }
      }
