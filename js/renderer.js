// js/renderer.js
import { appState } from "./state.js";
import { fetchImageWithAuth } from "./api.js";
import { sanitizeHTML } from "./utils.js";
import { elements } from "./dom.js";

const ITEMS_PER_PAGE = 20;
const imageObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const imagePath = img.dataset.src;
        img.parentElement.classList.add("loading");
        fetchImageWithAuth(imagePath)
          .then(blobUrl => {
            if (blobUrl) {
              img.src = blobUrl;
              img.onload = () => img.parentElement.classList.remove("loading");
              img.onerror = () => {
                img.parentElement.classList.remove("loading");
                img.remove();
              };
            } else {
              img.parentElement.classList.remove("loading");
            }
          })
          .catch(() => img.parentElement.classList.remove("loading"));
        observer.unobserve(img);
      }
    });
  },
  { rootMargin: "0px 0px 200px 0px" }
);
const animationObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);
const loadMoreObserver = new IntersectionObserver(
  entries => {
    const entry = entries[0];
    if (entry.isIntersecting) {
      appState.visibleItemCount += ITEMS_PER_PAGE;
      filterAndRenderItems();
    }
  },
  { rootMargin: "0px 0px 400px 0px" }
);

/**
 * NEW: Helper function to get a unique list of all categories from the inventory.
 * @returns {string[]} An array of unique category strings.
 */
export function getAllUniqueCategories() {
  return [
    ...new Set(
      appState.inventory.items
        .flatMap(item => item.categories || [])
        .filter(Boolean)
    ),
  ].sort(); // Sort them alphabetically
}

function getFilteredItems() {
  let items = [...appState.inventory.items];
  if (appState.activeFilter === "low_stock") {
    items = items.filter(item => item.quantity <= item.alertLevel);
  }
  if (appState.selectedCategory && appState.selectedCategory !== "all") {
    items = items.filter(item =>
      (item.categories || []).includes(appState.selectedCategory)
    );
  }
  if (appState.searchTerm) {
    const searchTerms = appState.searchTerm
      .toLowerCase()
      .split(" ")
      .filter(term => term.trim() !== "");
    if (searchTerms.length > 0) {
      items = items.filter(item => {
        const searchableContent = [
          item.name,
          item.sku,
          item.notes,
          item.oemPartNumber,
          item.compatiblePartNumber,
          ...(item.categories || []),
        ]
          .join(" ")
          .toLowerCase();
        return searchTerms.every(term => searchableContent.includes(term));
      });
    }
  }

  switch (appState.currentSortOption) {
    case "name_asc":
      items.sort((a, b) => a.name.localeCompare(b.name, "ar"));
      break;
    case "quantity_asc":
      items.sort((a, b) => a.quantity - b.quantity);
      break;
    case "quantity_desc":
      items.sort((a, b) => b.quantity - a.quantity);
      break;
    case "date_desc":
      items.sort((a, b) => {
        const timeA = parseInt(a.id.split("_")[1], 10);
        const timeB = parseInt(b.id.split("_")[1], 10);
        return timeB - timeA;
      });
      break;
    default:
      break;
  }

  return items;
}

export function filterAndRenderItems(resetPagination = false) {
  if (resetPagination) {
    appState.visibleItemCount = ITEMS_PER_PAGE;
  }
  const itemsToRender = getFilteredItems();
  renderInventory(itemsToRender);
}

