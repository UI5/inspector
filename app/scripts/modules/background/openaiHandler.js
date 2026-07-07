'use strict';

const DONE = 'sse:done';

function redact(text, apiKey) {
    if (!apiKey || typeof text !== 'string') {
        return text;
    }
    return text.split(apiKey).join('[redacted]');
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
        const delta = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
        return delta && typeof delta.content === 'string' ? delta.content : '';
    } catch (e) {
        return '';
    }
}

function extractErrorMessage(response, apiKey) {
    const fallback = 'HTTP ' + response.status;
    return response.json().then(
        function (body) {
            const message = body && body.error && body.error.message;
            return message ? redact(message, apiKey) : fallback;
        },
        function () {
            return fallback;
        }
    );
}

function readSseStream(body, port, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    function pump() {
        if (signal.aborted) {
            reader.cancel();
            return;
        }
        return reader.read().then(function (result) {
            if (signal.aborted) {
                return;
            }
            if (result.done) {
                port.postMessage({ type: 'complete' });
                return;
            }
            buffer += decoder.decode(result.value, { stream: true });

            let separatorIdx = buffer.indexOf('\n\n');
            while (separatorIdx !== -1) {
                const event = buffer.slice(0, separatorIdx);
                buffer = buffer.slice(separatorIdx + 2);

                const delta = parseSseEvent(event);
                if (delta === DONE) {
                    reader.cancel();
                    port.postMessage({ type: 'complete' });
                    return;
                }
                if (delta) {
                    port.postMessage({ type: 'chunk', content: delta });
                }
                separatorIdx = buffer.indexOf('\n\n');
            }
            return pump();
        }, function (err) {
            if (signal.aborted) {
                return;
            }
            port.postMessage({ type: 'error', message: (err && err.message) || 'Stream error' });
        });
    }

    return pump();
}

/**
 * Background-side handler for the `openai-api` port. Handles one port instance: on `send`, kicks
 * off a `fetch` to `${baseUrl}/chat/completions`, parses the SSE response, and streams
 * `chunk`/`complete`/`error` messages back over the port. On `cancel` (or port disconnect), aborts
 * the in-flight fetch.
 *
 * The panel-side `OpenAIProvider` runs under a strict CSP (`default-src 'self'`) that blocks
 * cross-origin fetch. The background service worker has broad `host_permissions` and no such CSP,
 * so the network I/O lives here.
 *
 * @param {chrome.runtime.Port} port
 * @param {{fetch?: Function}} [options] - Test seam for `fetch`. Defaults to the global `fetch`.
 */
function attachOpenAIHandler(port, options) {
    const opts = options || {};
    const fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);

    let controller = null;

    function handleSend(message) {
        if (controller) {
            controller.abort();
        }
        controller = new AbortController();
        const signal = controller.signal;

        const config = message.config || {};
        const url = config.baseUrl + '/chat/completions';
        const body = JSON.stringify({
            model: config.model,
            messages: message.messages,
            stream: true
        });
        const headers = {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + config.apiKey
        };

        fetchImpl(url, { method: 'POST', headers: headers, body: body, signal: signal }).then(
            function (response) {
                if (signal.aborted) {
                    return;
                }
                if (!response.ok) {
                    return extractErrorMessage(response, config.apiKey).then(function (msg) {
                        if (!signal.aborted) {
                            port.postMessage({ type: 'error', message: msg });
                        }
                    });
                }
                return readSseStream(response.body, port, signal);
            },
            function (err) {
                if (signal.aborted) {
                    return;
                }
                port.postMessage({ type: 'error', message: redact((err && err.message) || 'Network error', config.apiKey) });
            }
        );
    }

    port.onMessage.addListener(function (message) {
        if (message.type === 'send') {
            handleSend(message);
        } else if (message.type === 'cancel') {
            if (controller) {
                controller.abort();
                controller = null;
            }
        }
    });

    port.onDisconnect.addListener(function () {
        if (controller) {
            controller.abort();
            controller = null;
        }
    });
}

module.exports = attachOpenAIHandler;
