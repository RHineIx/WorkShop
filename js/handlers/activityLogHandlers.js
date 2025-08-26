// js/handlers/activityLogHandlers.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { saveLocalData } from "../app.js";
import { showConfirmationModal } from "../ui_helpers.js";
import { showStatus, hideStatus } from "../notifications.js";
import { renderAuditLog } from "../renderer.js";
import { openDetailsModal } from "../ui.js";

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

  appState.auditLog = [];
  saveLocalData();
  if (appState.currentView === "activity-log") {
    renderAuditLog();
  }

  const syncToastId = showStatus("جاري تنظيف السجل...", "syncing");
  try {
    await api.saveAuditLog();
    hideStatus(syncToastId);
    showStatus("تم تنظيف السجل ومزامنته بنجاح!", "success");
  } catch (error) {
    console.error("Log cleanup sync failed, rolling back:", error);
    appState.auditLog = originalLog; 
    saveLocalData();
    if (appState.currentView === "activity-log") {
      renderAuditLog();
    }
    hideStatus(syncToastId);
    showStatus("فشل المزامنة! تم استرجاع البيانات.", "error");
  }
}

export function setupActivityLogListeners(elements) {
  if (elements.clearLogBtn) {
    elements.clearLogBtn.addEventListener("click", handleLogCleanup);
  }

  if (elements.activityLogFilter) {
      elements.activityLogFilter.addEventListener('change', (e) => {
          appState.activityLogFilter = e.target.value;
          renderAuditLog();
      });
  }

  if (elements.auditLogList) {
    elements.auditLogList.addEventListener('click', e => {
      const logEntry = e.target.closest('.log-entry--clickable');
      if (!logEntry) return;

      const itemId = logEntry.dataset.id;
      if (itemId) {
        const itemExists = appState.inventory.items.some(i => i.id === itemId);
        if (itemExists) {
          openDetailsModal(itemId);
        } else {
          showStatus("لم يعد هذا المنتج موجودًا في المخزون.", "warning");
        }
      }
    });
  }
}