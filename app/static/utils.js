// ── Upload overlay helpers ────────────────────────────────────────────────────
const overlay     = document.getElementById('upload-overlay');
const progressBar = document.getElementById('upload-progress-bar');
const progressPct = document.getElementById('upload-progress-pct');
const overlayMsg  = document.getElementById('upload-overlay-msg');

export function showUploadOverlay(msg = 'Uploading…') {
  overlayMsg.textContent      = msg;
  progressBar.style.width     = '0%';
  progressPct.textContent     = '0%';
  progressBar.classList.remove('indeterminate');
  overlay.hidden = false;
}

export function setOverlayMessage(msg) {
  overlayMsg.textContent          = msg;
  progressBar.classList.add('indeterminate');
  progressPct.textContent         = '';
}

export function hideUploadOverlay() {
  overlay.hidden = true;
}

function setProgress(pct) {
  progressBar.style.width = pct + '%';
  progressPct.textContent = pct + '%';
}

// ── XHR upload with progress ──────────────────────────────────────────────────
export function uploadWithProgress(url, formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      } else {
        progressBar.classList.add('indeterminate');
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid response from server')); }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener('error',  () => reject(new Error('Network error — server unreachable')));
    xhr.addEventListener('abort',  () => reject(new Error('Upload cancelled')));

    xhr.send(formData);
  });
}
