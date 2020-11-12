// Modules to control application life and create native browser window
const { ipcMain, app, BrowserWindow, dialog } = require('electron');
const { default: SlippiGame } = require('@slippi/slippi-js');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const filenamify = require('filenamify');
const Store = require('electron-store');
const store = new Store();

let SLP_DIRECTORY;
let GAME_DIRECTORY;
let KEY;
let UNPROCESSED_SLP = [];
let PROCESSED_GAMES = new Set();
let PROCESSED_GAMES_META = {};
let SELECTED_PLAYER_CODE = '';

let ERROR_MESSAGE;

function hashCode(str) {
  var hash = 0,
    i = 0,
    len = str.length;
  while (i < len) {
    hash = ((hash << 5) - hash + str.charCodeAt(i++)) << 0;
  }
  return hash;
}

function loadStateFromStore() {
  loadSlpDirFromStore();
  loadGameDirFromStore();
  loadKeyFromStore();
  loadSelectedPlayerCodeFromStore();
  loadMetaDataFromJson();
}

function loadMetaDataFromJson() {
  if (gameDirIsValid()) {
    try {
      const metaDataFilePath = path.join(GAME_DIRECTORY, '..', 'metadata.json');
      const rawData = fs.readFileSync(metaDataFilePath);
      const data = JSON.parse(rawData);
      PROCESSED_GAMES_META = data;
    } catch (err) {
      console.log('metadata.json not found');
      PROCESSED_GAMES_META = {};
    }
  }
}

function loadKeyFromStore() {
  // get key from store (may return undefined if no uploads have been made)
  KEY = store.get('KEY');
}

function loadSelectedPlayerCodeFromStore() {
  const code = store.get('SELECTED_PLAYER_CODE');
  setSelectedPlayerCode(code);
}

