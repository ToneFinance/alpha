This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-onchain`](https://www.npmjs.com/package/create-onchain).

## Getting Started

First, install dependencies:

```bash
npm install
```

Next, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Deployment

This app is configured for static export and can be deployed to Cloudflare Pages.

### Automatic Deployment (Recommended)

**Set up Git-based automatic deployments:**

See [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md) for detailed instructions on:
- Connecting your Git repository to Cloudflare Pages
- Configuring automatic deployments on push
- Setting up preview deployments for PRs
- Custom domain configuration

**Quick setup:**
1. Go to [Cloudflare Pages Dashboard](https://dash.cloudflare.com/?to=/:account/pages)
2. Create a new project and connect to Git
3. Configure build settings:
   - Build command: `npm run build`
   - Build output directory: `out`
   - Root directory: `tone-alpha`

**After setup:** Every push to `main` automatically deploys to production!

### Manual Deployment

For one-off deployments or testing:

1. **First-time setup:**
   ```bash
   # Login to Cloudflare
   npx wrangler login
   ```

2. **Deploy:**
   ```bash
   npm run pages:deploy
   ```

3. **Preview locally:**
   ```bash
   npm run pages:dev
   ```

### Configuration

- `wrangler.toml` - Cloudflare Pages project configuration
- `next.config.ts` - Next.js static export settings (client-side only)
- `CLOUDFLARE_SETUP.md` - Detailed deployment guide

## Learn More

To learn more about OnchainKit, see our [documentation](https://docs.base.org/onchainkit).

To learn more about Next.js, see the [Next.js documentation](https://nextjs.org/docs).
