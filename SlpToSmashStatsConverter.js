const {
  default: SlippiGame,
  stages: stageUtil,
  moves: movesUtil,
  characters: charactersUtil,
} = require('@slippi/slippi-js');
const slippiStats = require('./stats');
const moment = require('moment');
const hash = require('object-hash');

const convertSLP = filePath => {
  let playerCodes = [];
  let data = {};
  let gameHash = null;
  try {
    const game = new SlippiGame(filePath);
    const settings = game.getSettings();
    const metadata = game.getMetadata();
    const stats = game.getStats();
    const gameEnd = game.getGameEnd();
    const latestFrame = game.getLatestFrame();

    for (const [player, playerObj] of Object.entries(metadata.players)) {
      let code = playerObj.names.code;
      if (code.length < 3) {
        code = '';
      }
      playerCodes.push(code);
    }

    if (metadata.startAt) {
      metadata.startAtEpoch = new Date(metadata.startAt).getTime() / 1000;
    } else {
      throw Error('Game does not have a valid start time');
    }

    if (playerCodes.length !== 2) {
      throw Error('Game does not have 2 valid players');
    }

    const gameObj = {
      filePath,
      settings,
      stats,
      metadata,
      latestFrame,
      gameEnd,
    };
    const gameObjArr = [gameObj];
    const computedStats = slippiStats.generateOutput(gameObjArr);
    const [p1ComputedInfo, p2ComputedInfo] = computedStats.games[0].players;
    const [p1Info, p2Info] = settings.players;
    // verify that computed stats have matching player indexes as regular stats
    if (p1Info && p2Info && p1ComputedInfo && p2ComputedInfo) {
      if (p1Info.characterId !== p1ComputedInfo.characterId) {
        throw Error('Game stat parsing failed - invalid players');
      }
      if (p2Info.characterId !== p2ComputedInfo.characterId) {
        throw Error('Game stat parsing failed - invalid players');
      }
    } else {
      throw Error('Game stat parsing failed - invalid players');
    }
    const killMoves = computedStats.summary[3];
    const neutralOpenerMoves = computedStats.summary[4];
    const earlyKills = computedStats.summary[5];
    const lateDeaths = computedStats.summary[6];
    const selfDestructs = computedStats.summary[7];
    const avgKillPercent = computedStats.summary[9];
    const highDamagePunishes = computedStats.summary[10];
    if (
      killMoves.id !== 'killMoves' ||
      neutralOpenerMoves.id !== 'neutralOpenerMoves' ||
      earlyKills.id !== 'earlyKills' ||
      lateDeaths.id !== 'lateDeaths' ||
      selfDestructs.id !== 'selfDestructs' ||
      avgKillPercent.id !== 'avgKillPercent' ||
      highDamagePunishes.id !== 'highDamagePunishes'
    ) {
      throw Error(
        'Game stat parsing failed - computed stats dont match expected order'
      );
    }
    //console.log('killMoves', killMoves.results[1].result);
    //console.log('neutralOpenerMoves', neutralOpenerMoves.results[1].result);
    //console.log('earlyKills', earlyKills.results[1].simple.number); // unnessary
    //console.log('lateDeaths', lateDeaths.results[1].simple.number); // unnessary
    //console.log('earlyKills', earlyKills.results[0]);
    //console.log('lateDeaths', lateDeaths.results[0]);
    //console.log('selfDestructs', selfDestructs.results[1].result);
    //console.log('avgKillPercent', avgKillPercent.results[1].result);
    // console.log(
    //   'highDamagePunishes',
    //   highDamagePunishes.results[1].simple.number
    // ); // unnessary
    //console.log('highDamagePunishes', highDamagePunishes.results[0]);

    // build data object with relevant game data
    data.slpVersion = settings.slpVersion;
    data.playedOn = metadata.playedOn;
    data.isPAL = settings.isPAL;
    data.stageId = settings.stageId;
    data.stageName = stageUtil.getStageName(settings.stageId);
    data.startAt = metadata.startAt;
    data.startAtEpoch = metadata.startAtEpoch;
    data.duration = convertFrameCountToDurationString(
      metadata.lastFrame,
      settings.isPAL
    );
    data.durationSeconds = convertFrameCountToDurationSeconds(
      metadata.lastFrame,
      settings.isPAL
    );
    // invalid/incomplete game (less than 30 seconds or no deaths)
    if (
      data.durationSeconds < 30 ||
      !stats.stocks ||
      stats.stocks.length === 0
    ) {
      data.isValid = false;
    } else {
      // valid game
      data.isValid = true;
    }
    data.lastFrame = metadata.lastFrame;
    data.playableFrameCount = stats.playableFrameCount;
    data.gameComplete = stats.gameComplete;
    data.gameEndMethod = gameEnd.gameEndMethod;
    data.lrasInitiatorIndex = gameEnd.lrasInitiatorIndex;
    data.winningPlayer = -1; // updated later
    data.stocks = stats.stocks;
    data.players = {};
    settings.players.forEach(player => {
      let { playerIndex, port, characterId, characterColor } = player;
      let { names, characters } = metadata.players[`${playerIndex}`];
      let [actionCounts] = stats.actionCounts.filter(
        p => p.playerIndex === playerIndex
      );
      delete actionCounts.playerIndex;
      delete actionCounts.opponentIndex;
      let [overall] = stats.overall.filter(p => p.playerIndex === playerIndex);
      delete overall.playerIndex;
      delete overall.opponentIndex;

      // add stats from computed stats
      overall.killMoves = killMoves.results[playerIndex].result;
      overall.neutralOpenerMoves =
        neutralOpenerMoves.results[playerIndex].result;
      overall.avgKillPercent = avgKillPercent.results[playerIndex].result;
      overall.highDamagePunishes =
        highDamagePunishes.results[playerIndex].simple.number;
      overall.earlyKills = earlyKills.results[playerIndex].simple.number;
      overall.lateDeaths = lateDeaths.results[playerIndex].simple.number;
      overall.selfDestructs = selfDestructs.results[playerIndex].result;

      const playerGameResult =
        computedStats.games[0].players[playerIndex].gameResult;
      if (playerGameResult === 'winner') {
        data.winningPlayer = playerIndex;
      }
      const finalStockCount =
        computedStats.games[0].players[playerIndex].finalStockCount;

      data.players[`${playerIndex}`] = {
        playerIndex,
        name: names.netplay,
        code: names.code,
        port,
        characterId,
        characterColor,
        characterName: charactersUtil.getCharacterName(characterId),
        characterColorName: charactersUtil.getCharacterColorName(
          characterId,
          characterColor
        ),
        gameResult: playerGameResult,
        finalStockCount,
        stats: Object.assign({}, actionCounts, overall),
      };
    });
    gameHash = hash(data);
    data.hash = gameHash;
    data = JSON.stringify(data);
  } catch (err) {
    data = JSON.stringify({});
    playerCodes = [];
    gameHash = null;
    console.log('Error processing game: ' + filePath + ' | ' + err.message);
  }
  return { data, playerCodes, gameHash };
};

function convertFrameCountToDurationString(frameCount, isPal = false) {
  const fps = isPal ? 50 : 60;
  const duration = moment.duration(frameCount / fps, 'seconds');
  return moment.utc(duration.as('milliseconds')).format('m:ss');
}

function convertFrameCountToDurationSeconds(frameCount, isPal = false) {
  const fps = isPal ? 50 : 60;
  return Math.round(frameCount / fps);
}

exports.convertSLP = convertSLP;
