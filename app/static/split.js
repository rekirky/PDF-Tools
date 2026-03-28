import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
import { showUploadOverlay, hideUploadOverlay, setOverlayMessage, uploadWithProgress } from '/static/utils.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

// ── State ─────────────────────────────────────────────────────────────────────
let pdfDoc        = null;
let sessionId     = null;
let selectedPages = new Set();  // 0-indexed

// ── DOM refs ──────────────────────────────────────────────────────────────────
const splitUploadSection = document.getElementById('split-upload');
const splitViewerSection = document.getElementById('split-viewer');
const splitUploadZone    = document.getElementById('split-upload-zone');
const splitFileInput     = document.getElementById('split-file-input');
const splitThumbGrid     = document.getElementById('split-thumb-grid');
const splitStatusEl      = document.getElementById('split-status');
const splitCountLabel    = document.getElementById('split-count-label');
const splitBtn           = document.getElementById('split-btn');
const splitNewBtn        = document.getElementById('split-new-btn');
const selectAllBtn       = document.getElementById('split-select-all');
const selectNoneBtn      = document.getElementById('split-select-none');

// ── Upload zone ───────────────────────────────────────────────────────────────
splitUploadZone.addEventListener('click', () => splitFileInput.click());

splitUploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  splitUploadZone.classList.add('drag-over');
});
splitUploadZone.addEventListener('dragleave', () => splitUploadZone.classList.remove('drag-over'));
splitUploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  splitUploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
splitFileInput.addEventListener('change', () => {
  if (splitFileInput.files[0]) handleFile(splitFileInput.files[0]);
  splitFileInput.value = '';
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
    data = await uploadWithProgress('/api/split/upload', formData);
  } catch (err) {
    hideUploadOverlay();
    setStatus(err.message, 'error');
    return;
  }

  sessionId = data.session_id;

  setOverlayMessage('Loading PDF…');
  try {
    pdfDoc = await pdfjsLib.getDocument(`/api/split/pdf/${sessionId}`).promise;
  } catch {
    hideUploadOverlay();
    setStatus('Could not render PDF.', 'error');
    return;
  }

  setOverlayMessage(`Rendering ${pdfDoc.numPages} page(s)…`);
  splitUploadSection.hidden = false;
  splitUploadZone.hidden    = true;
  splitViewerSection.hidden = false;

  await renderThumbnails();
  hideUploadOverlay();
  setStatus('Click pages to deselect them, then Split & Download.');
}

// ── Thumbnails ────────────────────────────────────────────────────────────────
async function renderThumbnails() {
  splitThumbGrid.innerHTML = '';
  selectedPages.clear();

  for (let i = 0; i < pdfDoc.numPages; i++) {
    const page     = await pdfDoc.getPage(i + 1);
    const unscaled = page.getViewport({ scale: 1 });
    const scale    = 120 / unscaled.width;
    const viewport = page.getViewport({ scale });

    // Wrapper
    const item         = document.createElement('div');
    item.className     = 'thumb-item';
    item.dataset.page  = i;

    // PDF canvas
    const canvas    = document.createElement('canvas');
    canvas.width    = Math.floor(viewport.width);
    canvas.height   = Math.floor(viewport.height);
    canvas.className = 'thumb-canvas';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    // Checkmark badge — hidden via CSS when deselected
    const check       = document.createElement('div');
    check.className   = 'thumb-check';
    check.innerHTML   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="11" height="11"><path d="M5 13l4 4L19 7"/></svg>`;

    // Page label
    const label       = document.createElement('div');
    label.className   = 'thumb-label';
    label.textContent = `Page ${i + 1}`;

    item.appendChild(canvas);
    item.appendChild(check);
    item.appendChild(label);

    item.addEventListener('click', () => setPageSelected(i, item, !selectedPages.has(i)));

    splitThumbGrid.appendChild(item);
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
  splitThumbGrid.querySelectorAll('.thumb-item').forEach(item => {
    setPageSelected(parseInt(item.dataset.page), item, true);
  });
});

selectNoneBtn.addEventListener('click', () => {
  splitThumbGrid.querySelectorAll('.thumb-item').forEach(item => {
    setPageSelected(parseInt(item.dataset.page), item, false);
  });
});

function updateUI() {
  const count = selectedPages.size;
  const total = pdfDoc?.numPages ?? 0;
  splitCountLabel.textContent = `${count} of ${total} selected`;
  splitBtn.disabled = count === 0;
}

// ── Split & download ──────────────────────────────────────────────────────────
splitBtn.addEventListener('click', async () => {
  if (!selectedPages.size || !sessionId) return;

  setStatus('Splitting…');
  splitBtn.disabled = true;

  const body = {
    session_id: sessionId,
    pages: Array.from(selectedPages),
  };

  let res;
  try {
    res = await fetch('/api/split/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    setStatus('Split failed — server unreachable.', 'error');
    splitBtn.disabled = false;
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    setStatus('Split failed: ' + err.detail, 'error');
    splitBtn.disabled = false;
    return;
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match       = disposition.match(/filename="([^"]+)"/);
  const filename    = match ? match[1] : 'split.zip';

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  setStatus('Done — ZIP downloaded.', 'success');
  splitBtn.disabled = false;
});

// ── New file ──────────────────────────────────────────────────────────────────
splitNewBtn.addEventListener('click', () => {
  pdfDoc    = null;
  sessionId = null;
  selectedPages.clear();
  splitThumbGrid.innerHTML  = '';
  splitViewerSection.hidden = true;
  splitUploadZone.hidden    = false;
  setStatus('');
});

// ── Status helper ─────────────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  splitStatusEl.textContent = msg;
  splitStatusEl.className   = type;
}
