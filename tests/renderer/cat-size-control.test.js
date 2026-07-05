const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CAT_SCALE_DRAG_PIXELS,
  CAT_SCALE_MAX,
  formatCatScale,
  normalizeCatScale,
  scaleFromDragDelta,
  shouldUseCompactControls,
  stepCatScale
} = require('../../src/renderer/petBehavior');
const { createPetWindowOptions } = require('../../src/main/windowOptions');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf-8');
}

function readCssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?\\}`))?.[0] || '';
}

test('cat scale helpers normalize, drag, and clamp user size choices', () => {
  assert.equal(normalizeCatScale(undefined), 1);
  assert.equal(normalizeCatScale('not-a-number'), 1);
  assert.equal(normalizeCatScale(0.2), 0.5);
  assert.equal(normalizeCatScale(2), 1.25);
  assert.equal(normalizeCatScale(1.04), 1.04);
  assert.equal(normalizeCatScale(1.0664), 1.066);

  assert.equal(stepCatScale(1, 1), 1.1);
  assert.equal(stepCatScale(1, -1), 0.9);
  assert.equal(stepCatScale(1.2, 1), 1.25);
  assert.equal(stepCatScale(0.5, -1), 0.5);

  assert.equal(scaleFromDragDelta(1, 1), 1.003);
  assert.equal(scaleFromDragDelta(1, 30), 1.1);
  assert.equal(scaleFromDragDelta(1, -30), 0.9);
  assert.equal(scaleFromDragDelta(1.2, 60), 1.25);
  assert.equal(scaleFromDragDelta(0.8, -60), 0.6);
  assert.equal(scaleFromDragDelta(0.55, -60), 0.5);

  assert.equal(shouldUseCompactControls(0.9), true);
  assert.equal(shouldUseCompactControls(0.91), false);
  assert.equal(formatCatScale(1.249), '125%');
});

test('renderer exposes a draggable cat size button without a floating panel', () => {
  const html = readSource('src', 'renderer', 'index.html');
  const css = readSource('src', 'renderer', 'styles.css');
  const renderer = readSource('src', 'renderer', 'renderer.js');
  const preload = readSource('src', 'main', 'preload.js');
  const main = readSource('src', 'main', 'main.js');

  assert.match(html, /id="catSizeBtn"/);
  assert.match(html, /class="toolbar-primary"/);
  assert.match(html, /class="toolbar-utility"/);
  assert.match(html, /<div class="toolbar-primary"[\s\S]*id="waterCounter"[\s\S]*id="clipboardBtn"[\s\S]*id="roomBtn"[\s\S]*<\/div>\s*<div class="toolbar-utility"[\s\S]*id="catSizeBtn"/);
  assert.match(html, /id="catSizeBtn"[\s\S]*?<svg[^>]*class="ui-icon cat-size-icon"[^>]*data-icon="move-diagonal"/);
  assert.doesNotMatch(html, /<span class="sketch-btn-icon">Aa<\/span>/);
  assert.doesNotMatch(html, /id="catSizePanel"/);
  assert.doesNotMatch(html, /id="catSizeDecreaseBtn"/);
  assert.doesNotMatch(html, /id="catSizeIncreaseBtn"/);
  assert.doesNotMatch(html, /id="catSizeResetBtn"/);
  assert.doesNotMatch(html, /id="catSizeValue"/);

  assert.match(css, /--cat-scale:\s*1/);
  assert.match(css, /\.stage\s*\{[\s\S]*transform:\s*scale\(var\(--cat-scale\)\)/);
  const bottomBarCss = readCssBlock(css, '.bottom-bar');
  assert.match(bottomBarCss, /left:\s*50%/);
  assert.match(bottomBarCss, /transform:\s*translateX\(-50%\)\s+scale\(var\(--cat-scale\)\)/);
  assert.match(bottomBarCss, /display:\s*flex/);
  assert.match(bottomBarCss, /align-items:\s*center/);
  assert.match(bottomBarCss, /justify-content:\s*center/);
  assert.match(bottomBarCss, /gap:\s*6px/);
  assert.match(bottomBarCss, /overflow:\s*visible/);
  assert.match(bottomBarCss, /opacity:\s*0/);
  assert.match(bottomBarCss, /pointer-events:\s*none/);
  assert.match(bottomBarCss, /visibility:\s*hidden/);
  assert.doesNotMatch(bottomBarCss, /right:\s*4px/);
  assert.doesNotMatch(bottomBarCss, /display:\s*grid/);
  assert.doesNotMatch(bottomBarCss, /grid-template-columns/);
  const visibleBottomBarCss = readCssBlock(css, '.is-bottom-controls-visible .bottom-bar');
  assert.match(visibleBottomBarCss, /opacity:\s*1/);
  assert.match(visibleBottomBarCss, /pointer-events:\s*auto/);
  assert.match(visibleBottomBarCss, /visibility:\s*visible/);
  assert.doesNotMatch(css, /\.is-cat-size-control-visible\s+\.bottom-bar\s*\{[\s\S]*grid-template-columns/);
  assert.match(css, /\.toolbar-primary\s*\{[\s\S]*display:\s*flex/);
  assert.match(css, /\.toolbar-primary\s*\{[\s\S]*justify-content:\s*center/);
  assert.match(css, /\.toolbar-primary\s*\{[\s\S]*gap:\s*6px/);
  const primaryToolbarButtonCss = readCssBlock(css, '.toolbar-primary .sketch-btn');
  assert.match(primaryToolbarButtonCss, /width:\s*40px/);
  assert.match(primaryToolbarButtonCss, /padding:\s*0/);
  const primaryToolbarTextCss = readCssBlock(css, '.toolbar-primary .sketch-btn-text');
  assert.match(primaryToolbarTextCss, /display:\s*none/);
  assert.doesNotMatch(css, /\.toolbar-primary\s+\.water-counter\s*\{[\s\S]*width:\s*58px/);
  const utilityToolbarCss = readCssBlock(css, '.toolbar-utility');
  assert.match(utilityToolbarCss, /display:\s*flex/);
  assert.match(utilityToolbarCss, /gap:\s*6px/);
  assert.doesNotMatch(utilityToolbarCss, /position:\s*absolute/);
  assert.doesNotMatch(utilityToolbarCss, /left:\s*calc\(100%\s*\+\s*6px\)/);
  const catSizeButtonCss = readCssBlock(css, '.bottom-bar .cat-size-btn');
  assert.match(catSizeButtonCss, /justify-content:\s*center/);
  assert.match(catSizeButtonCss, /align-items:\s*center/);
  assert.match(css, /\.bottom-bar\s+\.cat-size-btn\s*\{[\s\S]*width:\s*34px/);
  assert.match(css, /\.bottom-bar\s+\.cat-size-btn\s*\{[\s\S]*height:\s*34px/);
  assert.match(css, /\.bottom-bar\s+\.cat-size-btn\s*\{[\s\S]*opacity:\s*0/);
  assert.match(css, /\.bottom-bar\s+\.cat-size-btn\s*\{[\s\S]*pointer-events:\s*none/);
  assert.match(css, /\.bottom-bar\s+\.cat-size-btn\s*\{[\s\S]*visibility:\s*hidden/);
  assert.match(css, /\.bottom-bar\s+\.cat-size-btn\s*\{[\s\S]*transform:\s*translateY\(6px\)\s+scale\(0\.92\)/);
  assert.match(css, /\.is-cat-size-control-visible\s+\.bottom-bar\s+\.cat-size-btn\s*\{[\s\S]*opacity:\s*1/);
  assert.match(css, /\.is-cat-size-control-visible\s+\.bottom-bar\s+\.cat-size-btn\s*\{[\s\S]*pointer-events:\s*auto/);
  assert.match(css, /\.is-cat-size-control-visible\s+\.bottom-bar\s+\.cat-size-btn\s*\{[\s\S]*visibility:\s*visible/);
  assert.match(css, /\.is-cat-size-control-visible\s+\.bottom-bar\s+\.cat-size-btn\s*\{[\s\S]*transform:\s*translateY\(0\)\s+scale\(1\)/);
  assert.match(css, /\.bottom-bar\s+\.cat-size-btn\s+\.sketch-btn-text\s*\{[\s\S]*display:\s*none/);
  const compactToolbarButtonCss = readCssBlock(css, '.bottom-bar.is-compact .toolbar-primary .sketch-btn');
  assert.doesNotMatch(compactToolbarButtonCss, /sketch-btn-text/);
  assert.match(css, /\.is-cat-resizing\s+\.stage\s*\{[\s\S]*transition:\s*none/);
  assert.match(css, /\.cat-size-btn\s*\{[\s\S]*cursor:\s*nwse-resize/);
  assert.match(css, /\.cat-size-btn\.is-resizing/);
  assert.match(css, /\.ui-icon\s*\{[\s\S]*width:\s*18px/);
  assert.match(css, /\.ui-icon\s*\{[\s\S]*height:\s*18px/);
  assert.match(css, /\.ui-icon\s*\{[\s\S]*stroke-width:\s*2\.25/);
  const catSizeIconCss = readCssBlock(css, '.cat-size-icon');
  assert.match(catSizeIconCss, /transform:\s*scaleX\(-1\)/);
  assert.match(catSizeIconCss, /transform-origin:\s*center/);
  assert.doesNotMatch(catSizeIconCss, /grid-template-columns/);
  assert.doesNotMatch(catSizeIconCss, /background:\s*#050505/);

  assert.match(renderer, /CAT_SIZE_STORAGE_KEY/);
  assert.match(renderer, /CAT_SIZE_DRAG_PIXELS/);
  assert.match(renderer, /catSizeBtn\?\.addEventListener\('pointerdown'/);
  assert.match(renderer, /window\.addEventListener\('pointermove'/);
  assert.match(renderer, /window\.addEventListener\('pointerup'/);
  assert.match(renderer, /localStorage\.setItem\(CAT_SIZE_STORAGE_KEY/);
  assert.match(preload, /setCatScale:\s*\(scale\)\s*=>\s*ipcRenderer\.send\('pet:set-scale',\s*scale\)/);
  assert.match(renderer, /window\.desktopCat\?\.setCatScale\?\.\(catScale\)/);
  assert.match(main, /let\s+currentCatScale\s*=\s*CAT_SCALE_DEFAULT/);
  assert.match(main, /ipcMain\.on\('pet:set-scale'/);
  assert.match(renderer, /is-bottom-controls-visible/);
  assert.match(renderer, /is-cat-size-control-visible/);
  assert.match(renderer, /stage\?\.addEventListener\('pointerenter'/);
  assert.match(renderer, /isPointOverPetVisible/);
  assert.match(renderer, /document\.documentElement\.classList\.add\('is-cat-resizing'\)/);
  assert.match(renderer, /document\.documentElement\.classList\.remove\('is-cat-resizing'\)/);
  assert.match(renderer, /--cat-scale/);
});

test('pet window leaves safe room for the maximum cat scale and bottom controls', () => {
  const options = createPetWindowOptions({ preloadPath: 'preload.js' });
  const stageSize = 240;
  const minimumHorizontalBreathingRoom = 32;
  const primaryControlsWidth = 40 * 4 + 6 * 3;
  const utilityControlsWidth = 34 * 2 + 6;
  const bottomControlsMinimumWidth = (primaryControlsWidth + 6 + utilityControlsWidth) * CAT_SCALE_MAX + 8 * 2;

  assert.ok(
    options.width <= 340,
    `window width ${options.width} should keep the transparent floating window compact`
  );

  assert.ok(
    options.width >= stageSize * CAT_SCALE_MAX + minimumHorizontalBreathingRoom,
    `window width ${options.width} should fit max scaled stage without edge clipping`
  );
  assert.ok(
    options.width >= bottomControlsMinimumWidth,
    `window width ${options.width} should fit the bottom controls without squeezing text`
  );
  assert.equal(scaleFromDragDelta(1, 1, CAT_SCALE_DRAG_PIXELS), 1.003);
});
