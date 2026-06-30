const { app, Menu, Tray, nativeImage } = require('electron');
const {
  createTrayIconDataUrl,
  createTrayMenuTemplate
} = require('../src/main/trayMenu');

async function run() {
  await app.whenReady();

  const image = nativeImage
    .createFromDataURL(createTrayIconDataUrl())
    .resize({ width: 16, height: 16 });

  const tray = new Tray(image);
  tray.setToolTip('desktop-cat tray smoke');
  tray.setContextMenu(
    Menu.buildFromTemplate(
      createTrayMenuTemplate({
        state: {
          alwaysOnTopEnabled: true
        },
        actions: {}
      })
    )
  );

  console.log(
    JSON.stringify({
      iconEmpty: image.isEmpty(),
      iconSize: image.getSize()
    })
  );

  tray.destroy();
  app.quit();
}

run().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
