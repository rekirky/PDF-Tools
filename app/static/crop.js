import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

// ── State ────────────────────────────────────────────────────────────────────
let pdfDoc      = null;
let currentPage = 1;
let viewport    = null;
let sessionId   = null;
let renderTask  = null;

let isDrawing  = false;
let dragStart  = null;   // {x, y} in canvas px
let selection  = null;   // {x0, y0, x1, y1} in canvas px (normalised)

// ── DOM refs ─────────────────────────────────────────────────────────────────
const uploadSection  = document.getElementById('crop-upload');
const viewerSection  = document.getElementById('crop-viewer');
const uploadZone     = document.getElementById('upload-zone');
const fileInput      = document.getElementById('file-input');
const pdfCanvas      = document.getElementById('pdf-canvas');
const overlayCanvas  = document.getElementById('overlay-canvas');
const ctx            = pdfCanvas.getContext('2d');
const overlayCtx     = overlayCanvas.getContext('2d');
const pageNumEl      = document.getElementById('page-num');
const pageCountEl    = document.getElementById('page-count');
const prevBtn        = document.getElementById('prev-page');
const nextBtn        = document.getElementById('next-page');
const cropBtn        = document.getElementById('crop-btn');
const clearBtn       = document.getElementById('clear-btn');
const statusEl       = document.getElementById('status');
const newFileBtn     = document.getElementById('new-file-btn');

// ── Upload ────────────────────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
  fileInput.value = '';
});

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
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
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

  sessionId   = data.session_id;
  currentPage = 1;

  setStatus('Loading PDF…');
  try {
    pdfDoc = await pdfjsLib.getDocument(`/api/pdf/${sessionId}`).promise;
  } catch {
    setStatus('Could not render PDF.', 'error');
    return;
  }

  pageCountEl.textContent = pdfDoc.numPages;

  uploadSection.hidden = true;
  viewerSection.hidden = false;

  await renderPage(currentPage);
  setStatus('Draw a selection rectangle on the PDF.');
}

// ── Render ────────────────────────────────────────────────────────────────────
async function renderPage(num) {
  if (renderTask) renderTask.cancel();

  const page       = await pdfDoc.getPage(num);
  const wrap       = document.getElementById('canvas-wrap');
  const maxWidth   = wrap.clientWidth - 48; // subtract padding
  const unscaled   = page.getViewport({ scale: 1 });
  const scale      = Math.min(maxWidth / unscaled.width, 2.0);
  viewport         = page.getViewport({ scale });

  pdfCanvas.width     = Math.floor(viewport.width);
  pdfCanvas.height    = Math.floor(viewport.height);
  overlayCanvas.width  = Math.floor(viewport.width);
  overlayCanvas.height = Math.floor(viewport.height);

  renderTask = page.render({ canvasContext: ctx, viewport });
  try {
    await renderTask.promise;
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') throw e;
  }

  pageNumEl.textContent = num;
  prevBtn.disabled = num <= 1;
  nextBtn.disabled = num >= pdfDoc.numPages;

  clearSelection();
}

// ── Page navigation ───────────────────────────────────────────────────────────
prevBtn.addEventListener('click', async () => {
  if (currentPage > 1) { currentPage--; await renderPage(currentPage); }
});
nextBtn.addEventListener('click', async () => {
  if (currentPage < pdfDoc.numPages) { currentPage++; await renderPage(currentPage); }
});

// ── Canvas coordinate helper ─────────────────────────────────────────────────
function canvasCoords(e) {
  const rect   = overlayCanvas.getBoundingClientRect();
  const scaleX = overlayCanvas.width  / rect.width;
  const scaleY = overlayCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY,
  };
}

// ── Draw interaction ──────────────────────────────────────────────────────────
overlayCanvas.addEventListener('mousedown', (e) => {
  dragStart = canvasCoords(e);
  isDrawing = true;
  selection = null;
  cropBtn.disabled = true;
});

