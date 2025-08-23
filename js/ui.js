// js/ui.js
import { appState } from "./state.js";
import { fetchImageWithAuth } from "./api.js";
import { elements } from "./dom.js";
import {
  filterAndRenderItems,
  renderDashboard,
  renderAuditLog,
} from "./renderer.js";
import { showStatus } from "./notifications.js";
import { pushState } from "./navigation.js";

let countdownInterval = null;

export { elements };
export function displayVersionInfo(versionData) {
  if (versionData && elements.appVersionDisplay) {
    const { hash, branch } = versionData;
    elements.appVersionDisplay.textContent = `الإصدار: ${hash} - الفرع (${branch})`;
  }
}

export function updateRateLimitDisplay() {
  const { limit, remaining, reset } = appState.rateLimit;
  const indicator = document.querySelector(".rate-limit-indicator");
  if (limit === null || remaining === null) {
    indicator.classList.remove("visible", "high", "medium", "low");
    if (elements.rateLimitDisplay) elements.rateLimitDisplay.textContent = "";
    return;
  }

  indicator.classList.add("visible");
  const percentage = (remaining / limit) * 100;

  indicator.classList.remove("high", "medium", "low");
  if (percentage > 50) {
    indicator.classList.add("high");
  } else if (percentage > 10) {
    indicator.classList.add("medium");
  } else {
    indicator.classList.add("low");
  }

  const updateDisplay = () => {
    const now = Math.floor(Date.now() / 1000);
    const secondsUntilReset = reset - now;
    if (secondsUntilReset <= 0) {
      elements.rateLimitDisplay.textContent = `${remaining}/${limit} طلبات متبقية.`;
      clearInterval(countdownInterval);
    } else {
      const minutes = Math.floor(secondsUntilReset / 60);
      const seconds = secondsUntilReset % 60;
      elements.rateLimitDisplay.textContent = `${remaining}/${limit} طلبات متبقية | إعادة التعيين بعد ${minutes}د ${seconds}ث`;
    }
  };
  clearInterval(countdownInterval);
  updateDisplay();
  countdownInterval = setInterval(updateDisplay, 1000);
}

function handleModalClose(event) {
  const closedDialog = event.target;
  appState.modalStack = appState.modalStack.filter(d => d !== closedDialog);
  if (appState.modalStack.length === 0) {
    const scrollY = appState.scrollPosition;
    document.body.classList.remove("body-scroll-locked");
    document.body.style.top = "";
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, scrollY);
    document.documentElement.style.scrollBehavior = "";

    document.body.appendChild(elements.toastContainer);
  } else {
    const topModal = appState.modalStack[appState.modalStack.length - 1];
    topModal.appendChild(elements.toastContainer);
  }
}

export function openModal(dialogElement) {
  if (!dialogElement) return;
  if (appState.modalStack.length === 0) {
    appState.scrollPosition = window.scrollY;
    document.body.style.top = `-${appState.scrollPosition}px`;
    document.body.classList.add("body-scroll-locked");
  }
  pushState();
  dialogElement.addEventListener("close", handleModalClose, { once: true });
  appState.modalStack.push(dialogElement);
  dialogElement.appendChild(elements.toastContainer);
  dialogElement.showModal();
}

export function toggleView(viewToShow) {
  if (appState.currentView !== "inventory" && viewToShow === "inventory") {
    // This case is handled by the back button popstate, so we don't push a new state.
  } else if (
    appState.currentView !== viewToShow &&
    viewToShow !== "inventory"
  ) {
    pushState();
  }

  appState.currentView = viewToShow;
  const isInventory = viewToShow === "inventory";
  const isDashboard = viewToShow === "dashboard";
  const isActivityLog = viewToShow === "activity-log";

  elements.inventoryViewContainer.classList.toggle("view-hidden", !isInventory);
  elements.dashboardViewContainer.classList.toggle("view-hidden", !isDashboard);
  elements.activityLogViewContainer.classList.toggle(
    "view-hidden",
    !isActivityLog
  );

  elements.inventoryToggleBtn.classList.remove("active-view-btn");
  elements.dashboardToggleBtn.classList.remove("active-view-btn");
  elements.activityLogToggleBtn.classList.remove("active-view-btn");
  if (isInventory) {
    elements.inventoryToggleBtn.classList.add("active-view-btn");
  } else if (isDashboard) {
    elements.dashboardToggleBtn.classList.add("active-view-btn");
    renderDashboard();
  } else if (isActivityLog) {
    elements.activityLogToggleBtn.classList.add("active-view-btn");
    renderAuditLog();
  }
}

