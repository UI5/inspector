![OpenUI5](http://openui5.org/images/OpenUI5_new_big_side.png)

[![Built with Grunt](https://cdn.gruntjs.com/builtwith.png)](http://gruntjs.com/)
[![Build Status](https://travis-ci.org/SAP/ui5-inspector.svg?branch=master)](https://travis-ci.org/SAP/ui5-inspector)
[![Coverage Status](https://coveralls.io/repos/SAP/ui5-inspector/badge.svg?branch=master&service=github)](https://coveralls.io/github/SAP/ui5-inspector?branch=master)
[![REUSE status](https://api.reuse.software/badge/github.com/SAP/ui5-inspector)](https://api.reuse.software/info/github.com/SAP/ui5-inspector)

# About UI5 Inspector

UI5 Inspector is a standard Chrome or Edge extension for debugging and getting to know UI5 applications.

It's free and open source: UI5 Inspector is licensed under the Apache License, Version 2.0.
See [LICENSE.txt](https://github.com/SAP/ui5-inspector/blob/master/LICENSE.txt) for more information.

## Direct download and use

The latest released version can be downloaded and installed as follows:

1. Download zip file from [Releases](https://github.com/SAP/ui5-inspector/releases)
2. Unpack to a directory
3. In Chrome open as url: `chrome://extensions/`. Alternatively, you can access `edge://extensions/` when in Edge. The extensions page is also reachable via the browser's menu.
4. Check “Developer mode” setting and then choose "Load unpacked extension..."
5. From the newly opened window select the folder to which the zip file was unpacked
6. Restart Chrome or Edge
7. Open a OpenUI5/SAPUI5 based web application like: [https://openui5.hana.ondemand.com/explored.html](https://openui5.hana.ondemand.com/explored.html)
8. Open Developer Tools via menu or shortcut F12 or Ctrl+Shift+I
9. Select the tab labeled 'UI5' in the Developer Tools

## Local development and use

You can get the source code locally and contribute to the project.

1. Clone the project locally: `git clone git@github.com:SAP/ui5-inspector.git`
2. Install dependencies with the following commands: `npm install`
3. In Chrome open as url: `chrome://extensions/`
4. Check “Developer mode” and then click "Load unpacked extension..."
5. From the newly opened window select the **dist** folder from the locally cloned project
6. Restart Chrome
7. Open a OpenUI5/SAPUI5 based web application like: [https://openui5.hana.ondemand.com/explored.html](https://openui5.hana.ondemand.com/explored.html)
8. Open the Developer Tools from the menu or by pressing F12 or Ctrl+Shift+I
9. In Developer Tools a new Tab UI5 is shown. Click on UI5.

## License

[![Apache 2](https://img.shields.io/badge/license-Apache%202-blue.svg)](./LICENSE.txt)
