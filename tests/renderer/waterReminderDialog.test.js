const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf-8');
}

function readCssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?\\}`))?.[0] || '';
}

test('renderer shows a water reminder dialog when reminder triggers', () => {
  const html = readSource('src', 'renderer', 'index.html');
  const css = readSource('src', 'renderer', 'styles.css');
  const preload = readSource('src', 'main', 'preload.js');
  const script = readSource('src', 'renderer', 'waterPanel.js');

  assert.match(html, /id="waterReminderDialog"/);
  assert.match(html, /id="waterReminderTitle"/);
  assert.match(html, /id="waterReminderText"/);
  assert.match(html, /id="waterReminderDrinkBtn"/);
  assert.match(html, /id="waterReminderSnoozeBtn"/);
  assert.match(html, /id="waterReminderWaterActions"/);
  assert.match(html, /id="waterReminderTaskActions"/);
  assert.match(html, /id="waterReminderDoneBtn"/);
  assert.match(html, /id="waterReminderLaterBtn"/);
  assert.match(html, /id="waterReminderClose"/);
  assert.match(html, /id="waterTaskNameInput"/);
  assert.match(html, /id="waterTaskAddBtn"/);
  assert.match(html, /id="waterTaskNewIntervals"/);
  assert.match(html, /id="waterTaskList"/);

  assert.match(css, /\.water-reminder-dialog\s*\{/);
  assert.match(css, /\.water-reminder-dialog\.show\s*\{/);
  assert.match(css, /\.water-reminder-dialog\.is-task-reminder\s+\.water-reminder-actions-task\s*\{/);
  assert.match(css, /\.water-task-input\s*\{/);
  assert.match(css, /\.water-task-section\s*\{/);
  assert.match(css, /\.water-task-list\s*\{/);
  assert.match(css, /\.water-task-item\s*\{/);
  assert.match(css, /\.water-panel-body::-webkit-scrollbar\s*\{/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /\.water-panel-section-label\s*\{/);

  assert.match(preload, /addTaskReminder:\s*\(task\)\s*=>\s*ipcRenderer\.invoke\('water-reminder:add-task', task\)/);
  assert.match(preload, /removeTaskReminder:\s*\(taskId\)\s*=>\s*ipcRenderer\.invoke\('water-reminder:remove-task', taskId\)/);
  assert.match(preload, /toggleTask:\s*\(taskId\)\s*=>\s*ipcRenderer\.invoke\('water-reminder:toggle-task', taskId\)/);
  assert.match(preload, /setTaskInterval:\s*\(taskId,\s*minutes\)\s*=>\s*ipcRenderer\.invoke\('water-reminder:set-task-interval', taskId, minutes\)/);
  assert.match(preload, /completeTask:\s*\(taskId\)\s*=>\s*ipcRenderer\.invoke\('water-reminder:complete-task', taskId\)/);

  assert.match(script, /onTrigger/);
  assert.match(script, /openReminderDialog/);
  assert.match(script, /taskReminders/);
  assert.match(script, /renderTaskReminders/);
  assert.match(script, /addTaskReminder/);
  assert.match(script, /removeTaskReminder/);
  assert.match(script, /toggleTask/);
  assert.match(script, /setTaskInterval/);
  assert.match(script, /waterReminderTitle\.textContent/);
  assert.match(script, /classList\.toggle\('is-task-reminder'/);
  assert.match(script, /completeTaskReminder/);
  assert.match(script, /waterReminderDoneBtn/);
  assert.match(script, /payload\?\.type/);
  assert.match(script, /waterPanelToggle[\s\S]*?refreshConfig\(\)/);
  assert.match(script, /waterReminderDialog\.classList\.add\('show'\)/);
});

test('water reminder dialog and floating panels keep a compact fixed width', () => {
  const css = readSource('src', 'renderer', 'styles.css');
  const reminderCss = readCssBlock(css, '.water-reminder-dialog');
  const reminderShownCss = readCssBlock(css, '.water-reminder-dialog.show');
  const panelCss = readCssBlock(css, '.sketch-panel');
  const panelShownCss = readCssBlock(css, '.sketch-panel.show');

  assert.match(reminderCss, /left:\s*50%/);
  assert.doesNotMatch(reminderCss, /right:\s*14px/);
  assert.match(reminderCss, /width:\s*min\(292px,\s*calc\(100vw\s*-\s*28px\)\)/);
  assert.match(reminderCss, /transform:\s*translateX\(-50%\)\s+translateY\(8px\)\s+scale\(0\.98\)/);
  assert.match(reminderShownCss, /transform:\s*translateX\(-50%\)\s+translateY\(0\)\s+scale\(1\)/);

  assert.match(panelCss, /left:\s*50%/);
  assert.doesNotMatch(panelCss, /right:\s*14px/);
  assert.match(panelCss, /width:\s*min\(292px,\s*calc\(100vw\s*-\s*28px\)\)/);
  assert.match(panelCss, /transform:\s*translateX\(-50%\)\s+translateY\(8px\)\s+scale\(0\.98\)/);
  assert.match(panelShownCss, /transform:\s*translateX\(-50%\)\s+translateY\(0\)\s+scale\(1\)/);
});
