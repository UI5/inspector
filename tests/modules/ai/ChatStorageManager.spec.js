'use strict';

var ChatStorageManager = require('../../../app/scripts/modules/ai/ChatStorageManager.js');

describe('ChatStorageManager', function () {
    var storageManager;

    beforeEach(function () {
        storageManager = new ChatStorageManager();
    });

    afterEach(function () {
        storageManager = null;
    });

    describe('Constructor', function () {
        it('should initialize with max messages limit of 50', function () {
            storageManager._maxMessages.should.equal(50);
        });
    });

    describe('#_getKey()', function () {
        it('should generate key with ai_chat_ prefix', function () {
            var key = storageManager._getKey('https://example.com');
            key.should.match(/^ai_chat_/);
        });

        it('should replace non-alphanumeric characters with underscores', function () {
            var key = storageManager._getKey('https://example.com/path?query=value');
            key.should.equal('ai_chat_https___example_com_path_query_value');
        });

        it('should handle null URL with default key', function () {
            var key = storageManager._getKey(null);
            key.should.equal('ai_chat_default');
        });

        it('should handle undefined URL with default key', function () {
            var key = storageManager._getKey(undefined);
            key.should.equal('ai_chat_default');
        });

        it('should handle special characters', function () {
            var key = storageManager._getKey('http://test.com/?foo=bar&baz=qux');
            key.should.equal('ai_chat_http___test_com__foo_bar_baz_qux');
        });

        it('should handle empty string with default', function () {
            var key = storageManager._getKey('');
            key.should.equal('ai_chat_default');
        });
    });
});
