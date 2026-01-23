#!/bin/bash
#
# Deploy to Stage Environment (pptnc-stage)
#
# Usage:
#   ./scripts/deploy-stage.sh           # Full deploy
#   ./scripts/deploy-stage.sh --dry-run # Show commands without executing
#   ./scripts/deploy-stage.sh --skip-tests # Skip test execution
#

set -e

# Configuration
PROJECT_ID="pptnc-stage"
REGION="us-east1"
SERVICE_NAME="pptnc-stage"
REGISTRY="us-east1-docker.pkg.dev/${PROJECT_ID}/pptnc/pptnc"
IMAGE_TAG="latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
DRY_RUN=false
SKIP_TESTS=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --help|-h)
      echo "Deploy PPTNC to Stage Environment"
      echo ""
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --dry-run      Show commands without executing"
      echo "  --skip-tests   Skip running tests before deploy"
      echo "  --help, -h     Show this help message"
      exit 0
      ;;
  esac
done

# Helper functions
log_step() {
  echo -e "\n${BLUE}==>${NC} ${1}"
}

log_success() {
  echo -e "${GREEN}✓${NC} ${1}"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} ${1}"
}

log_error() {
  echo -e "${RED}✗${NC} ${1}"
}

run_cmd() {
  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY-RUN]${NC} $*"
  else
    "$@"
  fi
}

# Change to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════╗"
echo "║     PPTNC - Deploy to Stage            ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

if [ "$DRY_RUN" = true ]; then
  log_warning "DRY-RUN mode - no commands will be executed"
fi

# Step 0: Pre-flight checks
log_step "Pre-flight checks"

if ! command -v pnpm &> /dev/null; then
  log_error "pnpm is not installed. Run: corepack enable && corepack prepare pnpm@latest --activate"
  exit 1
fi
log_success "pnpm is available"

if ! command -v docker &> /dev/null; then
  log_error "Docker is not installed or not in PATH"
  exit 1
fi
log_success "Docker is available"

if ! command -v gcloud &> /dev/null; then
  log_error "gcloud CLI is not installed or not in PATH"
  exit 1
fi
log_success "gcloud CLI is available"

if ! docker info &> /dev/null; then
  log_error "Docker daemon is not running"
  exit 1
fi
log_success "Docker daemon is running"

# Check gcloud auth
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1 &> /dev/null; then
  log_error "Not authenticated with gcloud. Run: gcloud auth login"
  exit 1
fi
GCLOUD_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1)
log_success "Authenticated as: $GCLOUD_ACCOUNT"

# Step 1: Run tests (optional)
if [ "$SKIP_TESTS" = false ]; then
  log_step "Running tests"
  run_cmd pnpm test
  log_success "Tests passed"
else
  log_warning "Skipping tests (--skip-tests flag)"
fi

# Step 2: Build Next.js
log_step "Building Next.js application"
run_cmd pnpm --filter @pptnc/web build
log_success "Next.js build completed"

# Step 3: Build Docker image (context = monorepo root)
log_step "Building Docker image"
run_cmd docker build -f apps/web/Dockerfile.stage -t ${SERVICE_NAME}:${IMAGE_TAG} .
log_success "Docker image built: ${SERVICE_NAME}:${IMAGE_TAG}"

# Step 4: Tag for Artifact Registry
log_step "Tagging image for Artifact Registry"
run_cmd docker tag ${SERVICE_NAME}:${IMAGE_TAG} ${REGISTRY}:${IMAGE_TAG}
log_success "Tagged: ${REGISTRY}:${IMAGE_TAG}"

# Step 5: Push to Artifact Registry
log_step "Pushing to Artifact Registry"
run_cmd docker push ${REGISTRY}:${IMAGE_TAG}
log_success "Image pushed to registry"

# Step 6: Deploy to Cloud Run
log_step "Deploying to Cloud Run"
run_cmd gcloud run deploy ${SERVICE_NAME} \
  --image=${REGISTRY}:${IMAGE_TAG} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --allow-unauthenticated
log_success "Deployed to Cloud Run"

# Done
echo -e "\n${GREEN}"
echo "╔════════════════════════════════════════╗"
echo "║     Deploy completed successfully!     ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# Get service URL
if [ "$DRY_RUN" = false ]; then
  SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(status.url)" 2>/dev/null || echo "")

  if [ -n "$SERVICE_URL" ]; then
    echo -e "Service URL: ${BLUE}${SERVICE_URL}${NC}"
  fi
fi

echo ""
