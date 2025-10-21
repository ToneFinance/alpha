# Cloudflare Pages Setup Guide

This guide explains how to set up automatic deployments on push via Cloudflare Pages.

## Prerequisites

- [ ] GitHub/GitLab repository with your code
- [ ] Cloudflare account
- [ ] Code pushed to your repository

## Setup Steps

### 1. Connect to Git

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Pages** in the sidebar
3. Click **"Create a project"**
4. Click **"Connect to Git"**
5. Authorize Cloudflare to access your GitHub/GitLab account
6. Select your repository from the list

### 2. Configure Build Settings

On the setup page, configure the following:

#### Project Name
```
tone-alpha
```

#### Production Branch
```
main
```
(or whatever your default branch is)

#### Framework Preset
```
Next.js (Static HTML Export)
```

#### Build Configuration

**Build command:**
```
npm install && npm run build
```

**Build output directory:**
```
out
```

**Root directory (if monorepo):**
```
tone-alpha
```
*Leave empty if the frontend is at the repo root*

**Install command (optional):**
```
npm install
```

#### Environment Variables

Click **"Add variable"** for each:

| Variable Name | Value |
|--------------|-------|
| `NODE_VERSION` | `20` |
| `NEXT_PUBLIC_PROJECT_NAME` | `tone-alpha` |
| `NEXT_PUBLIC_ONCHAINKIT_API_KEY` | `<your-api-key>` (if needed) |

### 3. Deploy

Click **"Save and Deploy"**

Your site will:
- Build automatically
- Deploy to a `*.pages.dev` URL
- Provide build logs in real-time

### 4. Custom Domain (Optional)

After deployment:
1. Go to your Pages project → **Custom domains**
2. Click **"Set up a custom domain"**
3. Enter your domain (e.g., `alpha.tone.finance`)
4. Follow DNS configuration instructions
5. Cloudflare will issue an SSL certificate automatically

## Automatic Deployment Workflow

### Production Deployments
- **Trigger**: Push to `main` branch
- **URL**: `https://tone-alpha.pages.dev`
- **Custom domain**: Your configured domain (if set up)

### Preview Deployments
- **Trigger**: Push to any branch or open a PR
- **URL**: `https://<commit-hash>.tone-alpha.pages.dev`
- **Purpose**: Test changes before merging

### Branch Deploy Controls

You can customize which branches trigger deployments:
1. Go to **Settings** → **Builds & deployments**
2. Under **Branch deployments**, configure:
   - **Production branch**: `main`
   - **Preview branches**: All branches, or select specific ones
   - **Branch name patterns**: Use wildcards (e.g., `feature/*`)

## Build Environment

Cloudflare Pages automatically provides:
- Node.js (version specified in environment variables)
- npm/yarn/pnpm
- Git
- Build cache for faster subsequent builds

## Monitoring & Debugging

### View Build Logs
1. Go to your Pages project
2. Click **"View build"** on any deployment
3. See real-time logs and any errors

### Rollback a Deployment
1. Go to **Deployments** tab
2. Find the previous successful deployment
3. Click **"Rollback to this deployment"**

### Cancel a Build
1. Go to **Deployments** tab
2. Click on the in-progress build
3. Click **"Cancel build"**

## Advanced Configuration

### Build Watch Paths
Limit deployments to specific file changes:
1. Go to **Settings** → **Builds & deployments**
2. Add **Build watch paths**: `tone-alpha/**`
3. Builds only trigger when files in this path change

### Build Caching
Cloudflare automatically caches:
- `node_modules/`
- `.next/cache/`
- Build artifacts

To clear cache:
1. Go to **Settings** → **Builds & deployments**
2. Click **"Clear build cache"**

### Deployment Notifications
Set up notifications in **Settings** → **Notifications**:
- Email notifications
- Webhook integrations
- Slack/Discord webhooks

## Troubleshooting

### Build Fails
- Check build logs for errors
- Verify `package.json` scripts are correct
- Ensure all dependencies are listed
- Check Node.js version compatibility

### Environment Variables Not Working
- Ensure variables start with `NEXT_PUBLIC_` for client-side access
- Rebuild after adding/changing variables
- Check variable names for typos

### Preview Deployments Not Working
- Verify preview branch settings
- Check that branch deploy controls allow the branch
- Ensure the branch has commits

## Useful Commands

After setup, you can still use Wrangler CLI:

```bash
# Manual deploy (useful for testing before pushing)
npm run pages:deploy

# Local preview with Cloudflare Workers runtime
npm run pages:dev

# Check deployment status
npx wrangler pages deployment list --project-name=tone-alpha

# View deployment logs
npx wrangler pages deployment tail --project-name=tone-alpha
```

## Configuration Files

**`wrangler.toml`** - Required for Cloudflare Pages projects:
- Defines project name and compatibility settings
- Specifies build output directory
- Enables observability features

**`next.config.ts`** - Next.js configuration:
- Enables static export mode
- Configures image optimization
- Webpack externals for Web3 libraries

**This setup uses Modern Cloudflare Pages:**
- ✅ Git-based deployments via dashboard (recommended)
- ✅ `wrangler.toml` for project configuration
- ✅ `wrangler pages` commands for manual deploys
- ✅ Integration with Workers Functions if needed later

**NOT using:**
- ❌ Legacy Workers Sites (deprecated)

## Resources

- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Next.js on Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
