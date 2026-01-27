#!/bin/bash

# Deploy UI5 Inspector to SAP Artifactory
# Usage: ./deploy-to-artifactory.sh

REPO_BASE="https://common.repositories.cloud.sap/artifactory/ui5-inspector-releases"

echo "📦 UI5 Inspector - Deploy to Artifactory"
echo ""

# Check credentials
if [ -z "$ARTIFACTORY_USER" ] || [ -z "$ARTIFACTORY_TOKEN" ]; then
  echo "❌ Missing credentials. Set ARTIFACTORY_USER and ARTIFACTORY_TOKEN"
  exit 1
fi

# Check build artifact
if [ ! -f "package/ui5inspector.zip" ]; then
  echo "❌ package/ui5inspector.zip not found. Run 'npm install' first"
  exit 1
fi

# Get version
VERSION=$(grep '<version>' pom.xml | head -1 | sed 's/.*<version>\(.*\)<\/version>.*/\1/')

echo "Version: $VERSION"
echo "Artifact: package/ui5inspector.zip ($(du -h package/ui5inspector.zip | cut -f1))"
echo ""

# Confirm
read -p "Deploy to Artifactory? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled"
  exit 0
fi

# Deploy
echo ""
echo "Deploying..."
if mvn deploy -DskipTests; then
  echo ""
  echo "✅ Done! Browse: $REPO_BASE/com/sap/ui5/inspector/package/$VERSION/"
else
  echo ""
  echo "❌ Deployment failed"
  exit 1
fi