overlayCanvas.addEventListener('mousemove', (e) => {
  if (!isDrawing || !dragStart) return;
  drawRect(dragStart, canvasCoords(e));
});

overlayCanvas.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  isDrawing = false;
  finaliseSelection(canvasCoords(e));
});

overlayCanvas.addEventListener('mouseleave', (e) => {
  if (!isDrawing) return;
  isDrawing = false;
  finaliseSelection(canvasCoords(e));
});

function finaliseSelection(end) {
  const x0 = Math.min(dragStart.x, end.x);
  const y0 = Math.min(dragStart.y, end.y);
  const x1 = Math.max(dragStart.x, end.x);
  const y1 = Math.max(dragStart.y, end.y);

  const minPx = 10;
  if (x1 - x0 < minPx || y1 - y0 < minPx) {
    clearSelection();
    return;
  }
  selection = { x0, y0, x1, y1 };
  cropBtn.disabled = false;
  drawRect({ x: x0, y: y0 }, { x: x1, y: y1 });
  setStatus('Selection ready. Click "Crop & Download" or redraw to adjust.');
}

function drawRect(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Dim outside
  overlayCtx.fillStyle = 'rgba(0,0,0,0.45)';
  overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  overlayCtx.clearRect(x, y, w, h);

  // Border
  overlayCtx.strokeStyle = '#6366f1';
  overlayCtx.lineWidth = 2;
  overlayCtx.strokeRect(x, y, w, h);

  // Corner handles
  const hs = 7;
  overlayCtx.fillStyle = '#6366f1';
  for (const [hx, hy] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]) {
    overlayCtx.fillRect(hx - hs/2, hy - hs/2, hs, hs);
  }

  // Dimension label
  if (viewport) {
    const pw = Math.round(w / viewport.scale);
    const ph = Math.round(h / viewport.scale);
    const label = `${pw} × ${ph} pt`;
    overlayCtx.font = '11px monospace';
    const lw = overlayCtx.measureText(label).width + 10;
    const lx = Math.min(x, overlayCanvas.width - lw - 2);
    const ly = y > 22 ? y - 22 : y + h + 4;
    overlayCtx.fillStyle = 'rgba(99,102,241,0.92)';
    overlayCtx.fillRect(lx, ly, lw, 18);
    overlayCtx.fillStyle = '#fff';
    overlayCtx.fillText(label, lx + 5, ly + 13);
  }
}

function clearSelection() {
  selection = null;
  cropBtn.disabled = true;
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

clearBtn.addEventListener('click', () => {
  clearSelection();
  setStatus('Draw a selection rectangle on the PDF.');
});

// ── Crop ──────────────────────────────────────────────────────────────────────
cropBtn.addEventListener('click', async () => {
  if (!selection || !sessionId) return;

  setStatus('Cropping…');
  cropBtn.disabled = true;

  const s = viewport.scale;
  const body = {
    session_id: sessionId,
    page:       currentPage - 1,   // 0-indexed for backend
    x0:         selection.x0 / s,
    y0:         selection.y0 / s,
    x1:         selection.x1 / s,
    y1:         selection.y1 / s,
  };

  let res;
  try {
    res = await fetch('/api/crop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    setStatus('Crop failed — server unreachable.', 'error');
    cropBtn.disabled = false;
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    setStatus('Crop failed: ' + err.detail, 'error');
    cropBtn.disabled = false;
    return;
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : 'cropped.pdf';

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
  cropBtn.disabled = false;
});

// ── New file ──────────────────────────────────────────────────────────────────
newFileBtn.addEventListener('click', () => {
  pdfDoc    = null;
  sessionId = null;
  viewport  = null;
  ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
  clearSelection();
  viewerSection.hidden = true;
  uploadSection.hidden = false;
  setStatus('Draw a selection rectangle on the PDF.');
});

// ── Status helper ─────────────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  statusEl.textContent  = msg;
  statusEl.className    = type;   // '', 'error', or 'success'
}
