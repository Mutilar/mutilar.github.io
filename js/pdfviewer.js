// ═══════════════════════════════════════════════════════════════
//  INLINE PDF VIEWER (replaces pdfviewer.html)
//  Uses PDF.js loaded dynamically; renders spread-view into
//  #pdf-viewer inside the PDF modal.
// ═══════════════════════════════════════════════════════════════

let pdfViewerReady = false;
let pdfjsLib = null;

function loadPdfJs() {
  if (pdfViewerReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.min.mjs';
    script.type = 'module';
    // pdf.js as a module can't be accessed via global scope from a classic script,
    // so we use a dynamic import instead.
    const loader = document.createElement('script');
    loader.type = 'module';
    loader.textContent = `
      import * as pdfjsLibModule from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.min.mjs';
      pdfjsLibModule.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.worker.min.mjs';
      window.__pdfjsLib = pdfjsLibModule;
      window.dispatchEvent(new Event('pdfjsReady'));
    `;
    document.head.appendChild(loader);
    window.addEventListener('pdfjsReady', () => {
      pdfjsLib = window.__pdfjsLib;
      pdfViewerReady = true;
      resolve();
    }, { once: true });
    // Timeout fallback
    setTimeout(() => {
      if (!pdfViewerReady) reject(new Error('PDF.js failed to load'));
    }, 15000);
  });
}

let pdfResizeHandler = null;

async function renderPdfInline(pdfUrl) {
  const viewer = document.getElementById('pdf-viewer');
  const loadingEl = document.getElementById('pdf-loading');
  if (!viewer) return;

  viewer.innerHTML = '';
  loadingEl.style.display = 'flex';

  try {
    await loadPdfJs();
  } catch (e) {
    loadingEl.textContent = 'Failed to load PDF viewer.';
    return;
  }

  const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
  const totalPages = pdf.numPages;

  function getScale(page) {
    const vp = page.getViewport({ scale: 1 });
    const availWidth = (viewer.clientWidth / 2) - 20;
    const availHeight = viewer.clientHeight - 32;
    const scaleW = availWidth / vp.width;
    const scaleH = availHeight / vp.height;
    return Math.min(scaleW, scaleH, 2.5);
  }

  async function renderPage(pageNum) {
    const page = await pdf.getPage(pageNum);
    const scale = getScale(page);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  }

  // Build spread rows: page 1 alone (cover), then pairs
  const spreads = [[1]];
  for (let p = 2; p <= totalPages; p += 2) {
    if (p + 1 <= totalPages) spreads.push([p, p + 1]);
    else spreads.push([p]);
  }

  async function renderAll() {
    viewer.innerHTML = '';
    for (const pages of spreads) {
      const row = document.createElement('div');
      row.className = 'pdf-spread-row';
      for (const pNum of pages) {
        const canvas = await renderPage(pNum);
        row.appendChild(canvas);
      }
      viewer.appendChild(row);
    }
  }

  await renderAll();
  loadingEl.style.display = 'none';

  // Re-render on resize
  if (pdfResizeHandler) window.removeEventListener('resize', pdfResizeHandler);
  let resizeTimer;
  pdfResizeHandler = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      const scrollRatio = viewer.scrollTop / (viewer.scrollHeight || 1);
      await renderAll();
      viewer.scrollTop = scrollRatio * viewer.scrollHeight;
    }, 250);
  };
  window.addEventListener('resize', pdfResizeHandler);
}

function clearPdfViewer() {
  const viewer = document.getElementById('pdf-viewer');
  if (viewer) viewer.innerHTML = '';
  if (pdfResizeHandler) {
    window.removeEventListener('resize', pdfResizeHandler);
    pdfResizeHandler = null;
  }
}
