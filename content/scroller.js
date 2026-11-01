/**
 * SnapKeep Full-Page Scroller Coordinator
 * Accurately measures document dimensions, steps through vertical slices, and restores viewport state.
 */

(function () {
  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;

  // Track any hidden sticky/fixed elements to restore later if needed
  const fixedElements = [];

  function getMetrics() {
    const doc = document.documentElement;
    const body = document.body;

    const scrollWidth = Math.max(
      doc.scrollWidth || 0,
      body.scrollWidth || 0,
      doc.clientWidth || 0,
      body.clientWidth || 0
    );

    const scrollHeight = Math.max(
      doc.scrollHeight || 0,
      body.scrollHeight || 0,
      doc.clientHeight || 0,
      body.clientHeight || 0
    );

    return {
      scrollWidth,
      scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      pageTitle: document.title || 'Webpage',
      pageUrl: window.location.href || ''
    };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_PAGE_METRICS') {
      sendResponse(getMetrics());
      return true;
    }

    if (request.action === 'SCROLL_TO') {
      const targetY = request.y || 0;
      window.scrollTo({ left: 0, top: targetY, behavior: 'instant' });

      // Allow 120ms for DOM repaints and lazy content rendering
      setTimeout(() => {
        sendResponse({
          currentY: window.scrollY,
          ready: true
        });
      }, 120);

      return true; // Keep message channel open for async response
    }

    if (request.action === 'RESTORE_SCROLL') {
      window.scrollTo({ left: originalScrollX, top: originalScrollY, behavior: 'instant' });
      sendResponse({ restored: true });
      return true;
    }
  });
})();
