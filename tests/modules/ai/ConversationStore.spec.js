'use strict';

const ConversationStore = require('../../../app/scripts/modules/ai/ConversationStore.js');

/**
 * In-memory fake of the `chrome.storage.local` surface.
 *
 * @returns {{storage: Object, data: Object}}
 */
function createFakeStorage() {
    const data = {};

    const storage = {
        get: function (keys, callback) {
            const result = {};
            keys.forEach(function (key) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            });
            callback(result);
        },
        set: function (items, callback) {
            Object.keys(items).forEach(function (key) {
                data[key] = items[key];
            });
            callback();
        },
        remove: function (keys, callback) {
            keys.forEach(function (key) {
                delete data[key];
            });
            callback();
        }
    };

    return {
        storage: storage,
        data: data
    };
}

describe('ConversationStore', function () {
    describe('constructor', function () {
        it('should throw when no storage surface is available so failures are loud rather than deferred to first use', function () {
            const originalChrome = window.chrome;
            // Force the "no Chrome" path.
            window.chrome = undefined;
            try {
                (function () {
                    new ConversationStore();
                }).should.throw(/storage/);
            } finally {
                window.chrome = originalChrome;
            }
        });
    });

    describe('#keyForUrl()', function () {
        it('should generate a storage key with the ai_chat_ prefix for the inspected URL', function () {
            const fake = createFakeStorage();
            const store = new ConversationStore({ storage: fake.storage });

            const key = store.keyForUrl('https://example.com');

            key.should.match(/^ai_chat_/);
        });

        it('should replace non-alphanumeric characters with underscores in the inspected URL', function () {
            const fake = createFakeStorage();
            const store = new ConversationStore({ storage: fake.storage });

            const key = store.keyForUrl('https://example.com/path?query=value');

            key.should.equal('ai_chat_https___example_com_path_query_value');
        });

        it('should fall back to a default key when the inspected URL is null, undefined, or empty', function () {
            const fake = createFakeStorage();
            const store = new ConversationStore({ storage: fake.storage });

            store.keyForUrl(null).should.equal('ai_chat_default');
            store.keyForUrl(undefined).should.equal('ai_chat_default');
            store.keyForUrl('').should.equal('ai_chat_default');
        });
    });

    describe('#load()', function () {
        it('should resolve with an empty array when no Conversation Memory has been stored for the inspected URL', function () {
            const fake = createFakeStorage();
            const store = new ConversationStore({ storage: fake.storage });

            return store.load('https://example.com').then(function (messages) {
                messages.should.deep.equal([]);
            });
        });

        it('should resolve with the stored Conversation Memory for the inspected URL keyed by the ai_chat_ shape', function () {
            const fake = createFakeStorage();
            const store = new ConversationStore({ storage: fake.storage });
            const key = store.keyForUrl('https://example.com');
            fake.data[key] = [
                { role: 'user', content: 'hello' },
                { role: 'assistant', content: 'hi there' }
            ];

            return store.load('https://example.com').then(function (messages) {
                messages.should.deep.equal([
                    { role: 'user', content: 'hello' },
                    { role: 'assistant', content: 'hi there' }
                ]);
            });
        });
    });

    describe('#append()', function () {
        it('should persist a chat turn under the ai_chat_ key for the inspected URL', function () {
            const fake = createFakeStorage();
            const store = new ConversationStore({ storage: fake.storage });
            const key = store.keyForUrl('https://example.com');

            return store.append('https://example.com', {
                role: 'user',
                content: 'hello'
            }).then(function () {
                fake.data[key].should.deep.equal([
                    { role: 'user', content: 'hello' }
                ]);
            });
        });

        it('should persist only role and content, never Inspection Context fields like timestamp', function () {
            const fake = createFakeStorage();
            const store = new ConversationStore({ storage: fake.storage });
            const key = store.keyForUrl('https://example.com');

            return store.append('https://example.com', {
                role: 'user',
                content: 'hello',
                timestamp: 12345,
                inspectionContext: { selectedControl: 'sap.m.Button' }
            }).then(function () {
                fake.data[key].should.deep.equal([
                    { role: 'user', content: 'hello' }
                ]);
            });
        });

        it('should enforce the retention limit by keeping only the most recent 50 chat turns', function () {
            const fake = createFakeStorage();
            const store = new ConversationStore({ storage: fake.storage });
            const key = store.keyForUrl('https://example.com');

            // Seed 50 turns so the next append exceeds the limit.
            const seeded = [];
            for (let i = 0; i < 50; i++) {
                seeded.push({ role: 'user', content: 'old-' + i });
            }
            fake.data[key] = seeded;

            return store.append('https://example.com', {
                role: 'assistant',
                content: 'newest'
            }).then(function () {
                fake.data[key].should.have.length(50);
                fake.data[key][0].should.deep.equal({ role: 'user', content: 'old-1' });
                fake.data[key][49].should.deep.equal({ role: 'assistant', content: 'newest' });
            });
        });
    });

    describe('#clear()', function () {
        it('should remove Conversation Memory for the inspected URL while leaving other URLs untouched', function () {
            const fake = createFakeStorage();
            const store = new ConversationStore({ storage: fake.storage });
            const keyA = store.keyForUrl('https://a.example.com');
            const keyB = store.keyForUrl('https://b.example.com');
            fake.data[keyA] = [{ role: 'user', content: 'a' }];
            fake.data[keyB] = [{ role: 'user', content: 'b' }];

            return store.clear('https://a.example.com').then(function () {
                Object.prototype.hasOwnProperty.call(fake.data, keyA).should.be.false;
                fake.data[keyB].should.deep.equal([{ role: 'user', content: 'b' }]);
            });
        });
    });
});
