import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
import { showUploadOverlay, hideUploadOverlay, setOverlayMessage, uploadWithProgress } from '/static/utils.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

// ── State ─────────────────────────────────────────────────────────────────────
let pdfDoc        = null;
let sessionId     = null;
let selectedPages = new Set();
let selectedDegrees = 90;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const rotateUploadSection = document.getElementById('rotate-upload');
const rotateViewerSection = document.getElementById('rotate-viewer');
const rotateUploadZone    = document.getElementById('rotate-upload-zone');
const rotateFileInput     = document.getElementById('rotate-file-input');
const rotateThumbGrid     = document.getElementById('rotate-thumb-grid');
const rotateStatusEl      = document.getElementById('rotate-status');
const rotateCountLabel    = document.getElementById('rotate-count-label');
const rotateBtn           = document.getElementById('rotate-btn');
const rotateNewBtn        = document.getElementById('rotate-new-btn');
const selectAllBtn        = document.getElementById('rotate-select-all');
const selectNoneBtn       = document.getElementById('rotate-select-none');
const rotateOpts          = document.querySelectorAll('.rotate-opt');

// ── Upload zone ───────────────────────────────────────────────────────────────
rotateUploadZone.addEventListener('click', () => rotateFileInput.click());

rotateUploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  rotateUploadZone.classList.add('drag-over');
});
rotateUploadZone.addEventListener('dragleave', () => rotateUploadZone.classList.remove('drag-over'));
rotateUploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  rotateUploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
rotateFileInput.addEventListener('change', () => {
  if (rotateFileInput.files[0]) handleFile(rotateFileInput.files[0]);
  rotateFileInput.value = '';
});

// ── Rotation selector ─────────────────────────────────────────────────────────
rotateOpts.forEach(btn => {
  btn.addEventListener('click', () => {
    rotateOpts.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDegrees = parseInt(btn.dataset.degrees);
  });
});

// ── File handling ─────────────────────────────────────────────────────────────
async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('Please select a PDF file.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  showUploadOverlay();
  let data;
  try {
    data = await uploadWithProgress('/api/rotate/upload', formData);
  } catch (err) {
    hideUploadOverlay();
    setStatus(err.message, 'error');
    return;
  }

  sessionId = data.session_id;

  setOverlayMessage('Loading PDF…');
  try {
    pdfDoc = await pdfjsLib.getDocument(`/api/rotate/pdf/${sessionId}`).promise;
  } catch {
    hideUploadOverlay();
    setStatus('Could not render PDF.', 'error');
    return;
  }

  setOverlayMessage(`Rendering ${pdfDoc.numPages} page(s)…`);
  rotateUploadSection.hidden = false;
  rotateUploadZone.hidden    = true;
  rotateViewerSection.hidden = false;

  await renderThumbnails();
  hideUploadOverlay();
  setStatus('Select pages and a rotation direction, then Rotate & Download.');
}

// ── Thumbnails ────────────────────────────────────────────────────────────────
async function renderThumbnails() {
  rotateThumbGrid.innerHTML = '';
  selectedPages.clear();

  for (let i = 0; i < pdfDoc.numPages; i++) {
    const page     = await pdfDoc.getPage(i + 1);
    const unscaled = page.getViewport({ scale: 1 });
    const scale    = 120 / unscaled.width;
    const viewport = page.getViewport({ scale });

    const item        = document.createElement('div');
    item.className    = 'thumb-item selected';
    item.dataset.page = i;

    const canvas     = document.createElement('canvas');
    canvas.width     = Math.floor(viewport.width);
    canvas.height    = Math.floor(viewport.height);
    canvas.className = 'thumb-canvas';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const check      = document.createElement('div');
    check.className  = 'thumb-check';
    check.innerHTML  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="11" height="11"><path d="M5 13l4 4L19 7"/></svg>`;

    const label      = document.createElement('div');
    label.className  = 'thumb-label';
    label.textContent = `Page ${i + 1}`;

    item.appendChild(canvas);
    item.appendChild(check);
    item.appendChild(label);

    item.addEventListener('click', () => setPageSelected(i, item, !selectedPages.has(i)));

    rotateThumbGrid.appendChild(item);
    selectedPages.add(i);
  }

  updateUI();
}

// ── Selection ─────────────────────────────────────────────────────────────────
function setPageSelected(index, item, selected) {
  if (selected) {
    selectedPages.add(index);
    item.classList.add('selected');
    item.classList.remove('deselected');
  } else {
    selectedPages.delete(index);
    item.classList.remove('selected');
    item.classList.add('deselected');
  }
  updateUI();
}

selectAllBtn.addEventListener('click', () => {
  rotateThumbGrid.querySelectorAll('.thumb-item').forEach(item => {
    setPageSelected(parseInt(item.dataset.page), item, true);
  });
});

selectNoneBtn.addEventListener('click', () => {
  rotateThumbGrid.querySelectorAll('.thumb-item').forEach(item => {
    setPageSelected(parseInt(item.dataset.page), item, false);
  });
});

function updateUI() {
  const count = selectedPages.size;
  const total = pdfDoc?.numPages ?? 0;
  rotateCountLabel.textContent = `${count} of ${total} selected`;
  rotateBtn.disabled = count === 0;
}

// ── Rotate & download ─────────────────────────────────────────────────────────
rotateBtn.addEventListener('click', async () => {
  if (!selectedPages.size || !sessionId) return;

  setStatus('Rotating…');
  rotateBtn.disabled = true;

  const body = {
    session_id: sessionId,
    pages:      Array.from(selectedPages),
    degrees:    selectedDegrees,
  };

  let res;
  try {
    res = await fetch('/api/rotate/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    setStatus('Rotate failed — server unreachable.', 'error');
    rotateBtn.disabled = false;
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    setStatus('Rotate failed: ' + err.detail, 'error');
    rotateBtn.disabled = false;
    return;
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match       = disposition.match(/filename="([^"]+)"/);
  const filename    = match ? match[1] : 'rotated.pdf';

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  setStatus('Done — file downloaded.', 'success');
  rotateBtn.disabled = false;
});

// ── New file ──────────────────────────────────────────────────────────────────
rotateNewBtn.addEventListener('click', () => {
  pdfDoc    = null;
  sessionId = null;
  selectedPages.clear();
  rotateThumbGrid.innerHTML   = '';
  rotateViewerSection.hidden  = true;
  rotateUploadZone.hidden     = false;
  setStatus('');
});

// ── Status helper ─────────────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  rotateStatusEl.textContent = msg;
  rotateStatusEl.className   = type;
}
