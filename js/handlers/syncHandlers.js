// js/handlers/syncHandlers.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { saveConfig, saveLocalData } from "../app.js";
import { elements, openModal } from "../ui.js";
import { showStatus, hideStatus } from "../notifications.js";
import { showConfirmationModal } from "../ui_helpers.js";
import { filterAndRenderItems, renderDashboard } from "../renderer.js";

function setupTabNavigation() {
  const tabContainer = document.querySelector("#sync-modal .tab-navigation");
  if (!tabContainer) return;
  tabContainer.addEventListener("click", e => {
    const clickedTab = e.target.closest(".tab-btn");
    if (!clickedTab || clickedTab.classList.contains("active")) return;

    const targetPanelId = clickedTab.dataset.tab;
    const targetPanel = document.getElementById(targetPanelId);

    const currentActiveTab = tabContainer.querySelector(".active");
    const currentActivePanel = document.querySelector(
      "#sync-modal .tab-panel.active"
    );

    if (currentActiveTab) currentActiveTab.classList.remove("active");
    if (currentActivePanel) currentActivePanel.classList.remove("active");

    clickedTab.classList.add("active");
    if (targetPanel) {
      targetPanel.classList.add("active");
    }
  });
}

function openSyncModal() {
  if (appState.syncConfig) {
    elements.githubUsernameInput.value = appState.syncConfig.username;
    elements.githubRepoInput.value = appState.syncConfig.repo;
    elements.githubPatInput.value = appState.syncConfig.pat;
  } else {
    elements.syncForm.reset();
  }
  elements.exchangeRateInput.value = appState.exchangeRate || "";
  elements.currentUserInput.value = appState.currentUser || "المستخدم";
  // Reset to the first tab every time the modal is opened
  const tabContainer = document.querySelector("#sync-modal .tab-navigation");
  const tabPanels = document.querySelectorAll("#sync-modal .tab-panel");
  if (tabContainer && tabPanels.length > 0) {
    tabContainer
      .querySelectorAll(".tab-btn")
      .forEach(btn => btn.classList.remove("active"));
    tabPanels.forEach(panel => panel.classList.remove("active"));

    tabContainer.querySelector(".tab-btn").classList.add("active");
    tabPanels[0].classList.add("active");
  }

  // Automatically fetch fresh data when modal is opened
  handleLiveExchangeRateClick();
  updateLastArchiveDateDisplay();

  openModal(elements.syncModal);
}

async function handleSyncFormSubmit(e) {
  e.preventDefault();
  appState.syncConfig = {
    username: elements.githubUsernameInput.value.trim(),
    repo: elements.githubRepoInput.value.trim(),
    pat: elements.githubPatInput.value.trim(),
  };
  appState.exchangeRate = parseFloat(elements.exchangeRateInput.value) || 1460;
  appState.currentUser = elements.currentUserInput.value.trim() || "المستخدم";
  saveConfig();
  showStatus("تم حفظ الإعدادات بنجاح.", "success");
  elements.syncModal.close();
}

