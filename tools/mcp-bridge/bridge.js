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
 * Expand `${workspaceFolder}` (VS Code's mcp.json convention) to the directory the bridge runs from.
 */
function _expandVars(value) {
    if (typeof value === 'string') {
        return value.split('${workspaceFolder}').join(process.cwd());
    }
    return value;
}

/**
 * Normalize one server definition: expand variables in command, args and env.
 */
function _expandDef(def) {
    var out = Object.assign({}, def);
    if (out.command) {
        out.command = _expandVars(out.command);
    }
    if (Array.isArray(out.args)) {
        out.args = out.args.map(_expandVars);
    }
    if (out.env && typeof out.env === 'object') {
        var env = {};
        Object.keys(out.env).forEach(function (key) {
            env[key] = _expandVars(out.env[key]);
        });
        out.env = env;
    }
    return out;
}

/**
 * Read and merge the MCP server definitions from every known config location, first-wins by name:
 * project-local mcp-bridge.config.json, then .vscode/mcp.json (VS Code's `servers` block, used for
 * snippix/ui5 here), then ~/.claude.json's `mcpServers`. Returns a `{ name: { command, args, env } }`
 * map with `${workspaceFolder}` expanded.
 */
function readServerConfig() {
    var candidates = [
        path.resolve(process.cwd(), 'mcp-bridge.config.json'),
        path.resolve(process.cwd(), '.vscode', 'mcp.json'),
        path.join(os.homedir(), '.claude.json')
    ];
    var merged = {};
    candidates.forEach(function (file) {
        var json;
        try {
            json = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) {
            return; // missing or invalid — skip
        }
        var servers = json.mcpServers || json.servers || {};
        if (!servers || typeof servers !== 'object') {
            return;
        }
        var added = [];
        Object.keys(servers).forEach(function (name) {
            if (!merged[name] && servers[name] && servers[name].command) {
                merged[name] = _expandDef(servers[name]);
                added.push(name);
            }
        });
        if (added.length) {
            console.log('[mcp-bridge] loaded from ' + file + ': ' + added.join(', '));
        }
    });
    if (!Object.keys(merged).length) {
        console.warn('[mcp-bridge] no MCP server config found (looked in mcp-bridge.config.json, .vscode/mcp.json, ~/.claude.json)');
    }
    return merged;
}

/**
 * Launch and connect every configured stdio MCP server. Failures are logged and skipped so one bad
 * server never takes the bridge down. Fills the shared `clients` map as each server connects, so
 * the WebSocket (started first) can serve whatever is ready without waiting for slow `npx` launches.
 */
function connectServers(sdk, config, clients) {
    var names = Object.keys(config);
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
    console.log('[mcp-bridge] listening on ws://' + HOST + ':' + PORT + ' — connecting MCP servers…');

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

// Start listening immediately so the extension can connect right away, then bring the MCP servers
// online in the background — a slow `npx` launch must not keep the WebSocket from opening.
loadSdk().then(function (sdk) {
    var clients = {};
    startServer(clients);
    return connectServers(sdk, readServerConfig(), clients);
}).then(function (clients) {
    console.log('[mcp-bridge] ready (servers: ' + (Object.keys(clients).join(', ') || 'none') + ')');
}).catch(function (error) {
    console.error('[mcp-bridge] fatal:', error && error.message ? error.message : error);
    process.exit(1);
});
