import { showUploadOverlay, hideUploadOverlay } from '/static/utils.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const scanCaptureSection = document.getElementById('scan-capture');
const scanEditorSection  = document.getElementById('scan-editor');
const scanUploadZone     = document.getElementById('scan-upload-zone');
const scanFileGallery    = document.getElementById('scan-file-gallery');
const scanFileCamera     = document.getElementById('scan-file-camera');
const scanCameraBtn      = document.getElementById('scan-camera-btn');
const scanGalleryBtn     = document.getElementById('scan-gallery-btn');
const scanImageCanvas    = document.getElementById('scan-image-canvas');
const scanOverlayCanvas  = document.getElementById('scan-overlay-canvas');
const scanStatusEl       = document.getElementById('scan-status');
const scanConvertBtn     = document.getElementById('scan-convert-btn');
const scanPaperlessBtn   = document.getElementById('scan-paperless-btn');
const scanClearBtn       = document.getElementById('scan-clear-btn');
const scanNewBtn         = document.getElementById('scan-new-btn');

// ── State ─────────────────────────────────────────────────────────────────────
let originalImage = null;   // HTMLImageElement at full resolution
let currentFile   = null;   // File object for filename
let selection     = null;   // { x, y, w, h } in canvas display coords
let dragStart     = null;
let isDragging    = false;

// ── Upload zone events ────────────────────────────────────────────────────────
scanUploadZone.addEventListener('click', () => scanFileGallery.click());

scanUploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  scanUploadZone.classList.add('drag-over');
});
scanUploadZone.addEventListener('dragleave', () => scanUploadZone.classList.remove('drag-over'));
scanUploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  scanUploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

scanFileGallery.addEventListener('change', () => {
  if (scanFileGallery.files[0]) handleFile(scanFileGallery.files[0]);
  scanFileGallery.value = '';
});

scanFileCamera.addEventListener('change', () => {
  if (scanFileCamera.files[0]) handleFile(scanFileCamera.files[0]);
  scanFileCamera.value = '';
});

scanCameraBtn.addEventListener('click', () => scanFileCamera.click());
scanGalleryBtn.addEventListener('click', () => scanFileGallery.click());

// ── Load image ────────────────────────────────────────────────────────────────
async function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    setStatus('Please select an image file (JPEG, PNG, or WebP).', 'error');
    return;
  }

  currentFile = file;
  selection   = null;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    originalImage = img;
    // Show editor first so the container has layout dimensions before renderImage reads clientWidth
    scanCaptureSection.hidden = false;
    scanUploadZone.hidden     = true;
    scanEditorSection.hidden  = false;
    requestAnimationFrame(() => {
      renderImage();
      setStatus('Draw a crop area, or save the full image as PDF');
      scanConvertBtn.disabled   = false;
      scanPaperlessBtn.disabled = false;
    });
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus('Could not load image.', 'error');
  };
  img.src = url;
}

// ── Render image to canvas ────────────────────────────────────────────────────
function renderImage() {
  const wrap    = document.getElementById('scan-canvas-wrap');
  const maxW    = wrap.clientWidth  - 48 || 800;
  const maxH    = window.innerHeight * 0.65;
  const scale   = Math.min(1, maxW / originalImage.naturalWidth, maxH / originalImage.naturalHeight);
  const dispW   = Math.floor(originalImage.naturalWidth  * scale);
  const dispH   = Math.floor(originalImage.naturalHeight * scale);

  scanImageCanvas.width         = dispW;
  scanImageCanvas.height        = dispH;
  scanOverlayCanvas.width       = dispW;
  scanOverlayCanvas.height      = dispH;

  const ctx = scanImageCanvas.getContext('2d');
  ctx.drawImage(originalImage, 0, 0, dispW, dispH);

  drawOverlay();
}

// ── Draw selection overlay ────────────────────────────────────────────────────
function drawOverlay() {
  const ctx = scanOverlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, scanOverlayCanvas.width, scanOverlayCanvas.height);
  if (!selection) return;

  const { x, y, w, h } = normalizeRect(selection);
  if (w < 2 || h < 2) return;

  // Darken outside selection
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, scanOverlayCanvas.width, scanOverlayCanvas.height);
  ctx.clearRect(x, y, w, h);

  // Selection border
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth   = 2;
  ctx.strokeRect(x, y, w, h);

  // Corner handles
  const hs = 8;
  ctx.fillStyle = '#6366f1';
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
    ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
  });
}

function normalizeRect({ x, y, w, h }) {
  return {
    x: w < 0 ? x + w : x,
    y: h < 0 ? y + h : y,
    w: Math.abs(w),
    h: Math.abs(h),
  };
}

// ── Overlay mouse interactions ────────────────────────────────────────────────
scanOverlayCanvas.addEventListener('mousedown', (e) => {
  const r  = scanOverlayCanvas.getBoundingClientRect();
  dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
  selection  = { x: dragStart.x, y: dragStart.y, w: 0, h: 0 };
  isDragging = true;
});

scanOverlayCanvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const r = scanOverlayCanvas.getBoundingClientRect();
  selection.w = (e.clientX - r.left) - dragStart.x;
  selection.h = (e.clientY - r.top)  - dragStart.y;
  drawOverlay();
});

