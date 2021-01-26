// Modules to control application life and create native browser window
// todo: hide link when uploading new games
const {
  ipcMain,
  app,
  BrowserWindow,
  dialog,
  ipcRenderer,
  shell,
} = require('electron');
const { default: SlippiGame } = require('@slippi/slippi-js');
const { performance } = require('perf_hooks');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const filenamify = require('filenamify');
const Store = require('electron-store');
const store = new Store();
const constants = require('./constants');
const WebSocket = require('ws');
const smashStatsConverter = require('./SlpToSmashStatsConverter');
const { Message, MessageStatus } = require('./Message');
let wsClient;

let SLP_DIRECTORY;
let GAME_DIRECTORY;
let CODE_KEYS = {};
let UNPROCESSED_SLP = [];
let PROCESSED_GAMES = new Set();
let PROCESSED_GAMES_META = {};
let SELECTED_PLAYER_CODE = '';

let GAMES_TO_UPLOAD = [];

let ERROR_MESSAGE;

function openURL(url) {
  shell.openExternal(url);
}

function hashCode(str) {
  var hash = 0,
    i = 0,
    len = str.length;
  while (i < len) {
    hash = ((hash << 5) - hash + str.charCodeAt(i++)) << 0;
  }
  return hash;
}

// exception handling
process
  .on('unhandledRejection', (reason, p) => {
    console.error(reason, 'Unhandled Rejection at Promise', p);
  })
  .on('uncaughtException', err => {
    console.error(err, 'Uncaught Exception thrown');
    process.exit(1);
  });

function loadStateFromStore() {
  loadSlpDirFromStore();
  loadGameDirFromStore();
  //loadCodeKeysFromStore();
  loadSelectedPlayerCodeFromStore();
  loadKeysFromJson();
  loadMetaDataFromJson();
}

function loadKeysFromJson() {
  CODE_KEYS = null;
  if (gameDirIsValid()) {
    try {
      const filePath = path.join(GAME_DIRECTORY, '..', 'keys.json');
      const rawData = fs.readFileSync(filePath);
      const data = JSON.parse(rawData);
      CODE_KEYS = data;
    } catch (err) {
      console.log('keys.json not found');
      CODE_KEYS = {};
    }
  }
  if (typeof CODE_KEYS === 'object' && CODE_KEYS !== null) {
    // ok
  } else {
    CODE_KEYS = {};
  }
}

function loadMetaDataFromJson() {
  PROCESSED_GAMES_META = null;
  if (gameDirIsValid()) {
    try {
      const filePath = path.join(GAME_DIRECTORY, '..', 'metadata.json');
      const rawData = fs.readFileSync(filePath);
      const data = JSON.parse(rawData);
      PROCESSED_GAMES_META = data;
    } catch (err) {
      console.log('metadata.json not found');
      PROCESSED_GAMES_META = {};
    }
  }
  if (
    typeof PROCESSED_GAMES_META === 'object' &&
    PROCESSED_GAMES_META !== null
  ) {
    // ok
  } else {
    PROCESSED_GAMES_META = {};
  }
}

function readJsonFromFile(filePath) {
  let json = null;
  try {
    const rawData = fs.readFileSync(filePath);
    json = JSON.parse(rawData);
  } catch (err) {
    json = null;
  }
  return json;
}