function setSelectedPlayerCode(code) {
  if (code === undefined || code === null) {
    SELECTED_PLAYER_CODE = '';
  } else {
    SELECTED_PLAYER_CODE = code;
  }
  store.set('SELECTED_PLAYER_CODE', SELECTED_PLAYER_CODE);
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
    !gameDirIsValid()
  ) {
    const docPath = app.getPath('documents');
    if (fs.existsSync(docPath)) {
      // documents folder exists
      GAME_DIRECTORY = docPath;
      let gamePath = path.join(docPath, 'SmashStats');
      if (fs.existsSync(gamePath)) {
        // SmashStats folder exists
        GAME_DIRECTORY = gamePath;
        gamePath = path.join(gamePath, 'Games');
        // check Games sub-folder exists
        if (!fs.existsSync(gamePath)) {
          try {
            // create 'Games' sub-directory
            fs.mkdirSync(gamePath);
            GAME_DIRECTORY = gamePath;
          } catch (error) {}
        }
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

function loadProcessedGames() {
  PROCESSED_GAMES = new Set();
  if (gameDirIsValid()) {
    const files = fs.readdirSync(GAME_DIRECTORY);
    files.forEach(file => {
      if (path.extname(file).toLowerCase() === '.json') {
        const fileName = path.basename(file, '.json');
        // add filename to processed games set
        PROCESSED_GAMES.add(fileName);
      }
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
    width: 1100,
    height: 720,
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
  console.log('MAIN: getDir');
  // update renderer
  event.reply('setDir', SLP_DIRECTORY);
});

// open directory selector dialog
ipcMain.on('selectDir', async (event, arg) => {
  console.log('MAIN: selectDir');
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
  console.log('MAIN: scanDir');
  // load processed games
  loadProcessedGames();

  UNPROCESSED_SLP = [];
  fs.readdir(SLP_DIRECTORY, function (err, files) {
    let slpCount = 0;
    files.forEach(file => {
      if (path.extname(file).toLowerCase() === '.slp') {
        slpCount++;
        const fileName = path.basename(file, '.slp');
        if (PROCESSED_GAMES.has(fileName)) {
          // game has already been processed
        } else {
          // game has not been processed - queue for processing
          UNPROCESSED_SLP.push(file);
        }
      }
    });
    const info = {
      slpCount,
      newSlpCount: UNPROCESSED_SLP.length,
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

// for calculating estimated time remaining
let totalProcessedGames = 0;
let totalProcessedGamesTime = 0;

// process games request
ipcMain.on('processNextGame', (event, arg) => {
  // for estimating time remaining
  const processStartTime = performance.now();
  // first processNextGame call from renderer
  if (arg === 'start') {
    totalProcessedGames = 0;
    totalProcessedGamesTime = 0;
  }
  const totalUnprocessed = UNPROCESSED_SLP.length;
  // all games have been processed
  if (totalUnprocessed === 0) {
    event.reply('processingProgressUpdate', { finished: true });
    return;
  }

  // pop unprocessed game
  const file = UNPROCESSED_SLP.pop();
  const filePath = path.join(SLP_DIRECTORY, file);
  const fileName = path.basename(file, '.slp');
  let playerCodes = [];
  let data;
  try {
    const game = new SlippiGame(filePath);
    const settings = game.getSettings();
    const metadata = game.getMetadata();
    metadata.startAtEpoch = new Date(metadata.startAt).getTime() / 1000;
    const stats = game.getStats();
    const gameEnd = game.getGameEnd();

    for (const [player, playerObj] of Object.entries(metadata.players)) {
      let code = playerObj.names.code;
      if (code.length < 3) {
        code = '';
      }
      playerCodes.push(code);
    }

    const gameObj = {
      settings,
      metadata,
      stats,
      gameEnd,
    };
    data = JSON.stringify(gameObj);
  } catch (err) {
    data = JSON.stringify({});
    playerCodes = [];
    console.log('Error processing game: ' + file);
  }
  // update metadata
  PROCESSED_GAMES_META[hashCode(fileName)] = {
    players: playerCodes,
    uploaded: 0,
  };
  // write game data to json
  const outputFilePath = path.join(GAME_DIRECTORY, fileName);
  const stream = fs.createWriteStream(`${outputFilePath}.json`);
  stream.once('open', () => {
    stream.write(data);
    stream.end();

    // now write metadata.json
    const metaOutputFilePath = path.join(GAME_DIRECTORY, '..', 'metadata');
    const metaStream = fs.createWriteStream(`${metaOutputFilePath}.json`);
    metaStream.once('open', () => {
      metaStream.write(JSON.stringify(PROCESSED_GAMES_META));
      metaStream.end();
      //console.log(`Wrote file: ${outputFilePath}.json`);

      const processEndTime = performance.now();
      const timeTaken = processEndTime - processStartTime + 50;
      totalProcessedGames++;
      totalProcessedGamesTime += timeTaken;
      const avgTimeTaken = totalProcessedGamesTime / totalProcessedGames;
      // notify renderer of progress
      event.reply('processingProgressUpdate', {
        finished: false,
        avgTimeTaken,
        totalProcessedGames,
      });
    });
  });
});

function getCodeGameFreqs() {
  const frequencies = {};
  PROCESSED_GAMES.forEach(game => {
    try {
      const fileName = path.basename(game, '.json');
      const metadata = PROCESSED_GAMES_META[hashCode(fileName)];
      if (metadata !== undefined) {
        // check player codes
        metadata.players.forEach(plr => {
          if (plr !== null && plr.length > 2) {
            // update player code frequency
            const currentFreq = frequencies[plr];
            if (!currentFreq) {
              frequencies[plr] = 1;
            } else {
              frequencies[plr] = currentFreq + 1;
            }
          }
        });
      }
    } catch (error) {
      console.log(error);
    }
  });
  return frequencies;
}

function getPlayerCodesSortedByFrequency() {
  // refresh processed games
  loadProcessedGames();
  const frequencies = getCodeGameFreqs();
  // sort by frequency of occurance
  const sortable = [];
  for (const player in frequencies) {
    sortable.push([player, frequencies[player]]);
  }
  sortable.sort(function (a, b) {
    return b[1] - a[1];
  });
  return sortable;
}

function getValidGamesForPlayerCode(code) {
  // refresh processed games
  loadProcessedGames();
  const frequencies = getCodeGameFreqs();
  let games = frequencies[code];
  if (isNaN(games)) {
    return 0;
  }
  return games;
}

// get most likely player code based on frequency of occurance
ipcMain.on('getSelectedPlayerCode', (event, arg) => {
  console.log('MAIN: getSelectedPlayerCode');
  let code = '';
  let games = 0;
  // if no playercode is selected
  if (SELECTED_PLAYER_CODE === '') {
    // get most likely player code based on frequency of occurance
    const mostLikely = getPlayerCodesSortedByFrequency();
    //console.log(mostLikely);
    try {
      if (mostLikely[0] && mostLikely[0][0] && mostLikely[0][1]) {
        code = mostLikely[0][0];
        games = mostLikely[0][1];
      } else {
        code = '';
        games = 0;
      }
    } catch (error) {
      code = '';
      games = 0;
    }
  } else {
    code = SELECTED_PLAYER_CODE;
    games = getValidGamesForPlayerCode(code);
  }
  event.reply('selectedPlayerCode', { code, games });
});

// set selected player code from renderer selection
ipcMain.on('selectPlayerCode', (event, code) => {
  console.log('MAIN: selectPlayerCode');
  setSelectedPlayerCode(code);
  const games = getValidGamesForPlayerCode(SELECTED_PLAYER_CODE);
  event.reply('selectedPlayerCode', { code: SELECTED_PLAYER_CODE, games });
});

ipcMain.on('getAllPlayerCodes', (event, arg) => {
  console.log('MAIN: getAllPlayerCodes');
  const allPlayerCodes = getPlayerCodesSortedByFrequency();
  const allPlayerCodesFiltered = allPlayerCodes
    .map(playerGame => {
      let code = '';
      let games = 0;
      try {
        if (playerGame[0] !== undefined && playerGame[0].length > 2) {
          code = playerGame[0];
        }
        if (playerGame[1] !== undefined && playerGame[1] > 0) {
          games = playerGame[1];
        }
      } catch (error) {
        code = '';
        games = 0;
      }
      return { code, games };
    })
    .filter(pg => pg.code !== '');
  event.reply('allPlayerCodes', allPlayerCodesFiltered);
});

// filter processed games by player id and upload status
ipcMain.on('filterGames', (event, arg) => {
  console.log('MAIN: filterGames');
  PROCESSED_GAMES.forEach(game => {
    try {
      const fileName = path.basename(game, '.json');
      const metadata = PROCESSED_GAMES_META[hashCode(fileName)];
      if (metadata !== undefined) {
        // game hasn't been uploaded to server yet
        if (metadata.uploaded === 0) {
          // check player codes
          const [p1, p2] = metadata.players;
          // both players have codes
          if (p1 !== null && p2 !== null && p1.length > 2 && p2.length > 2) {
            //console.log(game + ' is valid');
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });
});