export function setTheme(themeName, isInitialLoad = false) {
  const overlay = elements.themeTransitionOverlay;
  if (!overlay || document.body.classList.contains(`theme-${themeName}`)) {
    const icon = elements.themeToggleBtn.querySelector("iconify-icon");
    if (icon) {
      icon.setAttribute(
        "icon",
        themeName === "dark"
          ? "material-symbols:dark-mode-outline-rounded"
          : "material-symbols:light-mode-outline-rounded"
      );
    }
    return;
  }

  const applyTheme = () => {
    document.body.className = `theme-${themeName}`;
    const icon = elements.themeToggleBtn.querySelector("iconify-icon");
    if (icon) {
      icon.setAttribute(
        "icon",
        themeName === "dark"
          ? "material-symbols:dark-mode-outline-rounded"
          : "material-symbols:light-mode-outline-rounded"
      );
    }
    localStorage.setItem("inventoryAppTheme", themeName);
  };

  if (isInitialLoad || !document.startViewTransition) {
    applyTheme();
    return;
  }

  const transition = document.startViewTransition(() => {
    applyTheme();
  });
}

export function updateCurrencyDisplay() {
  const isIQD = appState.activeCurrency === "IQD";
  elements.currencyToggleBtn.textContent = isIQD ? "د.ع" : "$";
  switch (appState.currentView) {
    case "inventory":
      filterAndRenderItems();
      if (elements.detailsModal.open && appState.currentItemId) {
        openDetailsModal(appState.currentItemId);
      }
      break;
    case "dashboard":
      renderDashboard();
      break;
    case "activity-log":
      renderAuditLog();
      break;
  }
}

export function updateSaleTotal() {
  const quantity = parseInt(elements.saleQuantityInput.value, 10) || 0;
  const unitPrice =
    parseFloat(document.getElementById("sale-price").value) || 0;
  const totalPrice = quantity * unitPrice;
  const symbol = appState.activeCurrency === "IQD" ? "د.ع" : "$";
  elements.saleTotalPrice.textContent = `${totalPrice.toLocaleString()} ${symbol}`;
}

