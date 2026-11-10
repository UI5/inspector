![OpenUI5](docs/images/UI5_logo_wide.png)

[![Built with Grunt](https://cdn.gruntjs.com/builtwith.png)](http://gruntjs.com/)
[![CI](https://github.com/UI5/inspector/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/UI5/inspector/actions/workflows/ci.yml)
[![REUSE status](https://api.reuse.software/badge/github.com/UI5/inspector)](https://api.reuse.software/info/github.com/UI5/inspector)

# About UI5 Inspector

UI5 Inspector is a standard Chrome or Edge extension for debugging and getting to know applications built with OpenUI5, SAPUI5, or UI5 Web Components.

It's free and open source: UI5 Inspector is licensed under the Apache License, Version 2.0.
See [LICENSE.txt](https://github.com/UI5/inspector/blob/master/LICENSE.txt) for more information.

## Direct download and use

The latest released version can be downloaded and installed as follows:

1. Download zip file from [Releases](https://github.com/UI5/inspector/releases)
2. Unpack to a directory
3. In Chrome open as url: `chrome://extensions/`. Alternatively, you can access `edge://extensions/` when in Edge. The extensions page is also reachable via the browser's menu.
4. Check “Developer mode” setting and then choose "Load unpacked extension..."
5. From the newly opened window select the folder to which the zip file was unpacked
6. Restart Chrome or Edge
7. Open an OpenUI5 or SAPUI5 based web application, for example [OpenUI5](https://sdk.openui5.org/) or [SAPUI5](https://ui5.sap.com/)
8. Open the Developer Tools from the menu or by pressing F12 or Ctrl+Shift+I
9. Select the tab labeled 'UI5' in the Developer Tools

## Local development and use

You can get the source code locally and contribute to the project.

1. Clone the project locally: `git clone git@github.com:UI5/inspector.git`
2. Install dependencies with the following commands: `npm install`
3. In Chrome open the url `chrome://extensions/` (or `edge://extensions/` in Edge)
4. Check “Developer mode” and then click "Load unpacked extension..."
5. From the newly opened window select the **dist** folder from the locally cloned project
6. Restart Chrome or Edge
7. Open an OpenUI5 or SAPUI5 based web application, for example [OpenUI5](https://sdk.openui5.org/) or [SAPUI5](https://ui5.sap.com/)
8. Open the Developer Tools from the menu or by pressing F12 or Ctrl+Shift+I
9. Select the tab labeled 'UI5' in the Developer Tools

## License

[![Apache 2](https://img.shields.io/badge/license-Apache%202-blue.svg)](./LICENSE.txt)
