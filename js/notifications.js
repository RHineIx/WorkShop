// js/notifications.js
import { elements } from "./dom.js";

const ICONS = {
  success: "material-symbols:check-circle",
  error: "material-symbols:error",
  syncing: "material-symbols:sync",
  info: "material-symbols:info",
  warning: "material-symbols:warning-rounded",
};

function updateToastPositions() {
  const toasts = elements.toastContainer.querySelectorAll(".toast");
  if (elements.toastContainer.classList.contains("stacked")) {
    toasts.forEach(toast => {
      toast.style.transform = '';
      toast.style.opacity = '';
      toast.style.zIndex = '';
    });
    return;
  }

  toasts.forEach((toast, index) => {
    const reverseIndex = toasts.length - 1 - index;
    if (reverseIndex === 0) { // Top toast
      toast.style.transform = 'translateY(0) scale(1)';
      toast.style.zIndex = '4';
    } else if (reverseIndex === 1) { // Second toast
      toast.style.transform = 'translateY(12px) scale(0.96)';
      toast.style.zIndex = '3';
    } else if (reverseIndex === 2) { // Third toast
      toast.style.transform = 'translateY(24px) scale(0.92)';
      toast.style.zIndex = '2';
    } else { // The rest
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(30px) scale(0.9)';
      toast.style.zIndex = '1';
    }
  });
}

elements.toastContainer.addEventListener('click', (e) => {
    if (e.target.closest('.toast__close-btn')) {
        return; // Let the button's own handler work
    }
    const toasts = elements.toastContainer.querySelectorAll(".toast");
    if (toasts.length > 1) {
        elements.toastContainer.classList.toggle('stacked');
        updateToastPositions();
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
    updateToastPositions();
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
      updateToastPositions();
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