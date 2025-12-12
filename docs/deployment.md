# GCP Deployment Guide

This guide covers deploying the Thesis Validator platform (backend API + web dashboard) to Google Cloud Platform from a fresh GCP instance.

**Last Updated:** 2025-12-11

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Step 1: GCP Project Setup](#step-1-gcp-project-setup)
- [Step 2: Create Infrastructure](#step-2-create-infrastructure)
- [Step 3: Deploy Backend (Cloud Run)](#step-3-deploy-backend-cloud-run)
- [Step 4: Initialize Database and Skills](#step-4-initialize-database-and-skills)
- [Step 5: Deploy Frontend (Cloud Storage + CDN)](#step-5-deploy-frontend-cloud-storage--cdn)
- [Step 6: Configure Domain and HTTPS](#step-6-configure-domain-and-https)
- [CI/CD with Cloud Build](#cicd-with-cloud-build)
- [Monitoring and Observability](#monitoring-and-observability)
- [Troubleshooting](#troubleshooting)
- [Cost Optimization](#cost-optimization)

---

## Prerequisites

### Required Tools

Install these on your local machine or GCP Cloud Shell:

```bash
# 1. Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# 2. Docker (for building images locally, optional if using Cloud Build)
# https://docs.docker.com/get-docker/

# 3. Node.js 20+ (for local testing)
nvm install 20
nvm use 20

# 4. Git
sudo apt-get install git  # Debian/Ubuntu
# or use your package manager
```

### Required API Keys

Obtain these before starting deployment:

| Service | Purpose | Where to Get |
|---------|---------|--------------|
| **OpenAI API Key** | Text embeddings (`text-embedding-3-large`) | [platform.openai.com](https://platform.openai.com/) |
| **Tavily API Key** | Web search for research | [tavily.com](https://tavily.com/) |
| **JWT Secret** | Authentication tokens | Generate: `openssl rand -base64 32` |

> **Note:** When using Vertex AI on GCP, you do NOT need an Anthropic API key. Claude is accessed via Vertex AI using GCP service account credentials.

---

## Architecture Overview

```
+------------------------------------------------------------------------------+
|                           Google Cloud Platform                               |
+------------------------------------------------------------------------------+
|                                                                               |
|  +------------------+      +-----------------------------------------+       |
|  |   Cloud CDN      |      |              Cloud Run                  |       |
|  |   + Storage      |      |       (thesis-validator API)            |       |
|  |  (dashboard-ui)  |      |                                         |       |
|  +--------+---------+      +-------------------+---------------------+       |
|           |                                    |                              |
|           |           +------------------------+------------------------+    |
|           |           |                        |                        |    |
|           |    +------v------+    +------------v-----------+   +--------v--+ |
|           |    | Memorystore |    |       Cloud SQL        |   | Vertex AI | |
|           |    |   (Redis)   |    |     (PostgreSQL)       |   |  Claude   | |
|           |    +-------------+    +------------------------+   +-----------+ |
|           |                                                                   |
|  +--------v---------+                                                        |
|  | Secret Manager   |  (API keys, JWT secret, DB password)                   |
|  +------------------+                                                        |
|                                                                               |
+------------------------------------------------------------------------------+
```

### Components

| Component | GCP Service | Purpose |
|-----------|-------------|---------|
| Backend API | Cloud Run | Fastify REST API + WebSocket server |
| Database | Cloud SQL (PostgreSQL 16) | Engagements, hypotheses, evidence, metrics |
| Cache/Queue | Memorystore (Redis 7) | BullMQ job queue, caching |
| LLM | Vertex AI | Claude for AI reasoning |
| Embeddings | OpenAI API | text-embedding-3-large |
| Web Search | Tavily API | Research agent web searches |
| Frontend | Cloud Storage + CDN | React dashboard |
| Secrets | Secret Manager | API keys and credentials |
| Container Registry | Artifact Registry | Docker images |

---

## Step 1: GCP Project Setup

### 1.1 Set Environment Variables

```bash
# Set your configuration
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export SERVICE_NAME="thesis-validator"

# Authenticate and configure gcloud
gcloud auth login
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION
```

### 1.2 Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  redis.googleapis.com \
  sqladmin.googleapis.com \
  compute.googleapis.com \
  vpcaccess.googleapis.com \
  aiplatform.googleapis.com \
  storage.googleapis.com
```

### 1.3 Create Artifact Registry Repository

```bash
gcloud artifacts repositories create $SERVICE_NAME \
  --repository-format=docker \
  --location=$REGION \
  --description="Thesis Validator container images"
```

---

## Step 2: Create Infrastructure

### 2.1 Create VPC Connector (Required for Cloud Run to access Redis)

```bash
gcloud compute networks vpc-access connectors create thesis-validator-connector \
  --region=$REGION \
  --range=10.8.0.0/28 \
  --network=default
```

### 2.2 Create Memorystore Redis Instance

```bash
# Create Redis instance (Basic tier for dev/staging, Standard for production)
gcloud redis instances create thesis-validator-redis \
  --size=1 \
  --region=$REGION \
  --redis-version=redis_7_0 \
  --tier=basic \
  --network=default

# Get the Redis host IP (save this for later)
REDIS_HOST=$(gcloud redis instances describe thesis-validator-redis \
  --region=$REGION \
  --format="value(host)")
echo "Redis Host: $REDIS_HOST"
```

### 2.3 Create Cloud SQL PostgreSQL Instance

```bash
# Create Cloud SQL instance
gcloud sql instances create thesis-validator-postgres \
  --database-version=POSTGRES_16 \
  --tier=db-g1-small \
  --region=$REGION \
  --storage-auto-increase \
  --storage-size=10GB \
  --availability-type=zonal \
  --backup-start-time=03:00

# Create database
gcloud sql databases create thesis_validator \
  --instance=thesis-validator-postgres

# Generate a secure password
DB_PASSWORD=$(openssl rand -base64 24)
echo "Database Password: $DB_PASSWORD"  # Save this securely!

# Create user
gcloud sql users create thesis_validator \
  --instance=thesis-validator-postgres \
  --password="$DB_PASSWORD"

# Get the connection name
SQL_CONNECTION=$(gcloud sql instances describe thesis-validator-postgres \
  --format="value(connectionName)")
echo "SQL Connection: $SQL_CONNECTION"
```

### 2.4 Create Secrets in Secret Manager

```bash
# JWT Secret (generate a secure one)
JWT_SECRET=$(openssl rand -base64 32)
echo -n "$JWT_SECRET" | \
  gcloud secrets create thesis-validator-jwt-secret --data-file=-

# Database Password
echo -n "$DB_PASSWORD" | \
  gcloud secrets create thesis-validator-db-password --data-file=-

# OpenAI API Key (you'll need to enter this)
read -sp "Enter OpenAI API Key: " OPENAI_KEY
echo -n "$OPENAI_KEY" | \
  gcloud secrets create openai-api-key --data-file=-

# Tavily API Key
read -sp "Enter Tavily API Key: " TAVILY_KEY
echo -n "$TAVILY_KEY" | \
  gcloud secrets create tavily-api-key --data-file=-
```

### 2.5 Grant IAM Permissions

```bash
# Get service account names
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
CLOUD_RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Cloud Build permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/iam.serviceAccountUser"

# Cloud Run service account - Secret access
for SECRET in thesis-validator-jwt-secret thesis-validator-db-password openai-api-key tavily-api-key; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${CLOUD_RUN_SA}" \
    --role="roles/secretmanager.secretAccessor"
done

# Cloud Run service account - Vertex AI access (for Claude)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUD_RUN_SA}" \
  --role="roles/aiplatform.user"

# Cloud Run service account - Cloud SQL access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUD_RUN_SA}" \
  --role="roles/cloudsql.client"
```

---

## Step 3: Deploy Backend (Cloud Run)

### 3.1 Clone the Repository

```bash
git clone https://github.com/your-org/nextgen-CDD.git
cd nextgen-CDD
```

### 3.2 Option A: Deploy Using Cloud Build (Recommended)

This uses the included `cloudbuild.yaml` which runs tests and deploys automatically:

```bash
cd thesis-validator

# Submit build (this builds, tests, and deploys)
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_REGION=$REGION,_REPOSITORY=$SERVICE_NAME,_SERVICE_NAME=$SERVICE_NAME
```

### 3.3 Option B: Manual Build and Deploy

If you prefer to build and deploy manually:

```bash
cd thesis-validator

# Configure Docker for Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build the Docker image
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest .

# Push to Artifact Registry
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest

# Get connection info
REDIS_HOST=$(gcloud redis instances describe thesis-validator-redis \
  --region=$REGION --format="value(host)")
SQL_CONNECTION=$(gcloud sql instances describe thesis-validator-postgres \
  --format="value(connectionName)")

# Deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --concurrency=80 \
  --vpc-connector=thesis-validator-connector \
  --add-cloudsql-instances=${SQL_CONNECTION} \
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="LLM_PROVIDER=vertex-ai" \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --set-env-vars="GOOGLE_CLOUD_REGION=${REGION}" \
  --set-env-vars="REDIS_URL=redis://${REDIS_HOST}:6379" \
  --set-env-vars="DATABASE_URL=postgresql://thesis_validator:\${DB_PASSWORD}@/thesis_validator?host=/cloudsql/${SQL_CONNECTION}" \
  --set-env-vars="RUVECTOR_PATH=/tmp/ruvector" \
  --set-env-vars="CORS_ORIGINS=*" \
  --set-secrets="JWT_SECRET=thesis-validator-jwt-secret:latest" \
  --set-secrets="OPENAI_API_KEY=openai-api-key:latest" \
  --set-secrets="TAVILY_API_KEY=tavily-api-key:latest"
```

### 3.4 Verify Deployment

```bash
# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION --format="value(status.url)")
echo "Service URL: $SERVICE_URL"

# Test health endpoint
curl ${SERVICE_URL}/health
# Expected: {"status":"healthy","timestamp":...,"version":"1.0.0"}

# Test API endpoint
curl ${SERVICE_URL}/api/v1/skills
# Expected: {"skills":[...],"total":...}
```

---

## Step 4: Initialize Database and Skills

After the backend is deployed, you need to initialize the database schema and seed the skill library.

### 4.1 Run Database Migration

You can run this locally connecting to Cloud SQL via the Cloud SQL Auth Proxy, or create a Cloud Run job:

```bash
# Option 1: Using Cloud SQL Auth Proxy (local)
# Install the proxy: https://cloud.google.com/sql/docs/postgres/sql-proxy

# Start proxy in background
./cloud-sql-proxy ${SQL_CONNECTION} &

# Set environment and run migration
export DATABASE_URL="postgresql://thesis_validator:${DB_PASSWORD}@localhost:5432/thesis_validator"
cd thesis-validator
npm install
npm run db:migrate

# Option 2: Via the API (if your app supports it)
curl -X POST ${SERVICE_URL}/api/v1/admin/migrate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 4.2 Seed Skill Library

```bash
# Via Cloud SQL Proxy (local)
npm run seed:skills

# Or verify skills are seeded via API
curl ${SERVICE_URL}/api/v1/skills
```

---

## Step 5: Deploy Frontend (Cloud Storage + CDN)

### 5.1 Create Cloud Storage Bucket

```bash
FRONTEND_BUCKET="${PROJECT_ID}-dashboard-ui"

# Create bucket
gsutil mb -l $REGION gs://${FRONTEND_BUCKET}

# Configure for static website hosting
gsutil web set -m index.html -e index.html gs://${FRONTEND_BUCKET}

# Make publicly readable
gsutil iam ch allUsers:objectViewer gs://${FRONTEND_BUCKET}
```

### 5.2 Build and Deploy Frontend

```bash
cd dashboard-ui

# Install dependencies
npm ci

# Create production environment file with API URL
cat > .env.production << EOF
VITE_API_URL=${SERVICE_URL}
EOF

# Build for production
npm run build

# Upload to Cloud Storage
gsutil -m rsync -r -d dist/ gs://${FRONTEND_BUCKET}/

# Set cache headers for static assets
gsutil -m setmeta -h "Cache-Control:public, max-age=31536000" \
  "gs://${FRONTEND_BUCKET}/assets/**"

# Set short cache for index.html
gsutil setmeta -h "Cache-Control:no-cache, max-age=0" \
  "gs://${FRONTEND_BUCKET}/index.html"
```

### 5.3 Set Up Cloud CDN with Load Balancer

```bash
# Create backend bucket for CDN
gcloud compute backend-buckets create dashboard-ui-backend \
  --gcs-bucket-name=${FRONTEND_BUCKET} \
  --enable-cdn \
  --cache-mode=CACHE_ALL_STATIC

# Create URL map
gcloud compute url-maps create dashboard-ui-lb \
  --default-backend-bucket=dashboard-ui-backend

# Create HTTP proxy
gcloud compute target-http-proxies create dashboard-ui-http-proxy \
  --url-map=dashboard-ui-lb

# Reserve a static IP
gcloud compute addresses create dashboard-ui-ip --global

# Create forwarding rule
gcloud compute forwarding-rules create dashboard-ui-http \
  --global \
  --address=dashboard-ui-ip \
  --target-http-proxy=dashboard-ui-http-proxy \
  --ports=80

# Get the IP address
FRONTEND_IP=$(gcloud compute addresses describe dashboard-ui-ip \
  --global --format="value(address)")
echo "Frontend IP: $FRONTEND_IP"
echo "Access at: http://${FRONTEND_IP}"
```

---

## Step 6: Configure Domain and HTTPS

### 6.1 Set Up DNS

Point your domain to the frontend IP address:

```
A    dashboard.yourdomain.com    -> $FRONTEND_IP
A    api.yourdomain.com          -> (Cloud Run provides this automatically)
```

For the backend, you can use the Cloud Run custom domain mapping:

```bash
# Map custom domain to backend
gcloud run domain-mappings create \
  --service=$SERVICE_NAME \
  --domain=api.yourdomain.com \
  --region=$REGION
```

### 6.2 Set Up HTTPS for Frontend

```bash
DOMAIN="dashboard.yourdomain.com"

# Create managed SSL certificate
gcloud compute ssl-certificates create dashboard-ui-cert \
  --domains=$DOMAIN \
  --global

# Create HTTPS proxy
gcloud compute target-https-proxies create dashboard-ui-https-proxy \
  --url-map=dashboard-ui-lb \
  --ssl-certificates=dashboard-ui-cert

# Create HTTPS forwarding rule
gcloud compute forwarding-rules create dashboard-ui-https \
  --global \
  --address=dashboard-ui-ip \
  --target-https-proxy=dashboard-ui-https-proxy \
  --ports=443

# Update CORS in backend to allow your domain
gcloud run services update $SERVICE_NAME \
  --region=$REGION \
  --set-env-vars="CORS_ORIGINS=https://${DOMAIN}"
```

---

## CI/CD with Cloud Build

The project includes a `cloudbuild.yaml` that automates:

1. Install dependencies
2. Run linting
3. Run type checking
4. Run tests
5. Build Docker image
6. Push to Artifact Registry
7. Deploy to Cloud Run

### Set Up Build Triggers

```bash
# Connect to GitHub (do this in Cloud Console)
# Visit: https://console.cloud.google.com/cloud-build/triggers

# Or create trigger via CLI
gcloud builds triggers create github \
  --name="thesis-validator-main" \
  --repo-owner="your-org" \
  --repo-name="nextgen-CDD" \
  --branch-pattern="^main$" \
  --build-config="thesis-validator/cloudbuild.yaml" \
  --substitutions="_REGION=${REGION},_REPOSITORY=${SERVICE_NAME},_SERVICE_NAME=${SERVICE_NAME}"
```

### Frontend Build Trigger

Create `dashboard-ui/cloudbuild.yaml`:

```yaml
steps:
  - id: 'install'
    name: 'node:20-alpine'
    dir: 'dashboard-ui'
    entrypoint: 'npm'
    args: ['ci']

  - id: 'build'
    name: 'node:20-alpine'
    dir: 'dashboard-ui'
    entrypoint: 'npm'
    args: ['run', 'build']
    env:
      - 'VITE_API_URL=https://api.yourdomain.com'

  - id: 'deploy'
    name: 'gcr.io/cloud-builders/gsutil'
    args: ['-m', 'rsync', '-r', '-d', 'dashboard-ui/dist/', 'gs://${_BUCKET}/']

  - id: 'invalidate-cache'
    name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'gcloud'
    args: ['compute', 'url-maps', 'invalidate-cdn-cache', 'dashboard-ui-lb', '--path', '/*']

substitutions:
  _BUCKET: 'your-project-id-dashboard-ui'

timeout: '600s'
```

---

## Monitoring and Observability

### View Logs

```bash
# Stream Cloud Run logs
gcloud run services logs read $SERVICE_NAME --region=$REGION --tail=100

# Filter for errors
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=50 --format=json
```

### Set Up Alerts

```bash
# Create notification channel first (do this in Console)
# https://console.cloud.google.com/monitoring/alerting/notifications

# Example: Alert on high error rate
gcloud alpha monitoring policies create \
  --display-name="Thesis Validator Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count"'
```

### Console Links

| Component | Console URL |
|-----------|-------------|
| Cloud Run | https://console.cloud.google.com/run |
| Cloud SQL | https://console.cloud.google.com/sql |
| Memorystore | https://console.cloud.google.com/memorystore |
| Secret Manager | https://console.cloud.google.com/security/secret-manager |
| Artifact Registry | https://console.cloud.google.com/artifacts |
| Cloud Build | https://console.cloud.google.com/cloud-build |
| Cloud Logging | https://console.cloud.google.com/logs |
| Cloud Monitoring | https://console.cloud.google.com/monitoring |

---

## Troubleshooting

### Common Issues

#### 1. Cloud Run can't connect to Redis

**Symptom:** Connection refused errors to Redis

**Solution:**
```bash
# Verify VPC connector exists and is healthy
gcloud compute networks vpc-access connectors describe thesis-validator-connector \
  --region=$REGION

# Ensure Cloud Run is using the connector
gcloud run services describe $SERVICE_NAME --region=$REGION \
  --format="value(spec.template.spec.containers[0].env)"

# Redeploy with VPC connector
gcloud run services update $SERVICE_NAME \
  --vpc-connector=thesis-validator-connector \
  --region=$REGION
```

#### 2. Cloud SQL connection fails

**Symptom:** Database connection errors

**Solution:**
```bash
# Check Cloud SQL instance is running
gcloud sql instances describe thesis-validator-postgres --format="value(state)"

# Verify Cloud SQL connection string in Cloud Run
gcloud run services describe $SERVICE_NAME --region=$REGION

# Check IAM permissions
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/cloudsql.client"
```

#### 3. Secret access denied

**Symptom:** Permission denied accessing secrets

**Solution:**
```bash
# Grant access to each secret
for SECRET in thesis-validator-jwt-secret thesis-validator-db-password openai-api-key tavily-api-key; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${CLOUD_RUN_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

#### 4. Vertex AI Claude access denied

**Symptom:** 403 errors when calling Claude via Vertex AI

**Solution:**
1. Ensure Vertex AI API is enabled:
   ```bash
   gcloud services enable aiplatform.googleapis.com
   ```

2. Request Claude model access in GCP Console:
   - Go to Vertex AI > Model Garden
   - Search for "Claude" and request access

3. Grant IAM role:
   ```bash
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:${CLOUD_RUN_SA}" \
     --role="roles/aiplatform.user"
   ```

#### 5. Cold starts are slow

**Solution:** Set minimum instances:
```bash
gcloud run services update $SERVICE_NAME \
  --min-instances=1 \
  --region=$REGION
```

#### 6. CORS errors

**Symptom:** Browser shows CORS errors

**Solution:**
```bash
# Update CORS origins
gcloud run services update $SERVICE_NAME \
  --set-env-vars="CORS_ORIGINS=https://yourdomain.com,http://localhost:5173" \
  --region=$REGION
```

---

## Cost Optimization

### Development/Staging Settings

```bash
gcloud run deploy $SERVICE_NAME-staging \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --region=$REGION
```

### Production Recommendations

1. **Cloud SQL**: Use committed use discounts for predictable workloads
2. **Cloud Run**: Set appropriate `max-instances` to control costs
3. **Memorystore**: Use Basic tier for dev, Standard tier for production
4. **Cloud CDN**: Reduces egress costs for frontend
5. **Cloud Run**: Consider `--cpu-throttling` for background processing

### Cost Estimation (Monthly)

| Service | Dev/Staging | Production |
|---------|-------------|------------|
| Cloud Run | $10-30 | $50-200 |
| Cloud SQL | $25 | $50-100 |
| Memorystore | $25 | $50 |
| Cloud Storage + CDN | $5-10 | $10-50 |
| Vertex AI (Claude) | Variable | Variable |
| **Total** | ~$65-100 | ~$160-400 |

---

## Quick Reference

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (production, staging) | Yes |
| `LLM_PROVIDER` | `vertex-ai` for GCP | Yes |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | Yes |
| `GOOGLE_CLOUD_REGION` | GCP region | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection URL | Yes |
| `JWT_SECRET` | JWT signing secret | Yes (Secret) |
| `OPENAI_API_KEY` | OpenAI API key | Yes (Secret) |
| `TAVILY_API_KEY` | Tavily API key | Yes (Secret) |
| `CORS_ORIGINS` | Allowed CORS origins | Yes |

### Useful Commands

```bash
# View Cloud Run logs
gcloud run services logs read $SERVICE_NAME --region=$REGION

# Redeploy latest image
gcloud run deploy $SERVICE_NAME \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest \
  --region=$REGION

# Update environment variable
gcloud run services update $SERVICE_NAME \
  --set-env-vars="KEY=value" \
  --region=$REGION

# Scale down to zero
gcloud run services update $SERVICE_NAME \
  --min-instances=0 \
  --region=$REGION

# Delete all resources (careful!)
gcloud run services delete $SERVICE_NAME --region=$REGION
gcloud sql instances delete thesis-validator-postgres
gcloud redis instances delete thesis-validator-redis --region=$REGION
```

---

## Next Steps

After deployment:

1. **Test the application** - Create an engagement and run research
2. **Set up monitoring** - Configure Cloud Monitoring dashboards
3. **Configure backups** - Verify Cloud SQL backup schedule
4. **Set up CI/CD** - Connect GitHub triggers for automated deployment
5. **Configure custom domain** - Set up DNS and SSL certificates
6. **Review security** - Enable Cloud Armor for DDoS protection
