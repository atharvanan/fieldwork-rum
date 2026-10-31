# Azure Production Deployment Guide for Fieldwork RUM

This guide provides step-by-step instructions for deploying Fieldwork RUM to Microsoft Azure using enterprise best practices: **Azure Container Apps (ACA)** for serverless containers, **Azure Cosmos DB (MongoDB API)** or MongoDB Atlas on Azure for telemetry storage, and **Azure Container Registry (ACR)** for secure image delivery.

---

## 1. Architecture Overview

```
                      +---------------------------------------+
                      |       Azure Front Door / DNS          |
                      +-------------------+-------------------+
                                          |
                        +-----------------+-----------------+
                        |                                   |
                        v                                   v
             +--------------------+              +--------------------+
             |   Client App       |  /api/*      |   API Server       |
             |   (Next.js ACA)    | -----------> |   (Express ACA)    |
             |   Port 3000        | (rewrites)   |   Port 4000        |
             +--------------------+              +----------+---------+
                                                            |
                                                            v
                                                 +--------------------+
                                                 | Azure Cosmos DB    |
                                                 | (MongoDB v7 API)   |
                                                 +--------------------+
```

---

## 2. Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed and authenticated (`az login`)
- Azure Subscription with Owner or Contributor access
- Active Git repository with GitHub Actions enabled

---

## 3. Azure Infrastructure Setup

### Step 1: Create Resource Group and Container Registry

```bash
# Variables
RESOURCE_GROUP="fieldwork-prod-rg"
LOCATION="eastus"
ACR_NAME="fieldworkcr$RANDOM"
ACA_ENV="fieldwork-aca-env"

# 1. Create Resource Group
az group create --name $RESOURCE_GROUP --location $LOCATION

# 2. Create Azure Container Registry
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

# 3. Create Container Apps Managed Environment
az containerapp env create \
  --name $ACA_ENV \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

### Step 2: Provision MongoDB Database

You have two options on Azure:

#### Option A: Azure Cosmos DB with MongoDB v7 vCore (Recommended for Managed Azure)
```bash
az cosmosdb create \
  --name "fieldwork-cosmos-db" \
  --resource-group $RESOURCE_GROUP \
  --kind MongoDB \
  --server-version 7.0 \
  --default-consistency-level Session
```

#### Option B: MongoDB Atlas on Azure
Create an M10+ cluster on MongoDB Atlas hosted in the matching Azure region (`eastus`), then copy your connection string (`mongodb+srv://...`).

---

## 4. Build and Push Container Images

Build and push the multi-stage Alpine images directly using Azure ACR Tasks (no local Docker required):

```bash
# Get ACR Login Server
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer --output tsv)

# Build and Push Backend API Image
az acr build \
  --registry $ACR_NAME \
  --image fieldwork-server:latest \
  ./server

# Build and Push Next.js Client Image
az acr build \
  --registry $ACR_NAME \
  --image fieldwork-client:latest \
  ./client
```

---

## 5. Deploy Container Apps

### Step 1: Deploy Server API

```bash
# Generate secure JWT secrets
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

# Retrieve ACR credentials
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value -o tsv)

# Deploy Backend Container App
az containerapp create \
  --name fieldwork-server \
  --resource-group $RESOURCE_GROUP \
  --environment $ACA_ENV \
  --image "$ACR_LOGIN_SERVER/fieldwork-server:latest" \
  --target-port 4000 \
  --ingress external \
  --registry-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --cpu 0.5 --memory 1.0Gi \
  --min-replicas 1 --max-replicas 10 \
  --env-vars \
    NODE_ENV="production" \
    PORT="4000" \
    MONGO_URI="<YOUR_MONGODB_URI>" \
    JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" \
    JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
    CLIENT_ORIGIN="https://fieldwork-client.$LOCATION.azurecontainerapps.io"
```

### Step 2: Deploy Client Frontend

```bash
SERVER_URL=$(az containerapp show --name fieldwork-server --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv)

# Deploy Next.js Frontend Container App
az containerapp create \
  --name fieldwork-client \
  --resource-group $RESOURCE_GROUP \
  --environment $ACA_ENV \
  --image "$ACR_LOGIN_SERVER/fieldwork-client:latest" \
  --target-port 3000 \
  --ingress external \
  --registry-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --cpu 0.5 --memory 1.0Gi \
  --min-replicas 1 --max-replicas 5 \
  --env-vars \
    NODE_ENV="production" \
    PORT="3000" \
    API_URL="https://$SERVER_URL"
```

---

## 6. GitHub Actions CI/CD for Azure

Add `.github/workflows/azure-cd.yml` to trigger automatic builds and zero-downtime rollouts on every push to `main`:

```yaml
name: Deploy to Azure Container Apps

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Azure Login
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Build & Deploy Server
        uses: azure/container-apps-deploy-action@v1
        with:
          acrName: ${{ secrets.AZURE_ACR_NAME }}
          containerAppName: fieldwork-server
          resourceGroup: fieldwork-prod-rg
          dockerfilePath: ./server/Dockerfile
          imageToBuild: ${{ secrets.AZURE_ACR_NAME }}.azurecr.io/fieldwork-server:${{ github.sha }}

      - name: Build & Deploy Client
        uses: azure/container-apps-deploy-action@v1
        with:
          acrName: ${{ secrets.AZURE_ACR_NAME }}
          containerAppName: fieldwork-client
          resourceGroup: fieldwork-prod-rg
          dockerfilePath: ./client/Dockerfile
          imageToBuild: ${{ secrets.AZURE_ACR_NAME }}.azurecr.io/fieldwork-client:${{ github.sha }}
```

---

## 7. Security & Compliance Checklist for Production

- [x] **SSRF Protection**: Internal loopback (`127.0.0.1`, `localhost`), private subnets (`10.x`, `172.16-31.x`, `192.168.x`), and Azure instance metadata (`169.254.169.254`) blocked in `audit.controller.js`.
- [x] **Non-Root Containers**: Server executes under user `node`, Client under `nextjs:nodejs`.
- [x] **Health Check Probes**: Configured on `/api/health` with automatic container restart upon failure.
- [x] **Rate Limiting**: Built-in IP rate limiters on ingestion (`POST /api/ingest`), authentication, and WCAG accessibility auditing (`20 audits/min`).
- [x] **Zero-Downtime Revisions**: Container Apps provisions blue-green deployment revisions before cutting over live HTTP traffic.

