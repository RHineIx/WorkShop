// js/logger.js
import { appState } from './state.js';
import * as api from './api.js';
import { saveLocalData } from './app.js';

export const ACTION_TYPES = {
    ITEM_CREATED: 'ITEM_CREATED',
    ITEM_DELETED: 'ITEM_DELETED',
    SALE_RECORDED: 'SALE_RECORDED',
    // Specific updates for clarity in the log
    NAME_UPDATED: 'NAME_UPDATED',
    SKU_UPDATED: 'SKU_UPDATED',
    CATEGORY_UPDATED: 'CATEGORY_UPDATED',
    QUANTITY_UPDATED: 'QUANTITY_UPDATED',
    PRICE_UPDATED: 'PRICE_UPDATED',
    NOTES_UPDATED: 'NOTES_UPDATED',
    IMAGE_UPDATED: 'IMAGE_UPDATED',
    SUPPLIER_UPDATED: 'SUPPLIER_UPDATED',
};

/**
 * Creates a log entry and saves it.
 * @param {object} logData - The data for the log entry.
 * @param {string} logData.action - One of the ACTION_TYPES.
 * @param {string} logData.targetId - The ID of the item affected.
 * @param {string} logData.targetName - The name of the item for easy reference.
 * @param {object} [logData.details={}] - An object with context-specific details (e.g., { from, to }).
 */
export async function logAction({ action, targetId, targetName, details = {} }) {
    const newLogEntry = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        user: appState.currentUser,
        action,
        targetId,
        targetName,
        details,
    };

    appState.auditLog.push(newLogEntry);
    
    // For immediate UI update and local persistence
    saveLocalData();
    const { renderAuditLog } = await import('./renderer.js');
    if (appState.currentView === 'activity-log') {
        renderAuditLog();
    }

    // Save to remote
    try {
        await api.saveAuditLog();
    } catch (error) {
        console.error("Failed to save audit log to remote:", error);
        // The log is saved locally, it will sync on the next successful operation.
    }
}