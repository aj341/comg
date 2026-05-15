#!/usr/bin/env sh
set -eu

rm -rf public
mkdir -p public

cp index.html privacy.html terms.html thank-you.html lesson-5-3.html CNAME public/
cp -R assets public/assets
cp -R claudemastery public/claudemastery

rm -f public/claudemastery/.gitkeep
