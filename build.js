// Run this script to rebuild the frontend before deploying
// Prerequisites: Node.js 18+, pnpm
// Usage: node build.js
// This script is just a reminder — the public/ folder is already included in the zip.
// If you want to rebuild the frontend from source, set up the monorepo and run:
//   pnpm --filter @workspace/vcf-collector run build
// Then copy artifacts/vcf-collector/dist/public/ to this folder's public/ directory.
console.log("public/ folder is pre-built and included. Run 'npm start' to launch.");
