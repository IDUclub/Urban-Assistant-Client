# Urban-Assistant-Client

For local development of project creation from files, set `VITE_GMART_API` to
the full gMART service URL. The browser sends requests directly to this URL.
The gMART service must allow requests from the frontend origin (CORS).

To proxy Urban API requests during local development, set `VITE_URBAN_API` to
`/urban-api/v1` and `URBAN_API_PROXY_TARGET` to the Urban API server origin in
your local `.env`. This proxy is only available in the Vite development server;
use the deployed API URL or configure a reverse proxy for production.

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

This project is configured in SPA mode (`ssr: false`), so the production build contains static client assets only.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   └── client/    # Static assets
```