export function renderInventory(itemsToRender) {
  loadMoreObserver.disconnect();
  elements.inventoryGrid.innerHTML = "";
  if (appState.isSelectionModeActive) {
    elements.inventoryGrid.classList.add("selection-mode");
  } else {
    elements.inventoryGrid.classList.remove("selection-mode");
  }

  const itemsToDisplay = itemsToRender.slice(0, appState.visibleItemCount);

  if (itemsToDisplay.length === 0) {
    elements.inventoryGrid.innerHTML =
      '<p class="empty-state">لا توجد منتجات تطابق بحثك...</p>';
    updateStats();
    return;
  }

  const fragment = document.createDocumentFragment();
  const cardTemplate = elements.productCardTemplate;
  itemsToDisplay.forEach(item => {
    const cardClone = cardTemplate.content.cloneNode(true);
    const cardElement = cardClone.querySelector(".product-card");

    cardElement.dataset.id = item.id;

    if (appState.selectedItemIds.has(item.id)) {
      cardElement.classList.add("selected");
    }

    const isLowStock = item.quantity > 0 && item.quantity <= item.alertLevel;
    const isOutOfStock = item.quantity === 0;

    if (isLowStock) cardElement.classList.add("low-stock");
    if (isOutOfStock) cardElement.classList.add("out-of-stock");

    let badgeText = `متوفر: ${item.quantity}`;
    let badgeClass = "";
    if (isLowStock) {
      badgeText = `منخفض: ${item.quantity}`;
      badgeClass = "low-stock";
    }
    if (isOutOfStock) {
      badgeText = `نفد المخزون`;
      badgeClass = "out-of-stock";
    }

    const quantityBadge = cardClone.querySelector(".quantity-badge");
    quantityBadge.textContent = badgeText;
    quantityBadge.className = `quantity-badge ${badgeClass}`;
    const imageContainer = cardClone.querySelector(".card-image-container");
    const placeholder = cardClone.querySelector(".card-image-placeholder");

    if (item.imagePath) {
      const img = document.createElement("img");
      img.className = "card-image";
      img.alt = sanitizeHTML(item.name);

      if (item.imagePath.startsWith("http")) {
        img.src = item.imagePath;
      } else {
        img.dataset.src = item.imagePath;
      }
      imageContainer.appendChild(img);
      placeholder.remove();
    }

    const tagsContainer = cardClone.querySelector(
      ".card-category-tags-container"
    );
    tagsContainer.innerHTML = "";
    if (item.categories && item.categories.length > 0) {
      item.categories.forEach(category => {
        const tag = document.createElement("span");
        tag.className = "card-category-tag";
        tag.textContent = sanitizeHTML(category);
        tagsContainer.appendChild(tag);
      });
    }

    cardClone.querySelector(".card-name").textContent = sanitizeHTML(item.name);
    cardClone.querySelector(".card-sku").textContent = `SKU: ${sanitizeHTML(
      item.sku || ""
    )}`;
    const isIQD = appState.activeCurrency === "IQD";
    const price = isIQD ? item.sellPriceIqd || 0 : item.sellPriceUsd || 0;
    const symbol = isIQD ? "د.ع" : "$";
    cardClone.querySelector(
      ".card-price"
    ).textContent = `${price.toLocaleString()} ${symbol}`;
    cardClone.querySelector(".sell-btn").disabled = isOutOfStock;

    fragment.appendChild(cardClone);
  });

  elements.inventoryGrid.appendChild(fragment);

  elements.inventoryGrid
    .querySelectorAll(".card-image[data-src]")
    .forEach(img => imageObserver.observe(img));
  elements.inventoryGrid
    .querySelectorAll(".product-card")
    .forEach(card => animationObserver.observe(card));
  if (appState.visibleItemCount < itemsToRender.length) {
    elements.loadMoreTrigger.style.display = "block";
    loadMoreObserver.observe(elements.loadMoreTrigger);
  } else {
    elements.loadMoreTrigger.style.display = "none";
  }

  updateStats();
}

export function updateProductCard(itemId) {
  const card = document.querySelector(`.product-card[data-id="${itemId}"]`);
  const item = appState.inventory.items.find(i => i.id === itemId);
  if (!card || !item) {
    return;
  }

  const isLowStock = item.quantity > 0 && item.quantity <= item.alertLevel;
  const isOutOfStock = item.quantity === 0;

  card.classList.toggle("low-stock", isLowStock);
  card.classList.toggle("out-of-stock", isOutOfStock);

  const badge = card.querySelector(".quantity-badge");
  if (badge) {
    let badgeText = `متوفر: ${item.quantity}`;
    let badgeClass = "";
    if (isLowStock) {
      badgeText = `منخفض: ${item.quantity}`;
      badgeClass = "low-stock";
    }
    if (isOutOfStock) {
      badgeText = `نفد المخزون`;
      badgeClass = "out-of-stock";
    }
    badge.textContent = badgeText;
    badge.className = `quantity-badge ${badgeClass}`;
  }

  const sellBtn = card.querySelector(".sell-btn");
  if (sellBtn) {
    sellBtn.disabled = isOutOfStock;
  }
}

export function renderInventorySkeleton(count = 8) {
  elements.inventoryGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const skeletonCard = document.createElement("div");
    skeletonCard.className = "skeleton-card";
    skeletonCard.innerHTML = `
      <div class="skeleton skeleton-image"></div>
      <div class="skeleton-info">
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text w-75"></div>
        <div class="skeleton skeleton-text w-50" style="margin-top: 12px;"></div>
      </div>
    `;
    fragment.appendChild(skeletonCard);
  }

  elements.inventoryGrid.appendChild(fragment);
}

export function updateStats() {
  elements.totalItemsStat.textContent = appState.inventory.items.length;
  elements.lowStockStat.textContent = appState.inventory.items.filter(
    item => item.quantity <= item.alertLevel
  ).length;
}

