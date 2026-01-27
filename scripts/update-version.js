const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
console.log('Updating version - ' + args[0]);

const packagePath = path.join(path.dirname(__dirname), 'package.json');
const manifestPath = path.join(path.dirname(__dirname), 'app/manifest.json');
const pomPath = path.join(path.dirname(__dirname), 'pom.xml');

const version = args[0];
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const pomXml = fs.readFileSync(pomPath, 'utf8');

packageJson.version = version;
manifestJson.version = version;

// Update pom.xml version using regex (targets project version, not plugin versions)
const updatedPomXml = pomXml.replace(
    /(<artifactId>package<\/artifactId>\s*\n\s*<version>)[\d.]+(<\/version>)/,
    `$1${version}$2`
);

try {
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 4));
    fs.writeFileSync(pomPath, updatedPomXml);
    console.log('Update successful');
} catch (err) {
    console.error(err);
}
