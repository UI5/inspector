'use strict';

var PromptBuilder = require('./PromptBuilder.js');
var PromptClient = require('./PromptClient.js');

/**
 * AISessionManager - Thin facade over the {@link PromptClient} transport
 * boundary and the {@link PromptBuilder} prompt construction boundary.
 *
 * Preserved here as the AIChat view's current entry point so that the
 * Inspector AI Assistant tab continues to behave identically while
 * Assistant Architecture V1 carves out clearly named seams. The Chrome
 * extension port protocol (`prompt-api`) is now owned solely by PromptClient;
 * AISessionManager no longer talks to `chrome.runtime` directly.
 *
 * @param {Object} [options]
 * @param {PromptClient} [options.promptClient] - Pre-built Prompt Client for tests.
 * @param {PromptBuilder} [options.promptBuilder] - Pre-built Prompt Builder for tests.
 * @constructor
 */
function AISessionManager(options) {
    options = options || {};
    this._promptBuilder = options.promptBuilder || new PromptBuilder();
    this._promptClient = options.promptClient || new PromptClient();
}

/**
 * Check if the Prompt API is available.
 * @returns {Promise<{available: boolean, status: string, message: string}>}
 */
AISessionManager.prototype.checkAvailability = function () {
    return this._promptClient.checkAvailability();
};

/**
 * Download the Gemini Nano model.
 * @param {Function} onProgress - Callback for download progress (0-1)
 * @returns {Promise<void>}
 */
AISessionManager.prototype.downloadModel = function (onProgress) {
    return this._promptClient.downloadModel(onProgress);
};

/**
 * Create a new AI session with optional initial prompts (system + history).
 * @param {Array} initialPrompts - Optional [{role, content}, ...]; first should be 'system'.
 * @returns {Promise<boolean>} - True if session created successfully
 */
AISessionManager.prototype.createSession = function (initialPrompts) {
    return this._promptClient.createSession(initialPrompts);
};

/**
 * Build the system prompt content for a given app context.
 * @param {Object} [appInfo] - Optional application metadata snapshot.
 * @returns {string}
 */
AISessionManager.prototype.buildSystemPrompt = function (appInfo) {
    return this._promptBuilder.buildSystemPrompt(appInfo);
};

/**
 * Build the seed message array used to create a new local AI session.
 * Delegates to the PromptBuilder so the textual shape of system prompt and
 * Conversation Memory replay is owned in a single place.
 * @param {Object} [appInfo] - Optional application metadata snapshot.
 * @param {Array} [conversationMemory] - Prior chat turns ({role, content}) to replay.
 * @returns {Array<{role: string, content: string}>}
 */
AISessionManager.prototype.buildSeedMessages = function (appInfo, conversationMemory) {
    return this._promptBuilder.buildSeedMessages(appInfo, conversationMemory);
};

/**
 * Build a per-turn user prompt that injects Inspection Context and forward
 * it to the Prompt Client transport. The session retains its own history,
 * so only the new user message is sent here. System prompt and prior turns
 * are seeded at session creation time.
 *
 * @param {string} userMessage - Current user message
 * @param {Object} context - Optional Inspection Context (control data)
 * @returns {Promise<AsyncIterable<string>>}
 */
AISessionManager.prototype.promptStreaming = function (userMessage, context) {
    var formattedMessage = this._promptBuilder.buildUserPrompt(userMessage, context);
    return this._promptClient.promptStreaming(formattedMessage);
};

/**
 * Get session usage information.
 * @returns {Promise<Object|null>} - {inputUsage, inputQuota, percentUsed}
 */
AISessionManager.prototype.getUsageInfo = function () {
    return this._promptClient.getUsageInfo();
};

/**
 * Destroy the current session and free resources.
 */
AISessionManager.prototype.destroy = function () {
    this._promptClient.destroy();
};

/**
 * Check if a session is currently active.
 * @returns {boolean}
 */
AISessionManager.prototype.hasActiveSession = function () {
    return this._promptClient.hasActiveSession();
};

module.exports = AISessionManager;
