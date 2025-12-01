# GitHub Actions Deployment Setup

This document explains how to configure the GitHub Actions CI/CD pipeline for automatic deployment to your homelab.

## Workflow Overview

The deployment workflow consists of three jobs:

1. **Lint and Build** - Validates code quality and builds the TypeScript project
2. **Build and Push Docker Image** - Creates a Docker image and pushes it to GitHub Container Registry (GHCR)
3. **Deploy to Homelab** - Connects via Tailscale, SSHs into your homelab, and deploys the application

## Required GitHub Secrets

You need to configure the following secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

### Tailscale Secrets

- **`TAILSCALE_OAUTH_CLIENT_ID`** - OAuth client ID from Tailscale
- **`TAILSCALE_OAUTH_SECRET`** - OAuth secret from Tailscale

**How to get Tailscale OAuth credentials:**

1. Go to [Tailscale Admin Console](https://login.tailscale.com/admin/settings/oauth)
2. Generate a new OAuth client
3. Add the tag `tag:ci` to your ACL policy
4. Copy the Client ID and Client Secret

### Homelab SSH Secrets

- **`HOMELAB_SSH_HOST`** - Tailscale hostname or IP of your homelab server (e.g., `homelab.tail-scale.ts.net` or `100.x.x.x`)
- **`HOMELAB_SSH_USER`** - SSH username on your homelab server (e.g., `ubuntu`, `admin`)
- **`HOMELAB_SSH_KEY`** - Private SSH key for authentication (entire key including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`)
- **`HOMELAB_DEPLOY_PATH`** - Absolute path where the application should be deployed (e.g., `/home/ubuntu/time-tracker-backend`)

**How to generate SSH key for deployment:**

```bash
# On your local machine or GitHub Actions runner
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/homelab_deploy

# Copy the public key to your homelab server
ssh-copy-id -i ~/.ssh/homelab_deploy.pub user@homelab-ip

# Copy the PRIVATE key content to GitHub secrets
cat ~/.ssh/homelab_deploy
```

## Homelab Server Setup

### 1. Install Docker and Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose (if not included)
sudo apt-get update
sudo apt-get install docker-compose-plugin
```

### 2. Create Deployment Directory

```bash
# Create the deployment directory
mkdir -p /home/ubuntu/time-tracker-backend
cd /home/ubuntu/time-tracker-backend

# Create .env.production file with your production environment variables
nano .env.production
```

### 3. Setup SSH Access

Ensure the SSH public key from GitHub Actions is added to `~/.ssh/authorized_keys`:

```bash
# On your homelab server
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys  # Paste the public key here
chmod 600 ~/.ssh/authorized_keys
```

### 4. Install Tailscale on Homelab

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Start Tailscale
sudo tailscale up

# Note your Tailscale IP or hostname
tailscale ip -4
```

## Docker Compose Configuration

The workflow will copy `docker-compose.yml` to your homelab. Ensure your homelab has the `.env.production` file with all required environment variables:

```env
# Database
DATABASE_URL=your_database_url

# Redis
REDIS_HOST=your_redis_host
REDIS_PORT=6379

# Application
PORT=3210
NODE_ENV=production

# Add other required environment variables
```

## Triggering Deployments

The workflow triggers automatically on:

- **Push to `main` branch** - Automatic deployment
- **Manual trigger** - Go to Actions tab > Build, Push and Deploy > Run workflow

## Monitoring Deployments

1. Go to your repository on GitHub
2. Click on the **Actions** tab
3. Select the workflow run to see detailed logs
4. Each job (Lint, Build, Deploy) will show its progress and logs

## Troubleshooting

### SSH Connection Issues

```bash
# Test SSH connection from local machine
ssh -i ~/.ssh/homelab_deploy user@homelab-tailscale-ip

# Check SSH logs on homelab
sudo tail -f /var/log/auth.log
```

### Docker Issues

```bash
# Check running containers
docker ps

# View container logs
docker compose logs -f

# Restart containers
docker compose restart
```

### Tailscale Connection Issues

```bash
# Check Tailscale status
tailscale status

# Check if GitHub Actions can reach your homelab
ping homelab-tailscale-ip
```

## Security Best Practices

1. **Never commit secrets** - All sensitive data should be in GitHub Secrets
2. **Use SSH keys** - Don't use password authentication
3. **Limit SSH key permissions** - The deploy key should only have access to deployment directory
4. **Use Tailscale ACLs** - Restrict which devices can connect via Tailscale
5. **Rotate secrets regularly** - Update SSH keys and OAuth tokens periodically

## Image Registry

Docker images are pushed to GitHub Container Registry (GHCR) at:

```
ghcr.io/<your-username>/time-tracker-backend:latest
ghcr.io/<your-username>/time-tracker-backend:main-<commit-sha>
```

Images are automatically cleaned up on the homelab after deployment to save disk space.

## Notes

- The workflow uses `pnpm` as specified in your `package.json`
- Linting must pass before building the Docker image
- The Docker image must be successfully pushed before deployment
- Old Docker images are pruned automatically on the homelab to save space
- The deployment uses the `.env.production` file already present on your homelab server
