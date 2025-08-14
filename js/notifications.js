// js/notifications.js
import { elements } from "./dom.js";

const ICONS = {
  success: "material-symbols:check-circle",
  error: "material-symbols:error",
  syncing: "material-symbols:sync",
  info: "material-symbols:info",
  warning: "material-symbols:warning-rounded",
};

// Returns the ID of the created toast
export const showStatus = (message, type, options = {}) => {
  const { duration = 4000, showRefreshButton = false } = options;
  const toastId = `toast-${Date.now()}-${Math.random()}`;
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.id = toastId;

  const icon = document.createElement("iconify-icon");
  icon.className = "toast__icon";
  icon.setAttribute("icon", ICONS[type] || "info");
  toast.appendChild(icon);

  const messageSpan = document.createElement("span");
  messageSpan.className = "toast__message";
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
    }, 500);
  }
};

// NEW: Function to update an existing toast message and type
export const updateStatus = (toastId, message, type) => {
    const toast = document.getElementById(toastId);
    if (!toast) return;

    toast.className = `toast show toast--${type}`; // Update class for new style
    const icon = toast.querySelector("iconify-icon");
    if (icon) {
        icon.setAttribute("icon", ICONS[type] || "info");
    }
    const messageSpan = toast.querySelector(".toast__message");
    if (messageSpan) {
        messageSpan.textContent = message;
    }

    // Automatically hide the toast after a delay if it's a final state (success/error)
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            hideStatus(toastId);
        }, 4000);
    }
};


export const hideSyncStatus = () => {
  const syncToasts =
    elements.toastContainer.querySelectorAll(".toast--syncing");
  syncToasts.forEach(toast => {
    hideStatus(toast.id);
  });
};
