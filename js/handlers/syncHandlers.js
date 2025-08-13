// js/handlers/syncHandlers.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { saveConfig, initializeApp, saveLocalData } from "../app.js";
import { sanitizeHTML } from "../utils.js";
import { showStatus, hideSyncStatus } from "../notifications.js";
import { getDOMElements, openModal } from "../ui.js";

function populateSyncModal() {
  const elements = getDOMElements();
  if (appState.currentUser) {
    elements.currentUserInput.value = appState.currentUser;
  }
  if (appState.syncConfig) {
    elements.githubUsernameInput.value = appState.syncConfig.username;
    elements.githubRepoInput.value = appState.syncConfig.repo;
    elements.githubPatInput.value = appState.syncConfig.pat;
  }
  if (appState.exchangeRate) {
    elements.exchangeRateInput.value = appState.exchangeRate;
  } else {
    elements.exchangeRateInput.value = "";
  }
  openModal(elements.syncModal);
}

function generateMagicLink() {
  if (!appState.syncConfig) {
    showStatus("يجب حفظ الإعدادات أولاً.", "error");
    return;
  }
  const { magicLinkContainer, magicLinkOutput } = getDOMElements();
  const configJson = JSON.stringify(appState.syncConfig);
  const encodedData = btoa(configJson);
  const url = `${window.location.origin}${window.location.pathname}#setup=${encodedData}`;

  magicLinkOutput.value = url;
  magicLinkContainer.classList.remove("view-hidden");
  magicLinkOutput.onclick = () => {
    magicLinkOutput.select();
    navigator.clipboard.writeText(url).then(() => {
      showStatus("تم نسخ الرابط إلى الحافظة!", "success", {
        duration: 2000,
      });
    });
  };
}

async function handleImageCleanup() {
  if (!appState.syncConfig) {
    showStatus("يرجى إعداد المزامنة أولاً.", "error", { duration: 5000 });
    return;
  }
  if (
    !confirm(
      "هل أنت متأكد من رغبتك في حذف جميع الصور غير المستخدمة نهائياً من المستودع؟ لا يمكن التراجع عن هذا الإجراء."
    )
  ) {
    return;
  }

  showStatus("جاري البحث عن الصور غير المستخدمة...", "syncing");
  try {
    const allRepoImages = await api.getGitHubDirectoryListing("images");
    const usedImages = new Set(
      appState.inventory.items.map(item => item.imagePath).filter(Boolean)
    );
    const orphanedImages = allRepoImages.filter(
      repoImage => !usedImages.has(repoImage.path)
    );
    if (orphanedImages.length === 0) {
      hideSyncStatus();
      showStatus("لا توجد صور غير مستخدمة ليتم حذفها.", "success");
      return;
    }

    showStatus(
      `تم العثور على ${orphanedImages.length} صورة... جاري الحذف.`,
      "syncing"
    );
    let deletedCount = 0;
    for (const image of orphanedImages) {
      await api.deleteFileFromGitHub(
        image.path,
        image.sha,
        `Cleanup: delete unused image ${image.name}`
      );
      deletedCount++;
    }
    hideSyncStatus();
    showStatus(`تم حذف ${deletedCount} صورة غير مستخدمة بنجاح.`, "success", {
      duration: 5000,
    });
  } catch (error) {
    hideSyncStatus();
    showStatus(`حدث خطأ: ${error.message}`, "error", { duration: 5000 });
  }
}

