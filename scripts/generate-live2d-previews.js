const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const rendererRoot = path.join(projectRoot, 'src', 'renderer');
const live2dModelsRoot = path.join(rendererRoot, 'live2d-models');
const vendorRoot = path.join(rendererRoot, 'vendor', 'live2d');

const models = [
  { id: 'Haru', json: path.join(live2dModelsRoot, 'Haru', 'Haru.model3.json') },
  { id: 'Hiyori', json: path.join(live2dModelsRoot, 'Hiyori', 'Hiyori.model3.json') },
  { id: 'Mao', json: path.join(live2dModelsRoot, 'Mao', 'Mao.model3.json') }
];

function fileUrl(filePath) {
  return pathToFileURL(filePath).toString();
}

function createPreviewPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body {
        margin: 0;
        width: 360px;
        height: 360px;
        overflow: hidden;
        background: transparent;
      }

      canvas {
        display: block;
      }
    </style>
  </head>
  <body>
    <canvas id="preview" width="360" height="360"></canvas>
    <script src="${fileUrl(path.join(vendorRoot, 'live2dcubismcore.min.js'))}"></script>
    <script src="${fileUrl(path.join(vendorRoot, 'pixi.min.js'))}"></script>
    <script src="${fileUrl(path.join(vendorRoot, 'pixi-live2d-cubism4.min.js'))}"></script>
    <script>
      const canvas = document.getElementById('preview');
      const pixiApp = new PIXI.Application({
        view: canvas,
        width: 360,
        height: 360,
        transparent: true,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        preserveDrawingBuffer: true
      });

      let currentModel = null;

      function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      function fitModelToCanvas(model) {
        const bounds = model.getLocalBounds?.() || { width: model.width || 1, height: model.height || 1 };
        const width = Math.max(bounds.width || model.width || 1, 1);
        const height = Math.max(bounds.height || model.height || 1, 1);
        const scale = Math.min((canvas.width * 0.82) / width, (canvas.height * 0.96) / height);

        if (model.anchor?.set) {
          model.anchor.set(0.5, 1);
        }
        model.scale.set(scale);
        model.x = canvas.width / 2;
        model.y = canvas.height * 0.98;
      }

      window.renderLive2DPreview = async (modelUrl) => {
        if (currentModel) {
          pixiApp.stage.removeChild(currentModel);
          currentModel.destroy?.({ children: true, texture: false, baseTexture: false });
          currentModel = null;
        }

        pixiApp.renderer.clear();
        const model = await PIXI.live2d.Live2DModel.from(modelUrl);
        fitModelToCanvas(model);
        pixiApp.stage.addChild(model);
        currentModel = model;

        for (let i = 0; i < 8; i += 1) {
          model.update?.(16.67);
          pixiApp.renderer.render(pixiApp.stage);
          await wait(16);
        }

        pixiApp.renderer.render(pixiApp.stage);
        return canvas.toDataURL('image/png');
      };
    </script>
  </body>
</html>`;
}

async function main() {
  await app.whenReady();

  const win = new BrowserWindow({
    width: 360,
    height: 360,
    show: false,
    transparent: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  });

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createPreviewPage())}`);

  for (const model of models) {
    const dataUrl = await win.webContents.executeJavaScript(
      `window.renderLive2DPreview(${JSON.stringify(fileUrl(model.json))})`
    );
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const outputPath = path.join(path.dirname(model.json), 'preview.png');
    fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
    console.log(`Generated ${path.relative(projectRoot, outputPath)}`);
  }

  win.destroy();
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
