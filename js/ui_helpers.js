// js/ui_helpers.js
import { getDOMElements, openModal } from "./ui.js";

/**
 * Displays a custom confirmation modal and returns a promise that resolves with the user's choice.
 * @param {object} options - The options for the confirmation modal.
 * @param {string} options.title - The title of the modal.
 * @param {string} options.message - The confirmation message.
 * @param {string} [options.confirmText='نعم, تأكيد'] - The text for the confirm button.
 * @param {string} [options.cancelText='إلغاء'] - The text for the cancel button.
 * @param {boolean} [options.isDanger=true] - If true, the confirm button will be styled as a danger button.
 * @returns {Promise<boolean>} - A promise that resolves to true if confirmed, false otherwise.
 */
export function showConfirmationModal({
  title,
  message,
  confirmText = "نعم, تأكيد",
  cancelText = "إلغاء",
  isDanger = true,
}) {
  return new Promise(resolve => {
    const elements = getDOMElements();
    const {
      confirmModal,
      confirmTitle,
      confirmMessage,
      confirmOkBtn,
      confirmCancelBtn,
      confirmModalIcon,
    } = elements;

    // Update modal content
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmText;
    confirmCancelBtn.textContent = cancelText;

    // Update modal style (danger vs. primary)
    confirmOkBtn.classList.toggle("danger", isDanger);
    confirmOkBtn.classList.toggle("primary", !isDanger);
    confirmModalIcon.classList.toggle("danger", isDanger);
    confirmModalIcon.classList.toggle("info", !isDanger);

    // Create listeners that will be removed after use
    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onModalClose = () => {
      // If the modal is closed by pressing ESC
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      confirmOkBtn.removeEventListener("click", onConfirm);
      confirmCancelBtn.removeEventListener("click", onCancel);
      confirmModal.removeEventListener("close", onModalClose);
      if (confirmModal.open) confirmModal.close();
    };

    // Attach temporary event listeners
    confirmOkBtn.addEventListener("click", onConfirm, { once: true });
    confirmCancelBtn.addEventListener("click", onCancel, { once: true });
    confirmModal.addEventListener("close", onModalClose, { once: true });

    openModal(confirmModal);
  });
}