export function renderCategoryFilter() {
  const { categoryFilterBar } = elements;
  if (!categoryFilterBar) return;
  // CHANGED: Use the new helper function
  const categories = getAllUniqueCategories();
  categoryFilterBar.innerHTML = "";
  const fragment = document.createDocumentFragment();

  const allButton = document.createElement("button");
  allButton.className = "category-chip";
  allButton.textContent = "عرض الكل";
  allButton.dataset.category = "all";

  if (appState.selectedCategory === "all") {
    allButton.classList.add("active");
  }
  fragment.appendChild(allButton);
  categories.forEach(category => {
    const chipButton = document.createElement("button");
    chipButton.className = "category-chip";
    chipButton.textContent = sanitizeHTML(category);
    chipButton.dataset.category = category;
    if (appState.selectedCategory === category) {
      chipButton.classList.add("active");
    }
    fragment.appendChild(chipButton);
  });
  categoryFilterBar.appendChild(fragment);
}

export function populateCategoryDatalist() {
  // CHANGED: Use the new helper function
  const categories = getAllUniqueCategories();
  const datalist = elements.categoryDatalist;
  datalist.innerHTML = "";
  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = sanitizeHTML(category);
    datalist.appendChild(option);
  });
}

function renderSalesLog(filteredSales) {
  if (filteredSales.length === 0) {
    elements.salesLogContent.innerHTML =
      "<div><p>لا توجد مبيعات في هذه الفترة.</p></div>";
    return;
  }

  const isIQD = appState.activeCurrency === "IQD";
  const symbol = isIQD ? "د.ع" : "$";
  const salesByDay = filteredSales.reduce((acc, sale) => {
    const date = sale.saleDate;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(sale);
    return acc;
  }, {});
  const logHTML = Object.entries(salesByDay)
    .map(([date, sales]) => {
      const dateObj = new Date(date);
      const dayHeader = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
        dateStyle: "full",
      }).format(dateObj);

      const salesCardsHTML = sales
        .map(sale => {
          const item =
            appState.inventory.items.find(i => i.id === sale.itemId) || {};
          const sellPrice = isIQD ? sale.sellPriceIqd : sale.sellPriceUsd;
          const costPrice = isIQD ? sale.costPriceIqd : sale.costPriceUsd;
          const totalSellPrice = sellPrice * sale.quantitySold;
          const profit = (sellPrice - costPrice) * sale.quantitySold;
          const profitClass =
            profit >= 0 ? "profit-positive" : "profit-negative";
          const profitIcon =
            profit >= 0
              ? "material-symbols:trending-up-rounded"
              : "material-symbols:trending-down-rounded";

          const saleTime = new Date(sale.timestamp).toLocaleTimeString(
            "ar-IQ",
            {
              hour: "numeric",
              minute: "numeric",
              hour12: true,
            }
          );
          return `
            <div class="sale-item" data-sale-id="${sale.saleId}">
              <div class="item-header">
                <div class="item-info">
                  <div class="item-product-name">${sanitizeHTML(
                    sale.itemName
                  )}</div>
                  <div class="item-product-sku">${sanitizeHTML(
                    item.sku || "N/A"
                  )}</div>
                </div>
                <div class="item-meta">
                  <div class="meta-label">الكمية</div>
                  <div class="meta-value">x${sale.quantitySold}</div>
                </div>
                <div class="item-meta">
                  <div class="meta-label">الإجمالي</div>
                  <div class="meta-value meta-price">${totalSellPrice.toLocaleString()}</div>
                </div>
                <div>
                  <button class="icon-btn danger-btn delete-sale-btn" title="حذف السجل">
                    <iconify-icon icon="material-symbols:delete-outline-rounded"></iconify-icon>
                  </button>
                </div>
                <div class="sale-datetime">
                  التاريخ: ${sale.saleDate} |
                  الوقت: ${saleTime}
                </div>
              </div>
              <div class="item-details">
                <ul class="details-list">
                  <li class="${profitClass}">
                    <div class="detail-label-group">
                      <iconify-icon icon="${profitIcon}"></iconify-icon>
                      <span class="label">الربح</span>
                    </div>
                    <span class="value">${profit.toLocaleString()} ${symbol}</span>
                  </li>
                  ${
                    sale.notes
                      ? `<li>
                          <div class="detail-label-group">
                            <iconify-icon icon="solar:notes-outline"></iconify-icon>
                            <span class="label">ملاحظات</span>
                          </div>
                          <span class="value">${sanitizeHTML(sale.notes)}</span>
                        </li>`
                      : ""
                  }
                </ul>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="day-group">
          <h3 class="day-header">${dayHeader}</h3>
          <div class="sales-list">${salesCardsHTML}</div>
        </div>
      `;
    })
    .join("");
  elements.salesLogContent.innerHTML = `<div>${logHTML}</div>`;
}