function loadCodeKeysFromStore() {
  // get code keys object from store
  const codeKeys = store.get('CODE_KEYS');
  if (typeof codeKeys === 'object' && codeKeys !== null) {
    CODE_KEYS = codeKeys;
  } else {
    CODE_KEYS = {};
  }
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

function addCodeKey(code, key, id) {
  CODE_KEYS[code] = { key, id };
  // now write keys.json
  const outputFilePath = path.join(GAME_DIRECTORY, '..', 'keys');
  const stream = fs.createWriteStream(`${outputFilePath}.json`);
  stream.once('open', () => {
    stream.write(JSON.stringify(CODE_KEYS));
    stream.end();
  });
}

async function getUploadKeyId(playerCode) {
  if (playerCode && playerCode.length < 3) {
    console.log("Can't get key for invalid player code");
    return null;
  }
  if (CODE_KEYS[playerCode] !== undefined) {
    const { key, id } = CODE_KEYS[playerCode];
    if (key && id) {
      // already a valid key in store
      return { key, id };
    }
  }
  // no valid key locally, request new key from server
  else {
    const response = await getNewKeyFromServer(playerCode);
    if (response === null) {
      ERROR_MESSAGE =
        'Could not get upload key from server. Check you are connected to the internet.';
      return null;
    } else {
      // add new key to CODE_KEYS (keys.json)
      addCodeKey(response.code, response.key, response.id);
      // return new key and id
      return CODE_KEYS[response.code];
    }
  }
}

async function getNewKeyFromServer(playerCode) {
  try {
    const response = await axios.post(
      `${constants.SERVER_URL}/api/player/new`,
      { code: playerCode }
    );
    console.log('response.data', response.data);
    const id = response.data.id;
    const code = response.data.code;
    const key = response.data.key;
    if (id && code === playerCode && key && key.length === 36) {
      // success
      console.log(code + ' - ' + key + ' - ' + id);
      return { code, key, id };
    } else {
      // error
      throw Error('Could not get a new key from server');
    }
  } catch (error) {
    ERROR_MESSAGE = error.message;
    return null;
  }
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
// get server connection status
ipcMain.on('getConnectionStatus', (event, arg) => {
  axios
    .get(`${constants.SERVER_URL}/api/misc/ping`)
    .then(response => {
      if (!isNaN(response.data.time)) {
        // success
        event.reply('setConnectionStatus', {
          connected: true,
        });
      } else {
        // error
        throw Error(
          `Could not connect to server. Check you are connected to the internet.`
        );
      }
    })
    .catch(error => {
      ERROR_MESSAGE = `Could not connect to server. Check you are connected to the internet.`;
      event.reply('setConnectionStatus', {
        connected: false,
      });
    });
});

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
  // extracts structured game data from slippi file
  let { data, playerCodes, gameHash } = smashStatsConverter.convertSLP(
    filePath
  );
  // for uploaded metadata property
  const uploadedObj = {};
  playerCodes.forEach(pc => {
    uploadedObj[pc] = 0;
  });
  // update metadata
  PROCESSED_GAMES_META[hashCode(fileName)] = {
    players: playerCodes,
    uploaded: uploadedObj,
    hash: gameHash,
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
ipcMain.on('openURL', (event, url) => {
  openURL(url);
});

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
  // load games that need to be uploaded
  loadGamesToUpload();
  event.reply('selectedPlayerCode', {
    code,
    games,
    toUploadCount: GAMES_TO_UPLOAD.length,
  });
});

// set selected player code from renderer selection
ipcMain.on('selectPlayerCode', (event, code) => {
  console.log('MAIN: selectPlayerCode');
  setSelectedPlayerCode(code);
  const games = getValidGamesForPlayerCode(SELECTED_PLAYER_CODE);
  // load games that need to be uploaded
  loadGamesToUpload();
  event.reply('selectedPlayerCode', {
    code: SELECTED_PLAYER_CODE,
    games,
    toUploadCount: GAMES_TO_UPLOAD.length,
  });
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

// for calculating estimated time remaining
let totalUploadedGames = 0;
let totalUploadedGamesTime = 0;
let uploadStartTime = 0;

// upload game request
ipcMain.on('uploadNextGame', (event, arg) => {
  // for estimating time remaining
  uploadStartTime = performance.now();
  // first processNextGame call from renderer
  if (arg === 'start') {
    totalUploadedGames = 0;
    totalUploadedGamesTime = 0;
  }
  const totalToUpload = GAMES_TO_UPLOAD.length;
  // all games have been uploaded
  if (totalToUpload === 0) {
    event.reply('uploadProgressUpdate', { finished: true });
    return;
  }

  // pop unuploaded game
  const { filePath: fileName, hash } = GAMES_TO_UPLOAD.pop();
  const filePath = path.join(GAME_DIRECTORY, `${fileName}.json`);
  const gameObj = readJsonFromFile(filePath);

  // hash mismatch
  if (gameObj.hash !== hash) {
    console.log('Error: uploadNextGame - gameObj and metadata hash mismatch');
  }
  // valid WebSocket client
  else if (wsClient !== undefined && wsClient !== null) {
    wsClient.event = event;
    sendMessage(
      new Message(MessageStatus.UPLOAD_GAME, { gameObj, hash, fileName }),
      wsClient
    );
  }
  // error
  else {
    console.log('Error: Invalid WebSocket Client');
  }
});

function loadGamesToUpload() {
  GAMES_TO_UPLOAD = [];
  loadProcessedGames();
  PROCESSED_GAMES.forEach(game => {
    try {
      const fileName = path.basename(game, '.json');
      const metadata = PROCESSED_GAMES_META[hashCode(fileName)];
      if (metadata !== undefined) {
        // game hasn't been uploaded to server yet and has a valid hash
        if (
          metadata.uploaded[SELECTED_PLAYER_CODE] === 0 &&
          metadata.hash !== undefined &&
          metadata.hash &&
          metadata.hash.length > 5
        ) {
          // check player codes
          const [p1, p2] = metadata.players;
          // both players have codes and the selected player code is one of the players
          if (
            p1 !== null &&
            p2 !== null &&
            p1.length > 2 &&
            p2.length > 2 &&
            (p1 === SELECTED_PLAYER_CODE || p2 === SELECTED_PLAYER_CODE)
          ) {
            // game is valid for upload
            const uploadInfo = {
              filePath: game,
              hash: metadata.hash,
            };
            // add game to the upload queue
            GAMES_TO_UPLOAD.push(uploadInfo);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });
}

// upload new processed games
ipcMain.on('uploadGames', async (event, arg) => {
  loadGamesToUpload();
  console.log('MAIN: uploadGames');
  // get key for uploading
  const resp = await getUploadKeyId(SELECTED_PLAYER_CODE);
  if (resp !== null && resp.key && resp.id) {
    const { key, id } = resp;
    // now we have a list of games to upload
    if (GAMES_TO_UPLOAD.length > 0) {
      createWebSocketClient(key, id, event);
    } else {
      console.log('No games to upload');
    }
  } else {
    // upload error - can't get valid key
    event.reply('uploadInitFailed', '');
  }
});

// upload new processed games
ipcMain.on('getPlayerLink', (event, arg) => {
  console.log('MAIN: getPlayerLink');
  if (CODE_KEYS[SELECTED_PLAYER_CODE] !== undefined) {
    const { id } = CODE_KEYS[SELECTED_PLAYER_CODE];
    if (id && id.length === 8) {
      axios
        .get(`${constants.SERVER_URL}/api/player/hasuploaded/${id}`)
        .then(response => {
          if (response.data.uploaded) {
            let url = constants.FRONTEND_URL;
            url += `/${id}`;
            // success
            event.reply('setPlayerLink', { url, success: true });
          } else {
            // error
            throw Error(`Could not verify player has uploaded games.`);
          }
        })
        .catch(error => {
          //event.reply('setPlayerLink', { url, success: false });
        });
    }
  }
});

function createWebSocketClient(key, id, event) {
  console.log('createWebSocketClient');
  wsClient = new WebSocket(constants.SERVER_WSS_URL);
  wsClient.event = event;

  wsClient.on('open', () => {
    const authPayload = { key, id };
    sendMessage(new Message(MessageStatus.AUTHENTICATE, authPayload), wsClient);
  });

  wsClient.on('message', msg => {
    parseMessage(msg, wsClient);
  });
}

// sends web socket message to the server
function sendMessage(message, ws) {
  try {
    // needs to be in JSON format to send
    ws.send(JSON.stringify(message));
  } catch (err) {
    console.error('sendMessage ERROR', err);
  }
}

function parseMessage(message, ws) {
  try {
    message = JSON.parse(message);
  } catch (err) {
    return;
  }
  // don't log heartbeats since they clutter the log
  // if (message.status != MessageStatus.HEARTBEAT) {
  //   console.log('Message Received: ' + message.status);
  // }
  switch (message.status) {
    case MessageStatus.AUTHENTICATE:
      processAuthenticateResponse(message.payload, ws);
      break;
    case MessageStatus.UPLOAD_GAME:
      processUploadGameResponse(message.payload, ws);
      break;
  }
}

function processAuthenticateResponse({ validated }, ws) {
  if (validated) {
    ws.event.reply('uploadInitStarted', GAMES_TO_UPLOAD.length);
  } else {
    ERROR_MESSAGE = 'Unable to verify upload key with server';
    ws.event.reply('uploadInitFailed', '');
  }
}

function processUploadGameResponse({ hash, fileName, success }, ws) {
  if (success) {
    success = 1;
  } else {
    success = 0;
  }
  // update metadata
  const hashed = hashCode(fileName);
  if (PROCESSED_GAMES_META[hashed].hash === hash) {
    // update uploaded status for game
    PROCESSED_GAMES_META[hashCode(fileName)].uploaded[
      SELECTED_PLAYER_CODE
    ] = success;
  } else {
    console.log('Error: metadata game hash mismatch with uploaded game');
  }

  // write metadata.json
  const metaOutputFilePath = path.join(GAME_DIRECTORY, '..', 'metadata');
  const metaStream = fs.createWriteStream(`${metaOutputFilePath}.json`);
  metaStream.once('open', () => {
    metaStream.write(JSON.stringify(PROCESSED_GAMES_META));
    metaStream.end();

    const uploadEndTime = performance.now();
    const timeTaken = uploadEndTime - uploadStartTime + 50;
    totalUploadedGames++;
    totalUploadedGamesTime += timeTaken;
    const avgTimeTaken = totalUploadedGamesTime / totalUploadedGames;
    // notify renderer of progress
    ws.event.reply('uploadProgressUpdate', {
      finished: false,
      avgTimeTaken,
      totalUploadedGames,
    });
  });
}
