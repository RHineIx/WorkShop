// js/notifications.js
import { elements } from "./dom.js";

const ICONS = {
  success: "material-symbols:check-circle",
  error: "material-symbols:error",
  syncing: "material-symbols:sync",
  info: "material-symbols:info",
  warning: "material-symbols:warning-rounded",
};

elements.toastContainer.addEventListener('click', (e) => {
    if (e.target.closest('.toast__close-btn')) {
        return; // Let the button's own handler work
    }
    const toasts = elements.toastContainer.querySelectorAll(".toast");
    if (toasts.length > 1) {
        elements.toastContainer.classList.toggle('stacked');
    }
});
export const showStatus = (message, type, options = {}) => {
  const { duration = 4000, showRefreshButton = false } = options;
  const toastId = `toast-${Date.now()}-${Math.random()}`;
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.id = toastId;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const icon = document.createElement("iconify-icon");
  icon.className = "toast__icon";
  icon.setAttribute("icon", ICONS[type] || "info");
  toast.appendChild(icon);
  const messageSpan = document.createElement("span");
  messageSpan.className = "toast__message";
  messageSpan.textContent = message;
  toast.appendChild(messageSpan);

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast__close-btn";
  closeBtn.setAttribute("aria-label", "إغلاق");
  closeBtn.innerHTML = `<iconify-icon icon="material-symbols:close-rounded"></iconify-icon>`;
  closeBtn.onclick = () => hideStatus(toastId);
  toast.appendChild(closeBtn);

  if (showRefreshButton) {
    const refreshButton = document.createElement("button");
    refreshButton.textContent = "تحديث";
    refreshButton.className = "status-refresh-btn";
    refreshButton.onclick = () => location.reload();
    refreshButton.style.marginLeft = "auto";
    toast.appendChild(refreshButton);
  }

  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);
  if (duration > 0 && type !== "syncing" && !showRefreshButton) {
    setTimeout(() => {
      hideStatus(toastId);
    }, duration);
  }
  
  return toastId;
};

export const hideStatus = (toastId) => {
  const toast = document.getElementById(toastId);
  if (toast) {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
      // If container becomes empty, reset to layered view
      if (elements.toastContainer.children.length === 0) {
        elements.toastContainer.classList.remove('stacked');
      }
    }, 300);
  }
};

export const hideSyncStatus = () => {
  const syncToasts =
    elements.toastContainer.querySelectorAll(".toast--syncing");
  syncToasts.forEach(toast => {
    hideStatus(toast.id);
  });
};