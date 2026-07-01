// 启动脚本 - 清除 ELECTRON_RUN_AS_NODE 环境变量后启动 Electron
// WorkBuddy 等基于 Electron 的工具会设置此变量，导致 Electron 以 Node 模式运行
const { spawn } = require('child_process');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const appPath = path.join(__dirname, '..');

const child = spawn(electronPath, [appPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: false
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
