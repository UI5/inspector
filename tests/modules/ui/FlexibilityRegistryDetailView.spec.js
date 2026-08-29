'use strict';

const FlexibilityRegistryDetailView = require('../../../app/scripts/modules/ui/FlexibilityRegistryDetailView.js');

describe('FlexibilityRegistryDetailView', function () {
    var fixtures = document.getElementById('fixtures');
    var editor;
    var view;
    var originalAce;
    var originalChrome;

    beforeEach(function () {
        fixtures.innerHTML = '<div id="flexibility-tab-detail"></div>';

        originalAce = window.ace;
        originalChrome = window.chrome;

        editor = {
            session: {
                setUseWrapMode: sinon.spy(),
                setTabSize: sinon.spy(),
                setMode: sinon.spy()
            },
            setTheme: sinon.spy(),
            setValue: sinon.spy(),
            getSession: function () {
                return this.session;
            }
        };

        window.ace = {
            edit: sinon.stub().returns(editor)
        };

        window.chrome = {
            devtools: {
                panels: {
                    themeName: 'light'
                }
            }
        };

        view = new FlexibilityRegistryDetailView('flexibility-tab-detail');
    });

    afterEach(function () {
        fixtures.innerHTML = '';
        if (originalAce === undefined) {
            delete window.ace;
        } else {
            window.ace = originalAce;
        }
        window.chrome = originalChrome;
    });

    describe('Constructor', function () {
        it('should create an ace editor inside the container', function () {
            window.ace.edit.calledWith('flexibility-editor').should.equal(true);
        });

        it('should configure the editor session', function () {
            editor.session.setUseWrapMode.calledWith(true).should.equal(true);
            editor.session.setTabSize.calledWith(2).should.equal(true);
            editor.session.setMode.calledWith('ace/mode/json').should.equal(true);
        });

        it('should apply the light theme by default', function () {
            editor.setTheme.calledWith('ace/theme/chrome').should.equal(true);
        });
    });

    describe('update', function () {
        it('should set the JSON stringified data in the editor', function () {
            var data = { changeType: 'propertyChange' };

            view.update(data);

            editor.setValue.calledWith(JSON.stringify(data, null, '\t')).should.equal(true);
        });
    });

    describe('clear', function () {
        it('should clear the editor content', function () {
            view.clear();

            editor.setValue.calledWith('', -1).should.equal(true);
        });
    });

    describe('_setTheme', function () {
        it('should apply the dark theme in dark mode', function () {
            window.chrome.devtools.panels.themeName = 'dark';

            view._setTheme();

            editor.setTheme.calledWith('ace/theme/vibrant_ink').should.equal(true);
        });
    });
});
