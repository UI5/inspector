#!/usr/bin/env node
'use strict';

// Local MCP bridge daemon for the UI5 Inspector reproduction tooling.
//
// The DevTools extension cannot talk to stdio MCP servers directly, so this small daemon does it:
// it reads the configured MCP servers (the same `mcpServers` block Claude uses in ~/.claude.json,
// or a local mcp-bridge.config.json), launches each over stdio via the MCP SDK, and exposes them
// over a localhost WebSocket. The extension's background service worker connects to this socket and
// relays `list-tools` / `call-tool` requests.
//
// Protocol (JSON per WebSocket message):
//   → { requestId, type: 'list-tools' }
//   ← { requestId, type: 'tools', tools: [{ server, name, description }] }
//   → { requestId, type: 'call-tool', data: { server, name, args } }
//   ← { requestId, type: 'tool-result', result: { content: [...], isError? } }
//   ← { requestId, type: 'error', message }
//
// Run it with:  npm run mcp-bridge
// Add `playwright` / `snippix` entries to your mcpServers config and they light up automatically.

var fs = require('fs');
var os = require('os');
var path = require('path');
var WebSocket = require('ws');

var PORT = Number(process.env.MCP_BRIDGE_PORT || 7391);
var HOST = '127.0.0.1';

/**
 * The MCP SDK is ESM-only; load it dynamically from this CommonJS script.
 */
function loadSdk() {
    return Promise.all([
        import('@modelcontextprotocol/sdk/client/index.js'),
        import('@modelcontextprotocol/sdk/client/stdio.js')
    ]).then(function (mods) {
        return { Client: mods[0].Client, StdioClientTransport: mods[1].StdioClientTransport };
    });
}

/**
 * Read the MCP server definitions. Prefers a project-local mcp-bridge.config.json, then falls back
 * to ~/.claude.json's `mcpServers`. Returns a `{ name: { command, args, env } }` map.
 */
function readServerConfig() {
    var candidates = [
        path.resolve(process.cwd(), 'mcp-bridge.config.json'),
        path.join(os.homedir(), '.claude.json')
    ];
    for (var i = 0; i < candidates.length; i++) {
        try {
            var json = JSON.parse(fs.readFileSync(candidates[i], 'utf8'));
            var servers = json.mcpServers || json.servers || json;
            if (servers && typeof servers === 'object' && Object.keys(servers).length) {
                console.log('[mcp-bridge] using server config from ' + candidates[i]);
                return servers;
            }
        } catch (e) {
            // try next candidate
        }
    }
    console.warn('[mcp-bridge] no MCP server config found (looked in mcp-bridge.config.json, ~/.claude.json)');
    return {};
}

/**
 * Launch and connect every configured stdio MCP server. Failures are logged and skipped so one bad
 * server never takes the bridge down.
 */
function connectServers(sdk, config) {
    var names = Object.keys(config);
    var clients = {};
    return names.reduce(function (chain, name) {
        return chain.then(function () {
            var def = config[name] || {};
            if (!def.command) {
                return null;
            }
            var transport = new sdk.StdioClientTransport({
                command: def.command,
                args: def.args || [],
                env: Object.assign({}, process.env, def.env || {})
            });
            var client = new sdk.Client({ name: 'ui5-inspector-mcp-bridge', version: '1.0.0' }, { capabilities: {} });
            return client.connect(transport).then(function () {
                clients[name] = client;
                console.log('[mcp-bridge] connected: ' + name);
            }, function (error) {
                console.warn('[mcp-bridge] failed to start "' + name + '": ' + (error && error.message ? error.message : error));
            });
        });
    }, Promise.resolve()).then(function () {
        return clients;
    });
}

/**
 * Aggregate the tools of every connected server, each tagged with its server name.
 */
function listAllTools(clients) {
    var servers = Object.keys(clients);
    var tools = [];
    return servers.reduce(function (chain, server) {
        return chain.then(function () {
            return clients[server].listTools().then(function (res) {
                (res.tools || []).forEach(function (tool) {
                    tools.push({ server: server, name: tool.name, description: tool.description || '' });
                });
            }, function () {
                // skip a server that cannot list
            });
        });
    }, Promise.resolve()).then(function () {
        return tools;
    });
}

function callTool(clients, server, name, args) {
    var client = clients[server];
    if (!client) {
        return Promise.reject(new Error('MCP server not available: ' + server));
    }
    return client.callTool({ name: name, arguments: args || {} });
}

function handleRequest(clients, msg) {
    if (msg.type === 'list-tools') {
        return listAllTools(clients).then(function (tools) {
            return { requestId: msg.requestId, type: 'tools', tools: tools };
        });
    }
    if (msg.type === 'call-tool') {
        var data = msg.data || {};
        return callTool(clients, data.server, data.name, data.args).then(function (result) {
            return { requestId: msg.requestId, type: 'tool-result', result: result };
        });
    }
    return Promise.reject(new Error('unknown request type: ' + msg.type));
}

function startServer(clients) {
    var wss = new WebSocket.Server({ port: PORT, host: HOST });
    console.log('[mcp-bridge] listening on ws://' + HOST + ':' + PORT +
        ' (servers: ' + (Object.keys(clients).join(', ') || 'none') + ')');

    wss.on('connection', function (ws) {
        ws.on('message', function (data) {
            var msg;
            try {
                msg = JSON.parse(data.toString());
            } catch (e) {
                return;
            }
            handleRequest(clients, msg).then(function (reply) {
                ws.send(JSON.stringify(reply));
            }, function (error) {
                ws.send(JSON.stringify({
                    requestId: msg.requestId,
                    type: 'error',
                    message: error && error.message ? error.message : String(error)
                }));
            });
        });
    });

    wss.on('error', function (error) {
        console.error('[mcp-bridge] server error:', error && error.message ? error.message : error);
    });
}

loadSdk().then(function (sdk) {
    return connectServers(sdk, readServerConfig());
}).then(function (clients) {
    startServer(clients);
}).catch(function (error) {
    console.error('[mcp-bridge] fatal:', error && error.message ? error.message : error);
    process.exit(1);
});