export function updateLastArchiveDateDisplay() {
  const lastArchiveDisplay = document.getElementById(
    "last-archive-date-display"
  );
  if (!lastArchiveDisplay) return;
  const timestamp = appState.inventory.lastArchiveTimestamp;
  if (timestamp && typeof timestamp === "number") {
    const date = new Date(timestamp);
    const formattedDate = date.toLocaleString("ar-IQ", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    lastArchiveDisplay.textContent = `آخر أرشفة: ${formattedDate}`;
  } else {
    lastArchiveDisplay.textContent = "آخر أرشفة: لم تتم بعد";
  }
}

async function handleManualArchive() {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const salesToArchive = appState.sales.filter(sale => {
    const saleDate = new Date(sale.saleDate);
    return saleDate < threeMonthsAgo;
  });
  if (salesToArchive.length === 0) {
    showStatus("لا توجد مبيعات قديمة (أقدم من 3 أشهر) للأرشفة.", "info");
    return;
  }

  const confirmed = await showConfirmationModal({
    title: "تأكيد الأرشفة",
    message: `سيتم أرشفة ${salesToArchive.length} سجل مبيعات. سيتم نقل هذه السجلات إلى ملف أرشيف منفصل ولا يمكن التراجع عن هذا الإجراء بسهولة.`,
    confirmText: "نعم، أرشف",
    isDanger: false,
  });
  if (!confirmed) return;

  const syncToastId = showStatus("جاري أرشفة المبيعات...", "syncing");
  try {
    const archiveFileName = `archive/sales_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    await api.createGitHubFile(
      archiveFileName,
      JSON.stringify(salesToArchive, null, 2),
      `Archive sales data up to ${new Date().toISOString()}`
    );
    appState.sales = appState.sales.filter(
      sale => new Date(sale.saleDate) >= threeMonthsAgo
    );
    appState.inventory.lastArchiveTimestamp = Date.now();

    await api.saveSales();
    await api.saveInventory(); // Save inventory to update the timestamp
    saveLocalData();

    hideStatus(syncToastId);
    showStatus("تمت أرشفة المبيعات بنجاح!", "success");
    updateLastArchiveDateDisplay();
    if (appState.currentView === "dashboard") {
      renderDashboard();
    }
  } catch (error) {
    console.error("Archiving failed:", error);
    hideStatus(syncToastId);
    showStatus(`فشلت عملية الأرشفة: ${error.message}`, "error");
  }
}

async function handleLiveExchangeRateClick() {
  const display = document.getElementById("live-exchange-rate-display");
  display.textContent = "جاري التحميل...";
  display.classList.remove("error");

  const rate = await api.fetchLiveExchangeRate();
  if (rate) {
    const formattedRate = Math.round(rate);
    display.innerHTML = `السعر الحالي: <span class="value">${formattedRate}</span>`;
    appState.liveExchangeRate = formattedRate;
  } else {
    display.textContent = "فشل التحديث. حاول مرة أخرى.";
    display.classList.add("error");
    appState.liveExchangeRate = null;
  }
}

async function handleCleanupImages() {
  const confirmed = await showConfirmationModal({
    title: "تنظيف الصور غير المستخدمة",
    message:
      "سيقوم هذا الإجراء بفحص جميع الصور في المستودع وحذف أي صورة غير مرتبطة بأي منتج حالي. هل أنت متأكد؟",
    confirmText: "نعم، قم بالتنظيف",
  });
  if (!confirmed) return;

  const syncToastId = showStatus("جاري البحث عن الصور غير المستخدمة...", "syncing");
  try {
    const repoImages = await api.getGitHubDirectoryListing("images");
    const usedImagePaths = new Set(
      appState.inventory.items.map(item => item.imagePath).filter(Boolean)
    );
    const unusedImages = repoImages.filter(
      file => !usedImagePaths.has(file.path)
    );
    if (unusedImages.length === 0) {
      hideStatus(syncToastId);
      showStatus("لا توجد صور غير مستخدمة ليتم حذفها.", "info");
      return;
    }

    hideStatus(syncToastId);
    const deleteConfirmed = await showConfirmationModal({
      title: "تأكيد الحذف",
      message: `تم العثور على ${unusedImages.length} صورة غير مستخدمة. هل تريد حذفها نهائياً؟`,
      confirmText: `نعم، حذف ${unusedImages.length} صور`,
    });
    if (!deleteConfirmed) return;

    const deletionToastId = showStatus(
      `جاري حذف ${unusedImages.length} صورة...`,
      "syncing"
    );
    let successCount = 0;
    for (const image of unusedImages) {
      try {
        await api.deleteFileFromGitHub(
          image.path,
          image.sha,
          "Cleanup: Delete unused image"
        );
        successCount++;
      } catch (error) {
        console.error(`Failed to delete image ${image.path}:`, error);
      }
    }

    hideStatus(deletionToastId);
    showStatus(
      `اكتمل التنظيف. تم حذف ${successCount} من ${unusedImages.length} صورة بنجاح.`,
      "success"
    );
  } catch (error) {
    hideStatus(syncToastId);
    showStatus(`حدث خطأ أثناء التنظيف: ${error.message}`, "error");
  }
}

async function handleBackupDownload() {
  const syncToastId = showStatus("جاري تجهيز النسخة الاحتياطية...", "syncing");
  try {
    const { default: JSZip } = await import(
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
    );
    const zip = new JSZip();
    zip.file("inventory.json", JSON.stringify(appState.inventory, null, 2));
    zip.file("sales.json", JSON.stringify(appState.sales, null, 2));
    zip.file("suppliers.json", JSON.stringify(appState.suppliers, null, 2));
    zip.file("audit-log.json", JSON.stringify(appState.auditLog, null, 2));
    const configToSave = {
      ...appState.syncConfig,
      pat: "REPLACE_WITH_YOUR_PAT",
    };
    zip.file("config.json", JSON.stringify(configToSave, null, 2));

    const imagePaths = [
      ...new Set(
        appState.inventory.items.map(item => item.imagePath).filter(Boolean)
      ),
    ];
    if (imagePaths.length > 0) {
      const imgFolder = zip.folder("images");
      for (const path of imagePaths) {
        try {
          const blob = await api.fetchGitHubFileAsBlob(path);
          if (blob) {
            imgFolder.file(path.split("/").pop(), blob);
          }
        } catch (e) {
          console.warn(`Could not fetch image for backup: ${path}`);
        }
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `master_key_backup_${new Date()
      .toISOString()
      .slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    hideStatus(syncToastId);
    showStatus("تم تنزيل النسخة الاحتياطية بنجاح!", "success");
  } catch (error) {
    hideStatus(syncToastId);
    showStatus(`حدث خطأ: ${error.message}`, "error");
  }
}

async function handleRestoreFromFile(file) {
  if (!file) return;
  const confirmed = await showConfirmationModal({
    title: "استعادة نسخة احتياطية",
    message:
      "سيتم استبدال جميع البيانات الحالية (المنتجات، المبيعات، الموردون) بالبيانات الموجودة في الملف. هل أنت متأكد من المتابعة؟",
    confirmText: "نعم، قم بالاستعادة",
  });
  if (!confirmed) return;
  const syncToastId = showStatus("جاري استعادة البيانات...", "syncing");
  try {
    const { default: JSZip } = await import(
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
    );
    const zip = await JSZip.loadAsync(file);
    const inventoryFile = zip.file("inventory.json");
    const salesFile = zip.file("sales.json");
    const suppliersFile = zip.file("suppliers.json");
    const auditLogFile = zip.file("audit-log.json");

    if (inventoryFile)
      appState.inventory = JSON.parse(await inventoryFile.async("string"));
    if (salesFile)
      appState.sales = JSON.parse(await salesFile.async("string"));
    if (suppliersFile)
      appState.suppliers = JSON.parse(await suppliersFile.async("string"));
    if (auditLogFile)
      appState.auditLog = JSON.parse(await auditLogFile.async("string"));

    saveLocalData();
    await Promise.all([
      api.saveInventory(),
      api.saveSales(),
      api.saveSuppliers(),
      api.saveAuditLog(),
    ]);
    hideStatus(syncToastId);
    showStatus("تم استعادة البيانات ومزامنتها بنجاح!", "success");
    filterAndRenderItems(true);
  } catch (error) {
    hideStatus(syncToastId);
    showStatus(`فشل استعادة البيانات: ${error.message}`, "error");
  } finally {
    elements.restoreBackupInput.value = "";
  }
}

function handleGenerateMagicLink() {
  if (!appState.syncConfig || !appState.syncConfig.pat) {
    showStatus("يجب حفظ إعدادات المزامنة أولاً.", "error");
    return;
  }

  const configString = JSON.stringify(appState.syncConfig);
  const encodedConfig = btoa(configString);
  const url = `${window.location.origin}${window.location.pathname}#setup=${encodedConfig}`;

  elements.magicLinkOutput.value = url;
  elements.magicLinkContainer.classList.remove("view-hidden");
}

export function setupSyncListeners(elements) {
  setupTabNavigation();

  elements.syncSettingsBtn.addEventListener("click", () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        openSyncModal();
      });
    });
  });
  elements.syncForm.addEventListener("submit", handleSyncFormSubmit);

  const closeBtn = document.getElementById("close-sync-modal-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      elements.syncModal.close();
    });
  }

  elements.cancelSyncBtn.addEventListener("click", () => {
    elements.syncModal.close();
  });

  const liveRateDisplay = document.getElementById("live-exchange-rate-display");
  liveRateDisplay.addEventListener("click", e => {
    if (
      appState.liveExchangeRate &&
      !e.currentTarget.classList.contains("error")
    ) {
      elements.exchangeRateInput.value = appState.liveExchangeRate;
    } else {
      handleLiveExchangeRateClick();
    }
  });
  elements.cleanupImagesBtn.addEventListener("click", handleCleanupImages);
  elements.downloadBackupBtn.addEventListener("click", handleBackupDownload);
  elements.restoreBackupInput.addEventListener("change", e =>
    handleRestoreFromFile(e.target.files[0])
  );
  elements.generateMagicLinkBtn.addEventListener(
    "click",
    handleGenerateMagicLink
  );
  elements.magicLinkOutput.addEventListener("click", e => {
    e.target.select();
    navigator.clipboard.writeText(e.target.value);
    showStatus("تم نسخ الرابط إلى الحافظة.", "success");
  });
  document
    .getElementById("manual-archive-btn")
    .addEventListener("click", handleManualArchive);
  document
    .getElementById("view-archives-btn")
    .addEventListener("click", async () => {
      const modal = elements.archiveBrowserModal;
      const listContainer = document.getElementById("archive-list-container");
      const detailsContainer = document.getElementById(
        "archive-details-container"
      );
      listContainer.innerHTML = "<p>جاري تحميل قائمة الأرشيف...</p>";
      detailsContainer.innerHTML = "";
      openModal(modal);

      try {
        const archives = await api.getGitHubDirectoryListing("archive");
        if (archives.length === 0) {
          listContainer.innerHTML = "<p>لم يتم العثور على ملفات أرشفة.</p>";
          return;
        }
        listContainer.innerHTML = "";
        archives
          .sort((a, b) => b.name.localeCompare(a.name))
          .forEach(file => {
            const item = document.createElement("div");
            item.className = "archive-item";
            item.textContent = file.name.replace(".json", "");
            item.dataset.path = file.path;
            listContainer.appendChild(item);
          });
      } catch (error) {
        listContainer.innerHTML = `<p style="color: var(--danger-color);">فشل تحميل الأرشيف: ${error.message}</p>`;
      }
    });

  elements.closeArchiveBrowserBtn.addEventListener("click", () =>
    elements.archiveBrowserModal.close()
  );
  document
    .getElementById("archive-list-container")
    .addEventListener("click", async e => {
      const item = e.target.closest(".archive-item");
      if (!item) return;

      const currentActive = e.currentTarget.querySelector(".active");
      if (currentActive) currentActive.classList.remove("active");
      item.classList.add("active");

      const detailsContainer = document.getElementById(
        "archive-details-container"
      );
      detailsContainer.innerHTML = "<p>جاري تحميل تفاصيل الأرشيف...</p>";

      try {
        const data = await api.fetchGitHubFile(item.dataset.path);
        if (!data || data.length === 0) {
          detailsContainer.innerHTML = "<p>ملف الأرشيف هذا فارغ.</p>";
          return;
        }

        let tableHtml = `<table class="archive-table">
        <thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>التاريخ</th></tr></thead>
        <tbody>`;

        for (const sale of data) {
          const isIQD = appState.activeCurrency === "IQD";
          const price = isIQD ? sale.sellPriceIqd : sale.sellPriceUsd;
          const symbol = isIQD ? "د.ع" : "$";
          tableHtml += `
          <tr>
            <td>${sale.itemName}</td>
            <td>${sale.quantitySold}</td>
            <td>${(price * sale.quantitySold).toLocaleString()} ${symbol}</td>
            <td>${sale.saleDate}</td>
          </tr>
        `;
        }
        tableHtml += `</tbody></table>`;
        detailsContainer.innerHTML = tableHtml;
      } catch (error) {
        detailsContainer.innerHTML = `<p style="color: var(--danger-color);">فشل تحميل التفاصيل: ${error.message}</p>`;
      }
    });

  document
    .getElementById("backup-to-telegram-btn")
    .addEventListener("click", async () => {
      const confirmed = await showConfirmationModal({
        title: "إرسال نسخة احتياطية إلى تليجرام",
        message:
          "سيتم تشغيل عملية لأخذ نسخة احتياطية من البيانات وإرسالها عبر بوت تليجرام. قد تستغرق العملية بضع دقائق. هل تريد المتابعة؟",
        isDanger: false,
        confirmText: "نعم، إرسال",
      });
      if (confirmed) {
        const toastId = showStatus("تم إرسال طلب النسخ الاحتياطي...", "syncing");
        try {
          await api.triggerBackupWorkflow();
          hideStatus(toastId);
          showStatus(
            "تم استلام الطلب. ستصلك رسالة على تليجرام عند اكتمال النسخ.",
            "success"
          );
        } catch (error) {
          hideStatus(toastId);
          showStatus(`فشل إرسال الطلب: ${error.message}`, "error");
        }
      }
    });
}