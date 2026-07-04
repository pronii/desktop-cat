const path = require('node:path');
const rcedit = require('rcedit');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, `${appName}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'src', 'main', 'assets', 'tray-cat-face.ico');

  await rcedit(exePath, {
    icon: iconPath
  });
};