export const renderDashboard = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate;

  switch (appState.dashboardPeriod) {
    case "week":
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 6);
      break;
    case "month":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "today":
    default:
      startDate = today;
      break;
  }
  const filteredSales = appState.sales
    .filter(sale => {
      const [year, month, day] = sale.saleDate.split("-").map(Number);
      const saleDate = new Date(year, month - 1, day);
      return saleDate >= startDate && saleDate <= now;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const isIQD = appState.activeCurrency === "IQD";
  const totalSales = filteredSales.reduce(
    (sum, sale) =>
      sum + (isIQD ? sale.sellPriceIqd : sale.sellPriceUsd) * sale.quantitySold,
    0
  );
  const totalCost = filteredSales.reduce(
    (sum, sale) =>
      sum + (isIQD ? sale.costPriceIqd : sale.costPriceUsd) * sale.quantitySold,
    0
  );
  const totalProfit = totalSales - totalCost;
  const symbol = isIQD ? "د.ع" : "$";
  elements.totalSalesStat.textContent = `${totalSales.toLocaleString()} ${symbol}`;
  elements.totalProfitStat.textContent = `${totalProfit.toLocaleString()} ${symbol}`;

  const itemSales = {};
  filteredSales.forEach(sale => {
    itemSales[sale.itemId] = (itemSales[sale.itemId] || 0) + sale.quantitySold;
  });
  const sortedBestsellers = Object.entries(itemSales)
    .map(([itemId, count]) => {
      const item = appState.inventory.items.find(i => i.id === itemId);
      return { name: item ? item.name : "منتج محذوف", count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  elements.bestsellersList.innerHTML = "";
  if (sortedBestsellers.length > 0) {
    sortedBestsellers.forEach(item => {
      const li = document.createElement("div");
      li.className = "bestseller-item";
      li.innerHTML = `<span class="bestseller-name">${sanitizeHTML(
        item.name
      )}</span><span class="bestseller-count">بيع ${item.count}</span>`;
      elements.bestsellersList.appendChild(li);
    });
  } else {
    elements.bestsellersList.innerHTML = "<p>لا توجد مبيعات في هذه الفترة.</p>";
  }

  renderSalesLog(filteredSales);
};
export function renderSupplierList() {
  elements.supplierListContainer.innerHTML = "";
  if (appState.suppliers.length === 0) {
    elements.supplierListContainer.innerHTML = "<p>لا يوجد مورّدون حاليًا.</p>";
    return;
  }
  appState.suppliers.forEach(supplier => {
    const item = document.createElement("div");
    item.className = "supplier-item";
    item.innerHTML = `
      <div>
        <strong>${sanitizeHTML(supplier.name)}</strong>
        <div class="text-secondary">${sanitizeHTML(supplier.phone || "")}</div>
      </div>
      <div class="supplier-item-actions">
        <button class="icon-btn edit-supplier-btn" data-id="${
          supplier.id
        }" title="تعديل المورّد">
          <iconify-icon icon="material-symbols:edit-outline-rounded"></iconify-icon>
        </button>
        <button class="icon-btn danger-btn delete-supplier-btn" data-id="${
          supplier.id
        }" title="حذف المورّد">
          <iconify-icon icon="material-symbols:delete-outline-rounded"></iconify-icon>
        </button>
      </div>
    `;
    elements.supplierListContainer.appendChild(item);
  });
}

export function populateSupplierDropdown(selectedSupplierId = null) {
  const select = elements.itemSupplierSelect;
  select.innerHTML = '<option value="">-- اختر مورّد --</option>';
  appState.suppliers.forEach(supplier => {
    const option = document.createElement("option");
    option.value = supplier.id;
    option.textContent = sanitizeHTML(supplier.name);
    if (supplier.id === selectedSupplierId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

export function populateBulkSupplierDropdown() {
  elements.bulkSupplierSelect.innerHTML =
    '<option value="" disabled selected>-- اختر مورّد --</option>';
  appState.suppliers.forEach(supplier => {
    const option = document.createElement("option");
    option.value = supplier.id;
    option.textContent = sanitizeHTML(supplier.name);
    elements.bulkSupplierSelect.appendChild(option);
  });
}

const formatRelativeTime = date => {
  const now = new Date();
  const seconds = Math.round((now - date) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (seconds < 60) return `قبل لحظات`;
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  if (hours < 24) return `قبل ${hours} ساعة`;
  if (days < 30) return `قبل ${days} يوم`;
  return date.toLocaleString("ar-EG");
};
const getActionDetails = log => {
  const name = `<strong>${sanitizeHTML(log.targetName)}</strong>`;
  const details = log.details;

  const formatCategories = cats => {
    if (!Array.isArray(cats))
      return `"${sanitizeHTML(String(cats ?? "")) || "بلا فئة"}"`;
    if (cats.length === 0) return '"بلا فئة"';
    return `"${cats.map(c => sanitizeHTML(c)).join(", ")}"`;
  };

  const from = details.from;
  const to = details.to;

  switch (log.action) {
    case "ITEM_CREATED":
      return {
        icon: "material-symbols:add-box-outline",
        class: "create",
        description: `تم إنشاء منتج جديد: ${name}.`,
      };
    case "PRICE_UPDATED":
      return {
        icon: "material-symbols:price-change-outline",
        class: "update",
        description: `تم تغيير سعر ${name} من <span class="old-value">${Number(
          from
        ).toLocaleString()}</span> إلى <span class="new-value">${Number(
          to
        ).toLocaleString()}</span>.`,
      };
    case "QUANTITY_UPDATED":
      let qtyDescription = `تم تعديل كمية ${name} من ${sanitizeHTML(
        String(from)
      )} إلى ${sanitizeHTML(String(to))}.`;
      if (details.reason && details.reason.trim() !== "") {
        qtyDescription += ` (السبب: ${sanitizeHTML(details.reason)})`;
      }
      return {
        icon: "material-symbols:inventory-2-outline",
        class: "update",
        description: qtyDescription,
      };
    case "SALE_RECORDED":
      return {
        icon: "material-symbols:shopping-cart-outline",
        class: "sale",
        description: `تم بيع ${details.quantity} قطعة من ${name}.`,
      };
    case "ITEM_DELETED":
      return {
        icon: "material-symbols:delete-outline",
        class: "delete",
        description: `تم حذف المنتج: ${name}.`,
      };
    case "NAME_UPDATED":
      return {
        icon: "material-symbols:edit-outline",
        class: "update",
        description: `تم تغيير اسم المنتج من "${sanitizeHTML(
          String(from)
        )}" إلى "${sanitizeHTML(String(to))}".`,
      };
    case "SKU_UPDATED":
      return {
        icon: "material-symbols:qr-code-2",
        class: "update",
        description: `تم تغيير SKU للمنتج ${name} من "${sanitizeHTML(
          String(from)
        )}" إلى "${sanitizeHTML(String(to))}".`,
      };
    case "CATEGORY_UPDATED":
      return {
        icon: "material-symbols:folder-open-outline",
        class: "update",
        description: `تم تغيير فئة ${name} من ${formatCategories(
          from
        )} إلى ${formatCategories(to)}.`,
      };
    case "NOTES_UPDATED":
      return {
        icon: "material-symbols:note-stack-add-outline",
        class: "update",
        description: `تم تحديث الملاحظات للمنتج ${name}.`,
      };
    default:
      return {
        icon: "material-symbols:edit-document-outline",
        class: "update",
        description: `تم تحديث بيانات ${name} (${log.action}).`,
      };
  }
};

export function renderAuditLog() {
  if (!elements.auditLogList) return;
  elements.auditLogList.innerHTML = "";
  if (!appState.auditLog || appState.auditLog.length === 0) {
    elements.auditLogList.innerHTML =
      '<p style="padding: 1rem;">لا توجد نشاطات مسجلة بعد.</p>';
    return;
  }

  const sortedLog = [...appState.auditLog].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  const fragment = document.createDocumentFragment();

  sortedLog.forEach(logItem => {
    const clone = elements.logEntryTemplate.content.cloneNode(true);
    const iconElement = clone.querySelector(".log-icon");
    const iconify = iconElement.querySelector("iconify-icon");
    const descriptionElement = clone.querySelector(".log-description");
    const metaElement = clone.querySelector(".log-meta");

    const { icon, class: actionClass, description } = getActionDetails(logItem);

    iconElement.className = `log-icon ${actionClass}`;
    iconify.setAttribute("icon", icon);
    descriptionElement.innerHTML = description;
    metaElement.innerHTML = `بواسطة <span class="log-user">${sanitizeHTML(
      logItem.user
    )}</span> • ${formatRelativeTime(new Date(logItem.timestamp))}`;

    fragment.appendChild(clone);
  });
  elements.auditLogList.appendChild(fragment);
}
