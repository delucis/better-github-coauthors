// @ts-check
/// <reference types="chrome" />

/**
 * @typedef Settings
 * @property {string[]} ignoredCoAuthors
 * @property {boolean} stripExistingCoAuthors
 * @property {string} token
 */

/**
 * @return {Promise<Settings>}
 */
function getSettings() {
  return chrome.storage.local.get({
    ignoredCoAuthors: [],
    stripExistingCoAuthors: false,
    token: "",
  });
}

/**
 * @param {Settings} settings
 * @returns {Promise<void>}
 */
function saveSettings(settings) {
  return chrome.storage.local.set(settings);
}