export function openDetailsModal(itemId) {
  const item = appState.inventory.items.find(i => i.id === itemId);
  if (!item) return;
  appState.currentItemId = itemId;
  appState.itemStateBeforeEdit = JSON.parse(JSON.stringify(item));
  elements.detailsName.textContent = item.name;
  elements.detailsSku.textContent = `SKU: ${item.sku || "N/A"}`;
  elements.detailsQuantityValue.value = item.quantity;
  elements.detailsCostIqd.textContent = `${(
    item.costPriceIqd || 0
  ).toLocaleString()} د.ع`;
  elements.detailsSellIqd.textContent = `${(
    item.sellPriceIqd || 0
  ).toLocaleString()} د.ع`;
  elements.detailsCostUsd.textContent = `$${(
    item.costPriceUsd || 0
  ).toLocaleString()}`;
  elements.detailsSellUsd.textContent = `$${(
    item.sellPriceUsd || 0
  ).toLocaleString()}`;
  elements.detailsNotesContent.textContent = item.notes || "لا توجد ملاحظات.";
  elements.detailsCategoryTags.innerHTML = "";
  if (item.categories && item.categories.length > 0) {
    item.categories.forEach(category => {
      const tag = document.createElement("span");
      tag.className = "details-category-tag";
      tag.textContent = category;
      elements.detailsCategoryTags.appendChild(tag);
    });
  }

  const pnContainer = elements.detailsPnGridContainer;
  pnContainer.innerHTML = "";
  pnContainer.classList.add("view-hidden");
  const handleTagClick = tagElement => {
    if (tagElement.classList.contains("copied")) return;
    const originalText = tagElement.textContent;
    const textToCopy = originalText.trim();
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        tagElement.innerHTML = `<span class="copied-feedback">تم النسخ!</span>`;
        tagElement.classList.add("copied");

        setTimeout(() => {
          tagElement.textContent = originalText;
          tagElement.classList.remove("copied");
        }, 1500);
      })
      .catch(() => {
        showStatus("فشل النسخ إلى الحافظة", "error");
      });
  };
  if (item.oemPartNumber || item.compatiblePartNumber) {
    const pnGrid = document.createElement("div");
    pnGrid.className = "details-pn-grid";
    if (item.oemPartNumber) {
      const label = document.createElement("div");
      label.className = "pn-grid-label";
      label.textContent = "رمز OEM";
      pnGrid.appendChild(label);
      const valueContainer = document.createElement("div");
      valueContainer.className = "pn-grid-value";
      const tag = document.createElement("span");
      tag.className = "pn-copy-tag";
      tag.textContent = item.oemPartNumber;
      tag.addEventListener("click", () => handleTagClick(tag));
      valueContainer.appendChild(tag);
      pnGrid.appendChild(valueContainer);
    }

    if (item.compatiblePartNumber) {
      const label = document.createElement("div");
      label.className = "pn-grid-label";
      label.textContent = "الرموز المتوافقة";
      pnGrid.appendChild(label);

      const valueContainer = document.createElement("div");
      valueContainer.className = "pn-grid-value";
      const compatiblePns = item.compatiblePartNumber
        .split(",")
        .map(pn => pn.trim())
        .filter(Boolean);
      compatiblePns.forEach(pn => {
        const tag = document.createElement("span");
        tag.className = "pn-copy-tag";
        tag.textContent = pn;
        tag.addEventListener("click", () => handleTagClick(tag));
        valueContainer.appendChild(tag);
      });
      pnGrid.appendChild(valueContainer);
    }

    pnContainer.appendChild(pnGrid);
    pnContainer.classList.remove("view-hidden");
  }

  const supplier = appState.suppliers.find(s => s.id === item.supplierId);
  if (supplier) {
    elements.detailsSupplierName.textContent = supplier.name;
    elements.detailsSupplierPhone.textContent = supplier.phone
      ? supplier.phone
      : "لا يوجد";
    if (supplier.phone) {
      elements.detailsSupplierWhatsapp.href = `https://wa.me/${supplier.phone.replace(
        /[^0-9]/g,
        ""
      )}`;
      elements.detailsSupplierWhatsapp.style.display = "inline-flex";
    } else {
      elements.detailsSupplierWhatsapp.style.display = "none";
    }
    elements.supplierDetailsContainer.classList.remove("view-hidden");
  } else {
    elements.supplierDetailsContainer.classList.add("view-hidden");
  }

  if (item.imagePath) {
    elements.detailsImage.style.display = "block";
    elements.detailsImagePlaceholder.style.display = "none";
    elements.detailsImage.src = "";

    if (item.imagePath.startsWith("http")) {
      elements.detailsImage.src = item.imagePath;
    } else {
      elements.detailsImage.classList.add("skeleton");
      fetchImageWithAuth(item.imagePath).then(blobUrl => {
        if (blobUrl) {
          elements.detailsImage.src = blobUrl;
          elements.detailsImage.onload = () =>
            elements.detailsImage.classList.remove("skeleton");
        } else {
          elements.detailsImage.classList.remove("skeleton");
        }
      });
    }
  } else {
    elements.detailsImage.style.display = "none";
    elements.detailsImagePlaceholder.style.display = "flex";
  }

  openModal(elements.detailsModal);
}

export function updateBulkActionsBar() {
  const count = appState.selectedItemIds.size;
  if (count > 0) {
    elements.selectionCount.textContent = `تم تحديد ${count} عناصر`;
    elements.bulkActionsBar.classList.add("visible");
  } else {
    elements.bulkActionsBar.classList.remove("visible");
  }
}
