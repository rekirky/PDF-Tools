import { showUploadOverlay, hideUploadOverlay, uploadWithProgress } from '/static/utils.js';

// ── State ─────────────────────────────────────────────────────────────────────
let fileList   = [];   // [{id, filename, page_count}]
let dragSrcIdx = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const joinUploadSection = document.getElementById('join-upload');
const joinListSection   = document.getElementById('join-list');
const joinUploadZone    = document.getElementById('join-upload-zone');
const joinFileInput     = document.getElementById('join-file-input');
const joinFileList      = document.getElementById('join-file-list');
const joinStatusEl      = document.getElementById('join-status');
const joinBtn           = document.getElementById('join-btn');
const addMoreBtn        = document.getElementById('add-more-btn');
const joinNewBtn        = document.getElementById('join-new-btn');

// ── Upload zone ───────────────────────────────────────────────────────────────
joinUploadZone.addEventListener('click', () => joinFileInput.click());

joinUploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  joinUploadZone.classList.add('drag-over');
});
joinUploadZone.addEventListener('dragleave', () => joinUploadZone.classList.remove('drag-over'));
joinUploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  joinUploadZone.classList.remove('drag-over');
  handleFiles(Array.from(e.dataTransfer.files));
});
joinFileInput.addEventListener('change', () => {
  handleFiles(Array.from(joinFileInput.files));
  joinFileInput.value = '';
});

addMoreBtn.addEventListener('click', () => joinFileInput.click());

// ── File handling ─────────────────────────────────────────────────────────────
async function handleFiles(files) {
  const pdfs    = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
  const skipped = files.length - pdfs.length;

  if (!pdfs.length) {
    setStatus('No PDF files found in selection.', 'error');
    return;
  }
  if (skipped > 0) {
    setStatus(`${skipped} non-PDF file(s) skipped.`, 'error');
  }

  const formData = new FormData();
  pdfs.forEach(f => formData.append('files', f));

  showUploadOverlay(`Uploading ${pdfs.length} file(s)…`);
  let data;
  try {
    data = await uploadWithProgress('/api/join/upload', formData);
  } catch (err) {
    hideUploadOverlay();
    setStatus(err.message, 'error');
    return;
  }
  hideUploadOverlay();

  fileList.push(...data);
  joinUploadSection.hidden = true;
  joinListSection.hidden   = false;
  renderList();
  setStatus('Drag to reorder, then click Join & Download.');
}

// ── File list rendering ───────────────────────────────────────────────────────
function renderList() {
  joinFileList.innerHTML = '';

  fileList.forEach((file, i) => {
    const li = document.createElement('li');
    li.className   = 'file-item';
    li.draggable   = true;
    li.dataset.index = i;

    li.innerHTML = `
      <span class="drag-handle" title="Drag to reorder">
        <svg viewBox="0 0 10 16" fill="currentColor" width="10" height="16">
          <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
          <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
          <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
        </svg>
      </span>
      <span class="file-order">${i + 1}</span>
      <span class="file-name" title="${file.filename}">${file.filename}</span>
      <span class="file-pages">${file.page_count} pg</span>
      <button class="btn-remove" data-index="${i}" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
          <path d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;

    // Drag-and-drop reorder
    li.addEventListener('dragstart', (e) => {
      dragSrcIdx = i;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => li.classList.add('dragging'), 0);
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.file-item').forEach(el => el.classList.remove('drop-target'));
      li.classList.add('drop-target');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drop-target');
      if (dragSrcIdx === null || dragSrcIdx === i) return;
      const [moved] = fileList.splice(dragSrcIdx, 1);
      fileList.splice(i, 0, moved);
      dragSrcIdx = null;
      renderList();
    });

    joinFileList.appendChild(li);
  });

  // Remove buttons
  joinFileList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      fileList.splice(parseInt(btn.dataset.index), 1);
      if (fileList.length === 0) {
        joinListSection.hidden   = true;
        joinUploadSection.hidden = false;
        setStatus('');
      } else {
        renderList();
      }
    });
  });

  joinBtn.disabled = fileList.length < 2;
}

// ── Join & download ───────────────────────────────────────────────────────────
joinBtn.addEventListener('click', async () => {
  if (fileList.length < 2) return;

  setStatus('Joining…');
  joinBtn.disabled = true;

  const outputName = fileList[0].filename.replace(/\.pdf$/i, '');
  const body = {
    files: fileList.map(f => f.id),
    output_name: outputName,
  };

  let res;
  try {
    res = await fetch('/api/join/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    setStatus('Join failed — server unreachable.', 'error');
    joinBtn.disabled = false;
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    setStatus('Join failed: ' + err.detail, 'error');
    joinBtn.disabled = false;
    return;
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match       = disposition.match(/filename="([^"]+)"/);
  const filename    = match ? match[1] : 'joined.pdf';

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
  joinBtn.disabled = false;
});

// ── New / reset ───────────────────────────────────────────────────────────────
joinNewBtn.addEventListener('click', () => {
  fileList = [];
  joinListSection.hidden   = true;
  joinUploadSection.hidden = false;
  setStatus('');
});

// ── Status helper ─────────────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  joinStatusEl.textContent = msg;
  joinStatusEl.className   = type;
}
