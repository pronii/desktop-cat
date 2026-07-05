const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8');
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ preventDefault() {}, ...event, target: this });
    }
  }
}

async function flushAsync() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function createHarness({
  activateResult = { status: 'active' },
  initialState = { status: 'none' }
} = {}) {
  const ids = ['licenseKeyInput', 'licenseActivateBtn', 'licenseStatusText'];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const activateCalls = [];

  vm.runInNewContext(readSource('src', 'renderer', 'licensePanel.js'), {
    window: {
      desktopCat: {
        license: {
          getState: async () => initialState,
          activate: async (licenseKey) => {
            activateCalls.push(licenseKey);
            return activateResult;
          }
        }
      }
    },
    document: {
      getElementById: (id) => elements.get(id) || null
    },
    console,
    setImmediate
  });

  return { elements, activateCalls };
}

test('license panel activates a typed license key and renders active state', async () => {
  const harness = createHarness();
  const input = harness.elements.get('licenseKeyInput');
  const button = harness.elements.get('licenseActivateBtn');
  const status = harness.elements.get('licenseStatusText');

  input.value = ' DCAT-1111-2222-3333 ';
  button.dispatch('click');
  await flushAsync();

  assert.deepEqual(harness.activateCalls, ['DCAT-1111-2222-3333']);
  assert.match(status.textContent, /active|激活/i);
});
