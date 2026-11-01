/**
 * SnapKeep Area Selection Content Script
 * Injected dynamically into active tab to allow the user to draw an area to screenshot.
 */

(function () {
  if (document.getElementById('snapkeep-snipper-root')) {
    // Already active, remove previous instance
    document.getElementById('snapkeep-snipper-root').remove();
  }

  let isSelecting = false;
  let startX = 0;
  let startY = 0;
  let currentRect = null;

  const root = document.createElement('div');
  root.id = 'snapkeep-snipper-root';

  const help = document.createElement('div');
  help.id = 'snapkeep-snipper-help';
  help.innerHTML = `Drag to select area &bull; Press <kbd>Enter</kbd> to capture &bull; <kbd>Esc</kbd> to cancel`;
  root.appendChild(help);

  const selection = document.createElement('div');
  selection.id = 'snapkeep-snipper-selection';
  selection.style.display = 'none';

  const badge = document.createElement('div');
  badge.id = 'snapkeep-snipper-badge';
  selection.appendChild(badge);

  const toolbar = document.createElement('div');
  toolbar.id = 'snapkeep-snipper-toolbar';
  toolbar.style.display = 'none';
  toolbar.innerHTML = `
    <button class="snapkeep-btn-snip snapkeep-btn-cancel" id="snapkeep-snip-cancel">Cancel</button>
    <button class="snapkeep-btn-snip snapkeep-btn-confirm" id="snapkeep-snip-confirm">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      Capture
    </button>
  `;
  root.appendChild(selection);
  root.appendChild(toolbar);
  document.documentElement.appendChild(root);

  function cleanup() {
    window.removeEventListener('keydown', onKeyDown);
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
  }

  function finishSelection(rect) {
    if (!rect || rect.width < 8 || rect.height < 8) {
      cleanup();
      return;
    }

    // Hide snipper UI before capturing
    root.style.display = 'none';

    // Allow browser a frame to repaint without overlay
    requestAnimationFrame(() => {
      chrome.runtime.sendMessage({
        action: 'SNIP_SELECTION_FINISHED',
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        devicePixelRatio: window.devicePixelRatio || 1,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pageTitle: document.title || 'Untitled Webpage',
        pageUrl: window.location.href || ''
      }, () => {
        cleanup();
      });
    });
  }

  root.addEventListener('mousedown', (e) => {
    if (e.target.closest('#snapkeep-snipper-toolbar')) return;

    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    currentRect = { x: startX, y: startY, width: 0, height: 0 };

    selection.style.left = `${startX}px`;
    selection.style.top = `${startY}px`;
    selection.style.width = '0px';
    selection.style.height = '0px';
    selection.style.display = 'block';
    toolbar.style.display = 'none';
    help.style.display = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    currentRect = { x, y, width, height };

    selection.style.left = `${x}px`;
    selection.style.top = `${y}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;

    badge.textContent = `${Math.round(width * (window.devicePixelRatio || 1))} × ${Math.round(height * (window.devicePixelRatio || 1))} px`;
    badge.style.display = width > 40 && height > 20 ? 'block' : 'none';
  });

  window.addEventListener('mouseup', (e) => {
    if (!isSelecting) return;
    isSelecting = false;

    if (!currentRect || currentRect.width < 10 || currentRect.height < 10) {
      selection.style.display = 'none';
      toolbar.style.display = 'none';
      help.style.display = 'flex';
      return;
    }

    // Position toolbar
    toolbar.style.display = 'flex';
    const tbX = Math.max(10, Math.min(window.innerWidth - 180, currentRect.x + currentRect.width - 150));
    const tbY = currentRect.y + currentRect.height + 10 > window.innerHeight - 50
      ? Math.max(10, currentRect.y - 45)
      : currentRect.y + currentRect.height + 10;

    toolbar.style.left = `${tbX}px`;
    toolbar.style.top = `${tbY}px`;
  });

  toolbar.querySelector('#snapkeep-snip-confirm').addEventListener('click', () => {
    if (currentRect) finishSelection(currentRect);
  });

  toolbar.querySelector('#snapkeep-snip-cancel').addEventListener('click', () => {
    cleanup();
    chrome.runtime.sendMessage({ action: 'SNIP_CANCELLED' });
  });

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
      chrome.runtime.sendMessage({ action: 'SNIP_CANCELLED' });
    } else if (e.key === 'Enter') {
      if (currentRect && currentRect.width >= 10 && currentRect.height >= 10) {
        finishSelection(currentRect);
      }
    }
  }

  window.addEventListener('keydown', onKeyDown);
})();
