#!/usr/bin/env bash
# Single entry point for "build it, then prove it still works".
# Used identically by a developer locally and by .github/workflows/ci.yml, so
# the pipeline never drifts from what you can run on your machine.
#
#   bash scripts/ci.sh            # backend + frontend
#   bash scripts/ci.sh backend    # typecheck, build, black-box test suite (~35s)
#   bash scripts/ci.sh frontend   # lint + production build
#
# With CI=true (set by GitHub Actions) dependencies are installed with a clean
# `npm ci`. Locally they are only installed if node_modules is missing, so a
# run never wipes your working tree.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

install_deps() {
  local dir="$ROOT/$1"
  if [ -n "${CI:-}" ]; then
    npm ci --prefix "$dir"
  elif [ ! -d "$dir/node_modules" ]; then
    npm install --prefix "$dir"
  fi
}

run_backend() {
  install_deps product-catalog-service
  install_deps payment-simulator
  install_deps testcase

  step "Backend: typecheck (shop service + payment simulator)"
  npm run typecheck --prefix "$ROOT/product-catalog-service"
  npm run typecheck --prefix "$ROOT/payment-simulator"

  # `pretest` in testcase/ rebuilds product-catalog-service and payment-simulator
  # (tsc -> dist/) before Jest runs, so this step covers both "build" and "test".
  step "Backend: build + black-box test suite"
  npm test --prefix "$ROOT/testcase"
}

run_frontend() {
  install_deps storefront-client

  step "Frontend: lint"
  npm run lint --prefix "$ROOT/storefront-client"

  step "Frontend: unit + component tests"
  npm test --prefix "$ROOT/storefront-client"

  step "Frontend: production build"
  npm run build --prefix "$ROOT/storefront-client"
}

case "$TARGET" in
  backend)  run_backend ;;
  frontend) run_frontend ;;
  all)      run_backend; run_frontend ;;
  *)        echo "Usage: $0 [backend|frontend|all]" >&2; exit 2 ;;
esac

printf '\n\033[1;32mAll checks passed (%s).\033[0m\n' "$TARGET"
