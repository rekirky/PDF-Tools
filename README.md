# PDF Tools

Browser-based PDF manipulation tools, self-hosted via Docker.

## Features

| Tool | Status |
|------|--------|
| Crop | Working |
| Join multiple files into one | Planned |
| Split file into individual pages | Planned |
| Rotate 90° clockwise / counter-clockwise | Planned |

## Deployment

The image is built and pushed to [ghcr.io](https://github.com/rekirky/PDF-Tools/pkgs/container/pdf-tools) automatically on every push to `main`.

### Run on Unraid

```bash
docker compose up -d
```

Accessible at `http://your-unraid-ip:2345`.

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
