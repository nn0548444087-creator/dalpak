#!/bin/bash
# Deploys the notification sender from Google Cloud Shell: bash d/functions/deploy.sh
set -e
cd "$(dirname "$0")/.."
echo '{"functions":{"source":"functions"}}' > firebase.json
(cd functions && npm install --silent)
firebase deploy --only functions --project dalpak --non-interactive --force
echo DEPLOY-OK
