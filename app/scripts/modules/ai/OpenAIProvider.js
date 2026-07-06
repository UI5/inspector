'use strict';

/**
 * AI Provider backed by any OpenAI-compatible HTTP endpoint (real OpenAI, Ollama, LM Studio, Groq,
 * etc.). Streams responses via SSE. All network I/O goes through `options.fetch`, defaulting to
 * `window.fetch`, so tests can inject a fake at the constructor seam.
 *
 * @param {Object} config
 * @param {string} config.baseUrl - e.g. `http://localhost:6655/openai/v1`. No trailing `/`.
 * @param {string} config.apiKey  - Bearer token. Never included in error messages or logs.
 * @param {string} config.model   - Model identifier passed to the API.
 * @param {Function} [config.fetch] - Test seam. Defaults to the global `fetch`.
 * @constructor
 */
function OpenAIProvider(config) {
    const cfg = config || {};
    this._baseUrl = cfg.baseUrl || '';
    this._apiKey = cfg.apiKey || '';
    this._model = cfg.model || '';
    this._fetch = cfg.fetch || (typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null);
    this._abortController = null;
}

const DONE = Symbol('sse-done');

function abortError() {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
}

function extractErrorMessage(response) {
    return response.json().then(
        function (body) {
            if (body && body.error && body.error.message) {
                return body.error.message;
            }
            return 'HTTP ' + response.status;
        },
        function () {
            return 'HTTP ' + response.status;
        }
    );
}

function parseSseEvent(event) {
    const trimmed = event.trim();
    if (!trimmed.startsWith('data:')) {
        return '';
    }
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') {
        return DONE;
    }
    try {
        const parsed = JSON.parse(payload);
        const choices = parsed && parsed.choices;
        if (!choices || !choices.length) {
            return '';
        }
        const delta = choices[0].delta;
        return (delta && typeof delta.content === 'string') ? delta.content : '';
    } catch (e) {
        return '';
    }
}

function readSseStream(body, onChunk, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    function pump() {
        if (signal && signal.aborted) {
            reader.cancel();
            return Promise.reject(abortError());
        }
        return reader.read().then(function (result) {
            if (result.done) {
                return fullText;
            }
            buffer += decoder.decode(result.value, { stream: true });

            let separatorIdx = buffer.indexOf('\n\n');
            while (separatorIdx !== -1) {
                const event = buffer.slice(0, separatorIdx);
                buffer = buffer.slice(separatorIdx + 2);

                const delta = parseSseEvent(event);
                if (delta === DONE) {
                    reader.cancel();
                    return fullText;
                }
                if (delta) {
                    fullText += delta;
                    if (typeof onChunk === 'function') {
                        onChunk(delta);
                    }
                }
                separatorIdx = buffer.indexOf('\n\n');
            }
            return pump();
        }, function (err) {
            if (signal && signal.aborted) {
                throw abortError();
            }
            throw err;
        });
    }

    return pump();
}

/**
 * Return `ready` iff `baseUrl`, `apiKey`, and `model` are all set. No network ping.
 * @returns {Promise<{status: string, message: string}>}
 */
OpenAIProvider.prototype.checkAvailability = function () {
    if (this._baseUrl && this._apiKey && this._model) {
        return Promise.resolve({ status: 'ready', message: 'Ready' });
    }
    return Promise.resolve({ status: 'unavailable', message: 'not configured' });
};

/**
 * POST `messages` to `${baseUrl}/chat/completions` with `stream: true`, parse the SSE response,
 * forward content deltas via `onChunk`, and resolve with the accumulated full text.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {{onChunk?: Function, signal?: AbortSignal}} [options]
 * @returns {Promise<string>}
 */
OpenAIProvider.prototype.sendMessage = function (messages, options) {
    const opts = options || {};

    if (!Array.isArray(messages) || messages.length === 0) {
        return Promise.reject(new Error('sendMessage: messages must be a non-empty array'));
    }
    if (opts.signal && opts.signal.aborted) {
        return Promise.reject(abortError());
    }

    const internalController = new AbortController();
    this._abortController = internalController;
    const combinedSignal = opts.signal ?
        AbortSignal.any([opts.signal, internalController.signal]) :
        internalController.signal;

    const url = this._baseUrl + '/chat/completions';
    const body = JSON.stringify({
        model: this._model,
        messages: messages,
        stream: true
    });
    const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + this._apiKey
    };

    return this._fetch(url, {
        method: 'POST',
        headers: headers,
        body: body,
        signal: combinedSignal
    }).then(function (response) {
        if (!response.ok) {
            return extractErrorMessage(response).then(function (msg) {
                throw new Error(msg);
            });
        }
        return readSseStream(response.body, opts.onChunk, combinedSignal);
    });
};

OpenAIProvider.prototype.destroy = function () {
    if (this._abortController) {
        this._abortController.abort();
        this._abortController = null;
    }
};

module.exports = OpenAIProvider;