async function handleManualArchive() {
  if (!appState.syncConfig || !appState.sales || appState.sales.length === 0) {
    showStatus("لا توجد بيانات للمزامنة أو الأرشفة.", "error", {
      duration: 4000,
    });
    return;
  }

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}_${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
  const salesByMonth = appState.sales.reduce((acc, sale) => {
    const saleDate = new Date(sale.saleDate);
    const monthKey = `${saleDate.getFullYear()}_${String(
      saleDate.getMonth() + 1
    ).padStart(2, "0")}`;
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(sale);
    return acc;
  }, {});
  const archivesToCreate = Object.entries(salesByMonth).filter(
    ([key]) => key !== currentMonthKey
  );
  if (archivesToCreate.length === 0) {
    showStatus("لا توجد مبيعات من الشهور السابقة لأرشفتها.", "success");
    return;
  }

  if (
    !confirm(
      `سيتم أرشفة المبيعات لـ ${archivesToCreate.length} شهر. هل أنت متأكد؟`
    )
  ) {
    return;
  }

  showStatus("جاري أرشفة البيانات...", "syncing");
  try {
    for (const [monthKey, salesData] of archivesToCreate) {
      const path = `archives/sales_${monthKey}.json`;
      const content = JSON.stringify(salesData, null, 2);
      await api.createGitHubFile(
        path,
        content,
        `Manual archive for ${monthKey}`
      );
    }

    appState.sales = salesByMonth[currentMonthKey] || [];
    appState.inventory.lastArchiveTimestamp = new Date().toLocaleString(
      "ar-EG"
    );
    await api.saveSales();
    await api.saveToGitHub();
    saveLocalData();
    updateLastArchiveDateDisplay();

    hideSyncStatus();
    showStatus(
      `تمت أرشفة ${archivesToCreate.length} شهر من السجلات بنجاح.`,
      "success",
      { duration: 5000 }
    );
  } catch (error) {
    console.error("Manual archive failed:", error);
    hideSyncStatus();
    showStatus(`فشلت عملية الأرشفة: ${error.message}`, "error", {
      duration: 5000,
    });
  }
}

export function updateLastArchiveDateDisplay() {
  const lastArchiveDate = appState.inventory.lastArchiveTimestamp;
  const displayElement = document.getElementById("last-archive-date-display");
  if (displayElement) {
    if (lastArchiveDate) {
      displayElement.textContent = `آخر أرشفة: ${lastArchiveDate}`;
    } else {
      displayElement.textContent = "آخر أرشفة: لم تتم بعد";
    }
  }
}

async function openArchiveBrowser() {
  const modal = document.getElementById("archive-browser-modal");
  const listContainer = document.getElementById("archive-list-container");
  const detailsContainer = document.getElementById("archive-details-container");
  listContainer.innerHTML = "<p>جاري تحميل قائمة الأرشيف...</p>";
  detailsContainer.innerHTML =
    "<p>اختر شهراً من القائمة أعلاه لعرض تفاصيله.</p>";

  openModal(modal);
  try {
    const files = await api.getGitHubDirectoryListing("archives");
    if (files.length === 0) {
      listContainer.innerHTML = "<p>لا يوجد أرشيف لعرضه.</p>";
      return;
    }
    listContainer.innerHTML = "";
    files
      .sort((a, b) => b.name.localeCompare(a.name))
      .forEach(file => {
        const item = document.createElement("div");
        item.className = "archive-item";
        item.dataset.path = file.path;

        const itemText = document.createElement("span");
        itemText.className = "archive-item-text";
        itemText.textContent = file.name
          .replace("sales_", "")
          .replace(".json", "")
          .replace("_", "-");
        item.appendChild(itemText);

        const deleteButton = document.createElement("button");
        deleteButton.className = "archive-delete-btn";
        deleteButton.innerHTML = `<iconify-icon icon="material-symbols:delete-outline-rounded"></iconify-icon>`;
        deleteButton.title = "حذف الأرشيف";
        deleteButton.dataset.path = file.path;
        deleteButton.dataset.sha = file.sha;
        item.appendChild(deleteButton);

        listContainer.appendChild(item);
      });
  } catch (error) {
    listContainer.innerHTML = `<p style="color: var(--danger-color);">فشل تحميل الأرشيف: ${error.message}</p>`;
  }
}

