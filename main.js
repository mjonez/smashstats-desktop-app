// Modules to control application life and create native browser window
const { ipcMain, app, BrowserWindow, dialog } = require('electron');
const { default: SlippiGame } = require('@slippi/slippi-js');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');
const store = new Store();

let SLP_DIRECTORY;
let GAME_DIRECTORY;
let KEY;
let LAST_GAME_COUNT;
let UNPROCESSED_SLP;
let PROCESSED_GAMES = new Set();

let ERROR_MESSAGE;

function loadStateFromStore() {
  loadSlpDirFromStore();
  loadGameDirFromStore();
  loadKeyFromStore();
  loadLastGameCountFromStore();
}

function loadKeyFromStore() {
  // get key from store (may return undefined if no uploads have been made)
  KEY = store.get('KEY');
}

function loadSlpDirFromStore() {
  // get SLP directory path from store
  SLP_DIRECTORY = store.get('SLP_DIRECTORY');
  // no SLP directory path stored, attempt to locate one in documents folder
  if (
    SLP_DIRECTORY === undefined ||
    SLP_DIRECTORY === '' ||
    !fs.existsSync(SLP_DIRECTORY)
  ) {
    const docPath = app.getPath('documents');
    if (fs.existsSync(docPath)) {
      // documents folder exists
      SLP_DIRECTORY = docPath;
      const slippiPath = path.join(docPath, 'Slippi');
      if (fs.existsSync(slippiPath)) {
        // slippi folder exists
        SLP_DIRECTORY = slippiPath;
      }
    }
    if (SLP_DIRECTORY === undefined) {
      SLP_DIRECTORY = '';
    }
    store.set('SLP_DIRECTORY', SLP_DIRECTORY);
  }
}

function loadGameDirFromStore() {
  // get game directory path from store
  GAME_DIRECTORY = store.get('GAME_DIRECTORY');
  // no game path stored, attempt to locate one in documents folder
  if (
    GAME_DIRECTORY === undefined ||
    GAME_DIRECTORY === '' ||
    !fs.existsSync(GAME_DIRECTORY)
  ) {
    const docPath = app.getPath('documents');
    if (fs.existsSync(docPath)) {
      // documents folder exists
      GAME_DIRECTORY = docPath;
      let gamePath = path.join(docPath, 'SmashStats');
      if (fs.existsSync(gamePath)) {
        // game folder exists
        GAME_DIRECTORY = gamePath;
      } else {
        // create 'SmashStats' directory if doesn't exist
        try {
          fs.mkdirSync(gamePath);
          // create 'Games' sub-directory
          gamePath = path.join(gamePath, 'Games');
          fs.mkdirSync(gamePath);
          GAME_DIRECTORY = gamePath;
        } catch (error) {}
      }
    }
    if (
      GAME_DIRECTORY === undefined ||
      GAME_DIRECTORY === null ||
      !GAME_DIRECTORY
    ) {
      GAME_DIRECTORY = '';
    }
    store.set('GAME_DIRECTORY', GAME_DIRECTORY);
  }

  // directory not created properly
  if (!gameDirIsValid()) {
    // Error message
    ERROR_MESSAGE =
      'SmashStats folder could not be created. Do you have permission to write files locally?';
    console.log(`ERROR: ${ERROR_MESSAGE}`);
  }
}

function loadLastGameCountFromStore() {
  // get last game count from store
  LAST_GAME_COUNT = store.get('LAST_GAME_COUNT');
  // no last game count stored, init to 0
  if (LAST_GAME_COUNT === undefined) {
    LAST_GAME_COUNT = 0;
    store.set('LAST_GAME_COUNT', LAST_GAME_COUNT);
  }
}

function loadProcessedGames() {
  if (gameDirIsValid()) {
    fs.readdirSync(GAME_DIRECTORY, function (err, files) {
      files.forEach(file => {
        if (path.extname(file).toLowerCase() === '.json') {
          const fileName = path.basename(file, '.json');
          // add filename to processed games set
          PROCESSED_GAMES.add(fileName);
        }
      });
    });
  }
}

