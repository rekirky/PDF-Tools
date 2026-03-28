import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

// ── State ─────────────────────────────────────────────────────────────────────
let pdfDoc      = null;
let sessionId   = null;
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

  setStatus('Uploading…');

  const formData = new FormData();
  formData.append('file', file);

  let data;
  try {
    const res = await fetch('/api/split/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      setStatus(err.detail || 'Upload failed.', 'error');
      return;
    }
    data = await res.json();
  } catch {
    setStatus('Upload failed — server unreachable.', 'error');
    return;
  }

  sessionId = data.session_id;

  setStatus('Rendering pages…');
  try {
    pdfDoc = await pdfjsLib.getDocument(`/api/split/pdf/${sessionId}`).promise;
  } catch {
    setStatus('Could not render PDF.', 'error');
    return;
  }

  splitUploadSection.hidden = false;
  splitUploadZone.hidden    = true;
  splitViewerSection.hidden = false;

  await renderThumbnails();
  setStatus('Click pages to deselect them, then Split & Download.');
}

// ── Thumbnails ────────────────────────────────────────────────────────────────
async function renderThumbnails() {
  splitThumbGrid.innerHTML = '';
  selectedPages.clear();

  const total = pdfDoc.numPages;

  for (let i = 0; i < total; i++) {
    const page      = await pdfDoc.getPage(i + 1);
    const unscaled  = page.getViewport({ scale: 1 });
    const scale     = 120 / unscaled.width;
    const viewport  = page.getViewport({ scale });

    const item = document.createElement('div');
    item.className    = 'thumb-item selected';
    item.dataset.page = i;

    const canvas    = document.createElement('canvas');
    canvas.width    = Math.floor(viewport.width);
    canvas.height   = Math.floor(viewport.height);
    canvas.className = 'thumb-canvas';

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const label       = document.createElement('div');
    label.className   = 'thumb-label';
    label.textContent = `Page ${i + 1}`;

    const check       = document.createElement('div');
    check.className   = 'thumb-check';
    check.innerHTML   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><path d="M5 13l4 4L19 7"/></svg>`;

    item.appendChild(canvas);
    item.appendChild(label);
    item.appendChild(check);

    item.addEventListener('click', () => togglePage(i, item));

    splitThumbGrid.appendChild(item);
    selectedPages.add(i);
  }

  updateUI();
}

// ── Selection ─────────────────────────────────────────────────────────────────
function togglePage(index, item) {
  if (selectedPages.has(index)) {
    selectedPages.delete(index);
    item.classList.remove('selected');
    item.classList.add('deselected');
  } else {
    selectedPages.add(index);
    item.classList.remove('deselected');
    item.classList.add('selected');
  }
  updateUI();
}

selectAllBtn.addEventListener('click', () => {
  splitThumbGrid.querySelectorAll('.thumb-item').forEach(item => {
    const i = parseInt(item.dataset.page);
    selectedPages.add(i);
    item.classList.add('selected');
    item.classList.remove('deselected');
  });
  updateUI();
});

selectNoneBtn.addEventListener('click', () => {
  selectedPages.clear();
  splitThumbGrid.querySelectorAll('.thumb-item').forEach(item => {
    item.classList.remove('selected');
    item.classList.add('deselected');
  });
  updateUI();
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
