const ODataNode = require('./ODataNode.js');
const multipartmixed2har = require('./multipartmixed2har.js');
const formatXML = require('prettify-xml');

/**
 * @constructor
 */
function EntriesLog () {
    this.oEditorContent = {};
    this.oNoResponseMessage = {};
    this._index = 0;
}

/**
 * Creates Log entry node.
 * @param {Object} entry - OData entry
 * @returns {Object} HTML Node
 */
EntriesLog.prototype.getEntryNode = function (entry) {
    /* jshint maxcomplexity: 16 */
    let oNode;
    let aNodes = [];

    /**
     * Finds current OData version.
     * @param {Object} el - headers element
     */
    const odataVersion = entry.response.headers.find(el => el.name.toLowerCase() === 'odata-version' || el.name.toLowerCase() === 'dataserviceversion');

    if (odataVersion && (
        odataVersion.value === '4.0' ||
        odataVersion.value === '3.0' ||
        odataVersion.value === '2.0'
    )) {
        const contentIndex = this._nextIndex();
        const bIsBatch = entry.response.content.mimeType.includes('multipart/mixed');
        const classes = !(
                entry.request.method === 'HEAD' ||
                bIsBatch
            ) && 'clickable' || '';
        const options = {
            id: contentIndex,
            classes: classes,
            url: entry.request.url,
            status: entry.response.status,
            method: entry.request.method,
            note: `${this._formatDateTime(entry.startedDateTime)} : ${this._formatDuration(entry.time)} ms`,
            isBatch: bIsBatch
        };
        bIsBatch && (options.classes += ' batch');
        oNode = this._createNode(options);

        if (entry.response.content.mimeType.includes('application/xml')) {
            /**
             * @param {Object} content
             */
            multipartmixed2har.getContent(entry).then(content => {
                this.oEditorContent[contentIndex] = {type: 'xml', content: formatXML(content)};
            });
        } else if (bIsBatch) {
            const serviceUrl = entry.request.url.split('$batch')[0];
            /**
             * @param {Array} childEntries
             */
            multipartmixed2har.extractMultipartEntry(entry).then(childEntries => {
                aNodes = this._showEmbeddedRequests(childEntries, serviceUrl);
                this.oNoResponseMessage[contentIndex] = 'See the split responses of this batch request';
                aNodes.forEach(function (oChildNode) {
                    Array.isArray(oChildNode) ? oNode.appendChild(oChildNode[0]) : oNode.appendChild(oChildNode);
                });
            });

        } else if (entry.response.content.mimeType.includes('application/json')) {
            delete entry._initiator;
            /**
             * @param {Object} content
             */
            multipartmixed2har.getContent(entry).then(content => {
                entry.response._content = JSON.parse(content || '{}');
                this.oEditorContent[contentIndex] = {type: 'json', content: JSON.stringify(entry, null, 2)};
            });
        } else if (entry.response.content.mimeType.includes('text/plain')) {
            /**
             * @param {Object} content
             */
            multipartmixed2har.getContent(entry).then(content => {
                this.oEditorContent[contentIndex] = {type: 'text', content: content};
            });
        }
    } else if (entry.response.status > 299 && entry.response.content.mimeType.includes('application/xml')) {
        const contentIndex = this._nextIndex();
        const options = {
            id: contentIndex,
            classes: 'clickable error',
            url: entry.request.url,
            status: entry.response.status,
            method: entry.request.method,
            note: `${entry.startedDateTime}: ${entry.time} ms`
        };
        oNode = this._createNode(options);

        /**
         * @param {Object} content
         */
        multipartmixed2har.getContent(entry).then(content => {
            this.oEditorContent[contentIndex] = {type: 'xml', content: formatXML(content)};
        });
    } else if (entry._error === 'net::ERR_CONNECTION_REFUSED') {
        const contentIndex = this._nextIndex();
        const options = {
            classes: 'error',
            url: entry.request.url,
            status: entry.response.status,
            method: entry.request.method
        };
        oNode = this._createNode(options);
        this.oNoResponseMessage[contentIndex] = 'Check if the server went down or the network was interrupted';
    }

    return oNode;
};

/**
 * Shows embedded requests.
 * @param {Array} entries
 * @param {string} serviceUrl
 * @param {string} prefix
 * @returns {Array} mapped entries
 * @private
 */
EntriesLog.prototype._showEmbeddedRequests = function (entries, serviceUrl, prefix) {
    /**
     * Maps entry.
     * @param {Object} entry
     */
    return entries.map(entry => {
        if (entry.children) {
            return this._showEmbeddedRequests(entry.children, serviceUrl, entry.changeset);
        } else {
            const contentIndex = this._nextIndex();
            const classes = 'clickable secondLevel' +  (!entry.response || entry.response.status === 499) && 'warning' ||
                (entry.response && entry.response.status > 299 && ' error' || '' );

            this.oEditorContent[contentIndex] = {type: 'json', content: JSON.stringify(entry, null, 2)};
            const options = {
                id: contentIndex,
                classes: classes,
                url: `${prefix ? prefix +  '-> ' : ''} ${entry.request.url}`,
                status: entry.response.status,
                method: entry.request.method,
                note: `${entry.response.headers.location ? '<br/>&nbsp;&nbsp; -> ' + entry.response.headers.location : ''}`
            };

            return this._createNode(options);
        }
    });
};

/**
 * Returns editor content.
 * @param {number} iSelectedId
 * @returns {Object} editor content
 */
EntriesLog.prototype.getEditorContent = function (iSelectedId) {
    return this.oEditorContent[iSelectedId];
};

/**
 * Returns editor content.
 * @param {number} iSelectedId
 * @returns {string} No response message
 */
EntriesLog.prototype.getNoResponseMessage = function (iSelectedId) {
    return this.oNoResponseMessage[iSelectedId];
};

/**
 * Formats Datetime.
 * @param {Object} x - Datetime
 * @returns {Object} Datetime
 * @private
 */
EntriesLog.prototype._formatDateTime = function (x) {
    return x.match(/.+T(.+)Z/).pop();
};

/**
 * Formats Duration.
 * @param {Object} x - Datetime
 * @returns {number} Duration
 * @private
 */
EntriesLog.prototype._formatDuration = function (x) {
    return x.toPrecision(7);
};

/**
 * Return next Entry log index.
 * @returns {number} Index
 * @private
 */
EntriesLog.prototype._nextIndex = function () {
    return this._index++;
};

/**
 * Creates ODataNode.
 * @param {Object} options - settings
 * @returns {Object} ODataNode
 * @private
 */
EntriesLog.prototype._createNode = function (options) {
    options.name = options.url.split('/').pop();

    return new ODataNode(options);
};

module.exports = EntriesLog;
