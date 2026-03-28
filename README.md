# PDF Tools

Browser-based PDF manipulation tools, self-hosted via Docker.

## Features

| Tool   | Version | Status  |
|--------|---------|---------|
| Crop   | v2.1.0  | Working |
| Join   | v2.2.0  | Working |
| Split  | v2.3.0  | Working |
| Rotate | —       | Planned |

## Changelog

### v2.3.0
- Added Split tool — upload a PDF, select pages via thumbnail grid, download a ZIP of individual PDFs

### v2.2.0
- Added Join tool — upload multiple PDFs, drag to reorder, merge into one file

### v2.1.0
- Added Crop tool — upload a PDF, draw a selection rectangle, download the cropped page

### v2.0.0
- Full rewrite as a browser-based web app (FastAPI + PDF.js)
- Docker deployment replacing the previous Windows desktop scripts
- Auto-updates via Watchtower

## Deployment

The image is built and pushed to [ghcr.io](https://github.com/rekirky/PDF-Tools/pkgs/container/pdf-tools) automatically on every push to `main`.

### Running on your server

```bash
docker compose up -d
```

Accessible at `http://your-server-ip:2345`.

[Watchtower](https://containrrr.dev/watchtower/) is included — it polls for a new image every 5 minutes and restarts the container automatically when one is available.

### Update manually

```bash
docker compose pull && docker compose up -d
```

## Local development

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```
