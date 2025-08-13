// js/notifications.js
import { elements } from "./dom.js";

const ICONS = {
  success: "material-symbols:check-circle",
  error: "material-symbols:error",
  syncing: "material-symbols:sync",
  info: "material-symbols:info",
  warning: "material-symbols:warning-rounded",
};

export const hideSyncStatus = () => {
  const syncToasts =
    elements.toastContainer.querySelectorAll(".toast--syncing");
  syncToasts.forEach(toast => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 500);
  });
};

export const showStatus = (message, type, options = {}) => {
  const { duration = 4000, showRefreshButton = false } = options;
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  const iconName = ICONS[type] || "info";

  const icon = document.createElement("iconify-icon");
  icon.className = "toast__icon";
  icon.setAttribute("icon", iconName);
  toast.appendChild(icon);

  const messageSpan = document.createElement("span");
  messageSpan.textContent = message;
  toast.appendChild(messageSpan);

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
    const transitionDuration = 500;
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        if (toast.parentElement) {
          toast.remove();
        }
      }, transitionDuration);
    }, duration);
  }
};