scanOverlayCanvas.addEventListener('mouseup', () => {
  isDragging = false;
  const norm = normalizeRect(selection);
  if (norm.w < 4 || norm.h < 4) {
    selection = null;
    drawOverlay();
  }
});

// Touch support for mobile
scanOverlayCanvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const r = scanOverlayCanvas.getBoundingClientRect();
  dragStart = { x: t.clientX - r.left, y: t.clientY - r.top };
  selection  = { x: dragStart.x, y: dragStart.y, w: 0, h: 0 };
  isDragging = true;
}, { passive: false });

scanOverlayCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!isDragging) return;
  const t = e.touches[0];
  const r = scanOverlayCanvas.getBoundingClientRect();
  selection.w = (t.clientX - r.left) - dragStart.x;
  selection.h = (t.clientY - r.top)  - dragStart.y;
  drawOverlay();
}, { passive: false });

scanOverlayCanvas.addEventListener('touchend', () => {
  isDragging = false;
  const norm = normalizeRect(selection);
  if (norm.w < 4 || norm.h < 4) {
    selection = null;
    drawOverlay();
  }
});

// ── Clear button ──────────────────────────────────────────────────────────────
scanClearBtn.addEventListener('click', () => {
  selection = null;
  drawOverlay();
  setStatus('Draw a crop area, or save the full image as PDF');
});

// ── Shared: build FormData from current image/crop ───────────────────────────
async function buildFormData() {
  const scaleX = originalImage.naturalWidth  / scanImageCanvas.width;
  const scaleY = originalImage.naturalHeight / scanImageCanvas.height;

  let imageBlob;
  if (selection) {
    const norm = normalizeRect(selection);
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width  = Math.round(norm.w * scaleX);
    cropCanvas.height = Math.round(norm.h * scaleY);
    const ctx = cropCanvas.getContext('2d');
    ctx.drawImage(
      originalImage,
      norm.x * scaleX, norm.y * scaleY,
      cropCanvas.width, cropCanvas.height,
      0, 0,
      cropCanvas.width, cropCanvas.height,
    );
    imageBlob = await new Promise(res => cropCanvas.toBlob(res, 'image/jpeg', 0.92));
  } else {
    imageBlob = currentFile;
  }

  const stem     = currentFile.name.replace(/\.[^.]+$/, '');
  const formData = new FormData();
  formData.append('file', imageBlob, stem + '.jpg');
  formData.append('filename', stem);
  return { formData, stem };
}

function setButtons(disabled) {
  scanConvertBtn.disabled      = disabled;
  scanPaperlessBtn.disabled    = disabled;
}

// ── Convert & download ────────────────────────────────────────────────────────
scanConvertBtn.addEventListener('click', async () => {
  if (!originalImage || !currentFile) return;

  setButtons(true);
  setStatus('Converting…');
  showUploadOverlay('Converting…');

  const { formData, stem } = await buildFormData();

  let res;
  try {
    res = await fetch('/api/photo/convert', { method: 'POST', body: formData });
  } catch {
    hideUploadOverlay();
    setStatus('Request failed — server unreachable.', 'error');
    setButtons(false);
    return;
  }

  if (!res.ok) {
    hideUploadOverlay();
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    setStatus('Failed: ' + err.detail, 'error');
    setButtons(false);
    return;
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match       = disposition.match(/filename="([^"]+)"/);
  const filename    = match ? match[1] : stem + '.pdf';

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  hideUploadOverlay();
  setStatus('Done — file downloaded.', 'success');
  setButtons(false);
});

// ── Send to Paperless ─────────────────────────────────────────────────────────
scanPaperlessBtn.addEventListener('click', async () => {
  if (!originalImage || !currentFile) return;

  setButtons(true);
  setStatus('Sending to Paperless…');
  showUploadOverlay('Sending to Paperless…');

  const { formData, stem } = await buildFormData();

  let res;
  try {
    res = await fetch('/api/photo/send-to-paperless', { method: 'POST', body: formData });
  } catch {
    hideUploadOverlay();
    setStatus('Request failed — server unreachable.', 'error');
    setButtons(false);
    return;
  }

  if (!res.ok) {
    hideUploadOverlay();
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    setStatus('Failed: ' + err.detail, 'error');
    setButtons(false);
    return;
  }

  const { filename } = await res.json();
  hideUploadOverlay();
  setStatus(`Sent to Paperless — ${filename}`, 'success');
  setButtons(false);
});

// ── New photo ─────────────────────────────────────────────────────────────────
scanNewBtn.addEventListener('click', () => {
  originalImage = null;
  currentFile   = null;
  selection     = null;
  isDragging    = false;
  scanImageCanvas.width        = 0;
  scanImageCanvas.height       = 0;
  scanOverlayCanvas.width      = 0;
  scanOverlayCanvas.height     = 0;
  scanEditorSection.hidden     = true;
  scanUploadZone.hidden        = false;
  scanConvertBtn.disabled      = true;
  scanPaperlessBtn.disabled    = true;
  setStatus('Draw a crop area, or save the full image as PDF');
});

// ── Status helper ─────────────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  scanStatusEl.textContent = msg;
  scanStatusEl.className   = type;
}