async function handleDownloadBackup() {
  showStatus("جاري تجهيز النسخة الاحتياطية...", "syncing");
  try {
    const zip = new JSZip();
    zip.file("inventory.json", JSON.stringify(appState.inventory, null, 2));
    zip.file("sales.json", JSON.stringify(appState.sales, null, 2));
    zip.file("suppliers.json", JSON.stringify(appState.suppliers, null, 2));

    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");
    link.download = `workshop-backup-${timestamp}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    hideSyncStatus();
    showStatus("تم تنزيل النسخة الاحتياطية بنجاح!", "success");
  } catch (error) {
    console.error("Backup failed:", error);
    hideSyncStatus();
    showStatus(`فشل إنشاء النسخة الاحتياطية: ${error.message}`, "error", {
      duration: 5000,
    });
  }
}

async function handleBackupToTelegram() {
  if (!appState.syncConfig) {
    showStatus("يرجى إعداد المزامنة أولاً.", "error");
    return;
  }
  if (
    !confirm("هل أنت متأكد من رغبتك في إنشاء وإرسال نسخة احتياطية إلى تليجرام؟")
  ) {
    return;
  }
  showStatus("جاري طلب النسخة الاحتياطية...", "syncing");
  try {
    const success = await api.triggerBackupWorkflow();
    if (success) {
      hideSyncStatus();
      showStatus(
        "تم إرسال الطلب بنجاح! ستصلك النسخة الاحتياطية على تليجرام قريبًا.",
        "success",
        { duration: 6000 }
      );
    }
  } catch (error) {
    hideSyncStatus();
    showStatus(`فشل إرسال الطلب: ${error.message}`, "error", {
      duration: 6000,
    });
  }
}

async function handleRestoreBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (
    !confirm(
      "هل أنت متأكد من رغبتك في استعادة البيانات من هذا الملف؟ سيتم الكتابة فوق جميع بياناتك الحالية."
    )
  ) {
    event.target.value = "";
    return;
  }

  showStatus("جاري استعادة النسخة الاحتياطية...", "syncing");
  try {
    const zip = await JSZip.loadAsync(file);
    const inventoryFile = zip.file("inventory.json");
    const salesFile = zip.file("sales.json");
    const suppliersFile = zip.file("suppliers.json");
    if (!inventoryFile || !salesFile || !suppliersFile) {
      throw new Error(
        "ملف النسخة الاحتياطية غير صالح أو لا يحتوي على الملفات المطلوبة."
      );
    }

    const inventoryData = JSON.parse(await inventoryFile.async("string"));
    const salesData = JSON.parse(await salesFile.async("string"));
    const suppliersData = JSON.parse(await suppliersFile.async("string"));
    if (
      !inventoryData.items ||
      !Array.isArray(salesData) ||
      !Array.isArray(suppliersData)
    ) {
      throw new Error("محتوى ملف النسخة الاحتياطية غير صالح.");
    }

    appState.inventory = inventoryData;
    appState.sales = salesData;
    appState.suppliers = suppliersData;

    saveLocalData();
    hideSyncStatus();
    showStatus(
      "تمت استعادة البيانات بنجاح! سيتم إعادة تحميل التطبيق.",
      "success",
      { duration: 4000 }
    );
    setTimeout(() => {
      location.reload();
    }, 4000);
  } catch (error) {
    console.error("Restore failed:", error);
    hideSyncStatus();
    showStatus(`فشلت عملية الاستعادة: ${error.message}`, "error", {
      duration: 5000,
    });
  } finally {
    event.target.value = "";
  }
}

export function setupSyncListeners(elements) {
  elements.syncSettingsBtn.addEventListener("click", () => {
    populateSyncModal();
    const { magicLinkContainer } = getDOMElements();
    magicLinkContainer.classList.add("view-hidden");

    const display = document.getElementById("live-exchange-rate-display");
    const input = document.getElementById("exchange-rate");
    display.textContent = "جاري تحميل السعر...";
    display.classList.remove("error");
    display.onclick = null;

    api.fetchLiveExchangeRate().then(rate => {
      if (rate) {
        const roundedRate = Math.round(rate);
        display.innerHTML = `السعر الحالي: <span class="value">${roundedRate}</span>`;
        display.onclick = () => {
          input.value = roundedRate;
          input.focus();
        };
      } else {
        display.textContent = "فشل تحديث السعر";
        display.classList.add("error");
      }
    });
  });
  elements.cancelSyncBtn.addEventListener("click", () =>
    elements.syncModal.close()
  );

  elements.syncForm.addEventListener("submit", async e => {
    e.preventDefault();
    appState.currentUser =
      elements.currentUserInput.value.trim() || "المستخدم";
    appState.syncConfig = {
      username: elements.githubUsernameInput.value.trim(),
      repo: elements.githubRepoInput.value.trim(),
      pat: elements.githubPatInput.value.trim(),
    };
    appState.exchangeRate =
      parseFloat(document.getElementById("exchange-rate").value) || 0;
    saveConfig();
    elements.syncModal.close();
    await initializeApp();
  });
  const advancedSettingsToggle = document.getElementById(
    "advanced-settings-toggle"
  );
  const advancedSettingsContainer = document.getElementById(
    "advanced-settings-container"
  );
  advancedSettingsToggle.addEventListener("click", () => {
    advancedSettingsToggle.classList.toggle("open");
    advancedSettingsContainer.classList.toggle("open");
  });

  elements.cleanupImagesBtn.addEventListener("click", handleImageCleanup);
  elements.downloadBackupBtn.addEventListener("click", handleDownloadBackup);
  elements.restoreBackupInput.addEventListener("change", handleRestoreBackup);
  document
    .getElementById("backup-to-telegram-btn")
    .addEventListener("click", handleBackupToTelegram);
  document
    .getElementById("manual-archive-btn")
    .addEventListener("click", handleManualArchive);
  document
    .getElementById("view-archives-btn")
    .addEventListener("click", openArchiveBrowser);
  elements.generateMagicLinkBtn.addEventListener("click", generateMagicLink);
  document
    .getElementById("close-archive-browser-btn")
    .addEventListener("click", () =>
      document.getElementById("archive-browser-modal").close()
    );
  document
    .getElementById("archive-list-container")
    .addEventListener("click", async e => {
      const deleteButton = e.target.closest(".archive-delete-btn");
      if (deleteButton) {
        e.stopPropagation();
        const path = deleteButton.dataset.path;
        const sha = deleteButton.dataset.sha;
        if (confirm(`هل أنت متأكد من حذف هذا الأرشيف (${path}) نهائياً؟`)) {
          showStatus("جاري حذف الأرشيف...", "syncing");
          try {
            await api.deleteFileFromGitHub(
              path,
              sha,
              `Delete archive file: ${path}`
            );
            showStatus("تم حذف الأرشيف بنجاح!", "success");
            openArchiveBrowser();
          } catch (error) {
            showStatus(`فشل حذف الأرشيف: ${error.message}`, "error", {
              duration: 5000,
            });
          }
        }
        return;
      }

      const item = e.target.closest(".archive-item");
      if (!item) return;

      const detailsContainer = document.getElementById(
        "archive-details-container"
      );
      const container = item.parentElement;
      if (container.querySelector(".active")) {
        container.querySelector(".active").classList.remove("active");
      }
      item.classList.add("active");
      detailsContainer.innerHTML = "<p>جاري تحميل البيانات...</p>";
      try {
        const data = await api.fetchGitHubFile(item.dataset.path);
        const symbol = appState.activeCurrency === "IQD" ? "د.ع" : "$";
        let tableHTML = `<table class="archive-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>التاريخ</th></tr></thead><tbody>`;
        data.forEach(sale => {
          const price =
            appState.activeCurrency === "IQD"
              ? sale.sellPriceIqd
              : sale.sellPriceUsd;
          tableHTML += `<tr><td>${sale.itemName}</td><td>${
            sale.quantitySold
          }</td><td>${price.toLocaleString()} ${symbol}</td><td>${
            sale.saleDate
          }</td></tr>`;
          if (sale.notes) {
            tableHTML += `<tr class="archive-notes-row"><td colspan="4"><iconify-icon icon="material-symbols:notes-outline-rounded"></iconify-icon> ${sanitizeHTML(
              sale.notes
            )}</td></tr>`;
          }
        });
        tableHTML += "</tbody></table>";
        detailsContainer.innerHTML = tableHTML;
      } catch (error) {
        detailsContainer.innerHTML = `<p style="color: var(--danger-color);">فشل تحميل الملف: ${error.message}</p>`;
      }
    });
}