function gameDirIsValid() {
  return (
    GAME_DIRECTORY.includes('SmashStats') &&
    GAME_DIRECTORY.includes('Games') &&
    fs.existsSync(GAME_DIRECTORY)
  );
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 740,
    webPreferences: { nodeIntegration: true, enableRemoteModule: true },
  });

  // and load the index.html of the app.
  mainWindow.loadFile('index.html');

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  loadStateFromStore();
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// calls from renderer
// get slp directory for renderer
ipcMain.on('getDir', (event, arg) => {
  // update renderer
  event.reply('setDir', SLP_DIRECTORY);
});

// open directory selector dialog
ipcMain.on('selectDir', async (event, arg) => {
  //show open dialog
  const result = await dialog.showOpenDialog({
    defaultPath: '~/',
    properties: ['openDirectory'],
  });
  let path = undefined;
  if (result.filePaths && result.filePaths.length > 0) {
    path = result.filePaths[0];
  }
  if (path !== undefined) {
    // update SLP directory var
    SLP_DIRECTORY = path;
    store.set('SLP_DIRECTORY', SLP_DIRECTORY);
    // update renderer
    event.reply('setDir', SLP_DIRECTORY);
  }
});

// scan SLP directory
ipcMain.on('scanDir', async (event, arg) => {
  UNPROCESSED_SLP = new Set();
  if (PROCESSED_GAMES.size === 0) {
    loadProcessedGames();
  }
  fs.readdir(SLP_DIRECTORY, function (err, files) {
    let slpCount = 0;
    let processedCount = 0;
    files.forEach(file => {
      if (path.extname(file).toLowerCase() === '.slp') {
        console.log(slpCount + ' - ' + file);
        slpCount++;
        const fileName = path.basename(file, '.slp');
        if (PROCESSED_GAMES.has(fileName)) {
          // game has already been processed
          processedCount++;
        } else {
          // game has not been processed - queue for processing
          UNPROCESSED_SLP.add(file);
        }
      }
    });
    const info = {
      slpCount,
      newSlpCount: slpCount - processedCount,
    };
    event.reply('scanDirComplete', info);
  });
});

// error message request
ipcMain.on('getError', (event, arg) => {
  if (ERROR_MESSAGE !== undefined && ERROR_MESSAGE.length > 0) {
    // if there has been an error - tell renderer
    event.reply('error', ERROR_MESSAGE);
    // clear error message
    ERROR_MESSAGE = undefined;
  }
});

// process games request
ipcMain.on('processGames', async (event, arg) => {
  const totalUnprocessed = UNPROCESSED_SLP.size;
  UNPROCESSED_SLP.forEach((file, index) => {
    const filePath = path.join(SLP_DIRECTORY, file);
    const fileName = path.basename(file, '.slp');

    const game = new SlippiGame(filePath);
    const settings = game.getSettings();
    const metadata = game.getMetadata();
    const stats = game.getStats();
    const gameEnd = game.getGameEnd();
    //console.log(settings);
    //console.log(metadata);
    //console.log(metadata.players);
    //console.log(stats);
    //console.log(stats.overall);

    const gameObj = {
      settings,
      metadata,
      stats,
      gameEnd,
    };
    const data = JSON.stringify(gameObj);

    const outputFilePath = path.join(GAME_DIRECTORY, fileName);
    var stream = fs.createWriteStream(`${outputFilePath}.json`);
    stream.once('open', function (fd) {
      stream.write(data);
      stream.end();
    });
    //fs.writeFile(`${outputFilePath}.json`, data, (err, data) => {

    console.log(`Wrote file: ${outputFilePath}.json (${index + 1})`);
    // event.reply('processingProgressUpdate', {
    //   current: index + 1,
    //   total: totalUnprocessed,
    // });
  });
});
