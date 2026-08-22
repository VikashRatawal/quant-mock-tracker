/* Quant Mock Tracker — responsive viewport and zoom controls */
(function (global) {
  'use strict';

  const ZOOM_KEY = 'qmt_zoom_v1';
  const DESKTOP_KEY = 'qmt_desktop_view_v1';
  const MIN_ZOOM = 50;
  const MAX_ZOOM = 200;
  const STEP = 10;
  let zoom = readZoom();
  let desktop = readDesktop();
  let bound = false;

  function readZoom() {
    let value = 100;
    try { value = parseInt(global.localStorage.getItem(ZOOM_KEY), 10) || 100; } catch (error) {}
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value / STEP) * STEP));
  }

  function readDesktop() {
    try { return global.localStorage.getItem(DESKTOP_KEY) === 'true'; } catch (error) { return false; }
  }

  function save(key, value) {
    try { global.localStorage.setItem(key, value); } catch (error) {}
  }

  function updateZoomUi() {
    const value = global.document && global.document.getElementById('zoomValue');
    const minus = global.document && global.document.getElementById('zoomMinus');
    const plus = global.document && global.document.getElementById('zoomPlus');
    if (value) value.textContent = zoom + '%';
    if (minus) minus.disabled = zoom <= MIN_ZOOM;
    if (plus) plus.disabled = zoom >= MAX_ZOOM;
    if (global.document && global.document.body) {
      global.document.body.style.zoom = String(zoom / 100);
      if (global.document.body.dataset) global.document.body.dataset.zoom = String(zoom);
    }
  }

  function updateDesktopUi() {
    if (global.document && global.document.body) {
      global.document.body.classList.toggle('desktop-mode', desktop);
      if (global.document.body.dataset) global.document.body.dataset.viewport = desktop ? 'desktop' : 'responsive';
    }
    const button = global.document && global.document.getElementById('desktopToggle');
    if (button) {
      button.setAttribute('aria-pressed', desktop ? 'true' : 'false');
      button.setAttribute('title', desktop ? 'Switch to responsive view' : 'Switch to desktop view');
      button.setAttribute('aria-label', desktop ? 'Switch to responsive view' : 'Switch to desktop view');
      button.innerHTML = '<i class="fa-solid ' + (desktop ? 'fa-mobile-screen' : 'fa-desktop') + '" aria-hidden="true"></i>';
    }
  }

  function setZoom(value, persist) {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(Number(value) / STEP) * STEP));
    if (!Number.isFinite(next)) return;
    zoom = next;
    if (persist !== false) save(ZOOM_KEY, String(zoom));
    updateZoomUi();
  }

  function changeZoom(delta) {
    setZoom(zoom + (delta > 0 ? STEP : -STEP));
  }

  function toggleDesktopView() {
    desktop = !desktop;
    save(DESKTOP_KEY, String(desktop));
    updateDesktopUi();
    if (typeof global.showToast === 'function') {
      global.showToast(desktop ? '🖥️ Desktop view enabled' : '📱 Responsive view enabled');
    }
  }

  function init() {
    if (bound || !global.document) return;
    const plus = global.document.getElementById('zoomPlus');
    const minus = global.document.getElementById('zoomMinus');
    const desktopButton = global.document.getElementById('desktopToggle');
    if (!plus && !minus && !desktopButton) return;
    bound = true;
    plus && plus.addEventListener('click', () => changeZoom(1));
    minus && minus.addEventListener('click', () => changeZoom(-1));
    desktopButton && desktopButton.addEventListener('click', toggleDesktopView);
    updateZoomUi();
    updateDesktopUi();
  }

  global.setQmtZoom = setZoom;
  global.changeQmtZoom = changeZoom;
  global.toggleDesktopView = toggleDesktopView;
  global.QMTViewControls = { getZoom: () => zoom, isDesktop: () => desktop, setZoom, changeZoom, toggleDesktopView };

  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(window);
