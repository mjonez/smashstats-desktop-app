const { ipcRenderer } = require('electron');
const humanizeDuration = require('humanize-duration');

let totalUnprocessedGameCount = 0;
init();

function init() {
  // request error message
  ipcRenderer.send('getError', '');
  setInterval(() => {
    // request error message every 5 secs
    ipcRenderer.send('getError', '');
  }, 5000);

  // request slippi dir input text to be set
  ipcRenderer.send('getDir', '');

  // request connection status to server
  ipcRenderer.send('getConnectionStatus', '');
  setInterval(() => {
    // request error message every 5 secs
    ipcRenderer.send('getConnectionStatus', '');
  }, 15000);

  // hide some stuff
  // hide process progress bar
  $('.progress-container').hide();
  // hide upload progress bar
  $('.progress-container-u').hide();
  // hide link container
  $('#linkContainer').hide();
}

ipcRenderer.on('setConnectionStatus', (event, { connected }) => {
  if (connected) {
    $('#connectionStatusIcon').addClass('connected');
    $('#connectionStatusText').html(`Connected to Server`);
  } else {
    $('#connectionStatusIcon').removeClass('connected');
    $('#connectionStatusText').html(`Could not connect to Server`);
  }
});

ipcRenderer.on('setPlayerLink', (event, { url, success }) => {
  if (success) {
    // set link text
    $('#linkText').html(url);
    // show link container
    $('#linkContainer').show();
  }
});

ipcRenderer.on('setDir', (event, args) => {
  // set input field text
  $('#slpDirInput').attr('value', args);

  // request directory to be scanned
  ipcRenderer.send('scanDir', '');
  // hide scan results and show loader
  $('#scanResults').hide();
  $('#dirLoader_container').fadeIn(500);

  // hide process progress bar
  $('.progress-container').hide();

  // hide player games container
  $('#playerSelection').hide();

  // hide link container
  $('#linkContainer').hide();
});

ipcRenderer.on('scanDirComplete', (event, { slpCount, newSlpCount }) => {
  totalUnprocessedGameCount = newSlpCount;
  $('#gamesFound').html(slpCount);
  // no new games
  if (totalUnprocessedGameCount <= 0) {
    // processed games label
    $('#ngfLabel').html(
      `<i class="check icon" style="margin-right: 0"></i> All games processed`
    );
    // hide process button
    $('#scanResultsProcessBtn').hide();

    setTimeout(() => {
      requestSelectedPlayerCode();
    }, 2300);
  }
  // new games
  else {
    $('#ngfLabel').html(`${totalUnprocessedGameCount} new games`);
    $('#scanResultsProcessBtn').show();
    $('#scanResultsProcessBtn').prop('disabled', false);
    $('#scanResultsProcessBtn').removeClass('loading');
  }

  setTimeout(() => {
    $('#dirLoader_container').fadeOut(280, () => {
      $('#scanResults').fadeIn(280);
    });
  }, 1000);
});

ipcRenderer.on('error', (event, args) => {
  // show error modal
  $('#errorModalLabel').html(args);
  $('#errorModal').fadeIn(500);
});

let processTimeDisplayUpdateInterval = 15;
ipcRenderer.on(
  'processingProgressUpdate',
  (event, { finished, avgTimeTaken, totalProcessedGames }) => {
    // all games have been processed
    if (finished) {
      // set to default
      processTimeDisplayUpdateInterval = 15;

      $('#processTimeLabel').hide();
      $('#processingProgress').progress('complete');
      $('#scanResultsProcessBtn').removeClass('loading');
      $('#scanResultsProcessBtn').hide();
      // processed games label
      $('#ngfLabel').html(
        `<i class="check icon" style="margin-right: 0"></i> All games processed`
      );
      setTimeout(() => {
        $('.progress-container').fadeOut(400);
      }, 500);
      setTimeout(() => {
        requestSelectedPlayerCode();
      }, 700);
    }
    // still games needing to be processed
    else {
      $('#processingProgress').progress('increment');
      $('#scanResultsProcessBtn').addClass('loading');

      if (
        avgTimeTaken &&
        avgTimeTaken > 0 &&
        totalProcessedGames > 10 &&
        totalProcessedGames % processTimeDisplayUpdateInterval === 0
      ) {
        const processedGames = $('#processingProgress').progress('get value');
        const totalGames = $('#processingProgress').progress('get total');
        const gamesLeft = totalGames - processedGames;
        const timeLeftMs = gamesLeft * avgTimeTaken;
        let timeRemainingText = '';
        if (timeLeftMs <= 65000) {
          processTimeDisplayUpdateInterval = 6;
          timeRemainingText = '1 minute';
        } else {
          timeRemainingText = humanizeDuration(timeLeftMs, {
            largest: 1,
            round: true,
          });
        }
        $('#processTimeRemaining').html(timeRemainingText);
        if ($('#processTimeLabel').is(':hidden')) {
          $('#processTimeLabel').fadeIn(2000);
        }
        // arbitrary number of games left to fade out the time remaining label
        if (gamesLeft === 14) {
          $('#processTimeLabel').fadeOut(2000);
        }
      }

      // request next game to be processed
      ipcRenderer.send('processNextGame', '');
    }
  }
);

ipcRenderer.on(
  'selectedPlayerCode',
  (event, { code, games, toUploadCount }) => {
    showPlayerGames(code, games, toUploadCount);
  }
);

ipcRenderer.on('allPlayerCodes', (event, playerCodes) => {
  openPlayerCodeSelectionModal(playerCodes);
});

let uploadTimeDisplayUpdateInterval = 15;
ipcRenderer.on(
  'uploadProgressUpdate',
  (event, { finished, avgTimeTaken, totalUploadedGames }) => {
    // all games have been processed
    if (finished) {
      // set to default
      uploadTimeDisplayUpdateInterval = 15;

      $('#uploadTimeLabel').hide();
      $('#uploadProgress').progress('complete');
      $('#uploadGamesBtn').removeClass('loading');
      $('#uploadGamesBtn').hide();
      $('#playerQuestionSubHeading').html(
        `<i class="check icon" style="margin-right: 0"></i> All valid games uploaded`
      );
      // uploaded games label
      // $('#ngfLabel').html(
      //   `<i class="check icon" style="margin-right: 0"></i> All games processed`
      // );
      setTimeout(() => {
        $('.progress-container-u').fadeOut(400, () => {
          setTimeout(() => {
            requestPlayerLink();
          }, 200);
        });
      }, 500);
    }
    // still games needing to be uploaded
    else {
      $('#uploadProgress').progress('increment');
      $('#uploadGamesBtn').addClass('loading');

      if (
        avgTimeTaken &&
        avgTimeTaken > 0 &&
        totalUploadedGames > 10 &&
        totalUploadedGames % uploadTimeDisplayUpdateInterval === 0
      ) {
        const uploadedGames = $('#uploadProgress').progress('get value');
        const totalGames = $('#uploadProgress').progress('get total');
        const gamesLeft = totalGames - uploadedGames;
        const timeLeftMs = gamesLeft * avgTimeTaken;
        let timeRemainingText = '';
        if (timeLeftMs <= 65000) {
          uploadTimeDisplayUpdateInterval = 6;
          timeRemainingText = '1 minute';
        } else {
          timeRemainingText = humanizeDuration(timeLeftMs, {
            largest: 1,
            round: true,
          });
        }
        $('#uploadTimeRemaining').html(timeRemainingText);
        if ($('#uploadTimeLabel').is(':hidden')) {
          $('#uploadTimeLabel').fadeIn(2000);
        }
        // arbitrary number of games left to fade out the time remaining label
        if (gamesLeft === 14) {
          $('#uploadTimeLabel').fadeOut(2000);
        }
      }

      // request next game to be uploaded
      ipcRenderer.send('uploadNextGame', '');
    }
  }
);

ipcRenderer.on('uploadInitStarted', (event, arg) => {
  startUpload(arg);
});

function startUpload(toUploadCount) {
  $('#linkContainer').hide(); // hide link while we show progress bar
  $('#uploadTimeLabel').hide();
  $('#uploadProgress').progress('reset');
  $('#uploadProgress').progress({
    total: toUploadCount,
    text: {
      active: 'Uploaded {value} of {total} new games',
      success: 'All games have been uploaded!',
    },
  });
  $('.progress-container-u').fadeIn(1400);
  ipcRenderer.send('uploadNextGame', 'start');
}

ipcRenderer.on('uploadInitFailed', (event, arg) => {
  // enable upload button again
  $('#uploadGamesBtn').prop('disabled', false);
  $('#uploadGamesBtn').removeClass('loading');
});

function openPlayerCodeSelectionModal(playerCodes) {
  const content = $('#playerCodesModalContent');
  content.empty();
  let html = '';
  playerCodes.forEach(plrCode => {
    html += getPlayerCodeContainerHTML(plrCode);
  });
  // no valid games
  if (playerCodes.length === 0) {
    html = '<h2>No Valid Games</h2>';
  }
  content.append(html);
  $('#playerCodesModal').modal('show');
}

function getPlayerCodeContainerHTML({ code, games }) {
  let html = '';
  html += `<div style="width: 48%" class="playercode-container hvr-shrink" onclick="selectPlayerCode('${code}')">`;
  html += `<div class="container playercode">`;
  html += `<h3 class="ui header">`;
  html += `<img src="./assets/images/user.png" />`;
  html += `<div class="content font">`;
  html += `<span>${code}</span>`;
  html += `<div class="sub header font subtext">${games} valid games</div>`;
  html += `</div>`;
  html += `</h3>`;
  html += `</div>`;
  html += `</div>`;
  return html;
}

function selectPlayerCode(code) {
  ipcRenderer.send('selectPlayerCode', code);
  $('#playerCodesModal').modal('hide');
}

function showPlayerGames(code, games, toUploadCount) {
  // hide link container
  $('#linkContainer').hide();
  $('#uploadGamesBtn').hide();
  $('#playerSelection').show();
  $('#playerQuestionSubHeading').removeClass('red');
  // invalid games
  if (code.length < 2 || games <= 0) {
    $('#playerChangeBtn').html('No Valid Games');
    $('#playerQuestionSubHeading').html(
      'There were no valid games found. Only Slippi rollback games are supported.'
    );
    $('#playerQuestionSubHeading').addClass('red');
  }
  // valid games
  else {
    $('#playerChangeBtn').html(code);
    $('#playerQuestionSubHeading').html(`${games} valid games`);

    // request player link
    setTimeout(() => {
      requestPlayerLink();
    }, 750);

    // there are valid games queued for upload
    if (toUploadCount > 0) {
      let postfix = 's';
      if (toUploadCount === 1) {
        postfix = '';
      }
      // set upload button text
      $('#uploadGamesBtnText').html(
        `Upload ${toUploadCount} New Game${postfix}`
      );
      // enable upload button
      $('#uploadGamesBtn').prop('disabled', false);
      $('#uploadGamesBtn').removeClass('loading');
      $('#uploadGamesBtn').show();
    } else {
      $('#playerQuestionSubHeading').html(
        `<i class="check icon" style="margin-right: 0"></i> All valid games uploaded`
      );
    }
  }
}

function requestSelectedPlayerCode() {
  ipcRenderer.send('getSelectedPlayerCode', '');
}

function requestAllPlayerCodes() {
  ipcRenderer.send('getAllPlayerCodes', '');
}

function requestPlayerLink() {
  ipcRenderer.send('getPlayerLink', '');
}

function requestOpenURL(url) {
  if (!url) {
    url = $('#linkText').html();
  }
  ipcRenderer.send('openURL', url);
}

// open dir explorer btn
$('#selectDirContainer').on('click', () => {
  ipcRenderer.send('selectDir', '');
});
// error modal close btn
$('#errorModalCloseBtn').on('click', () => {
  $('#errorModal').fadeOut(100);
});
// game process btn
$('#scanResultsProcessBtn').on('click', () => {
  $('#processTimeLabel').hide();
  $('#scanResultsProcessBtn').prop('disabled', true);
  $('#processingProgress').progress('reset');
  $('#processingProgress').progress({
    total: totalUnprocessedGameCount,
    text: {
      active: 'Processed {value} of {total} games',
      success: 'All games have been processed!',
    },
  });
  $('.progress-container').fadeIn(1400);
  ipcRenderer.send('processNextGame', 'start');
});
// change player code btn
$('#playerChangeBtn').on('click', () => {
  requestAllPlayerCodes();
});
// upload games btn
$('#uploadGamesBtn').on('click', () => {
  $('#uploadGamesBtn').prop('disabled', true);
  $('#uploadGamesBtn').addClass('loading');
  ipcRenderer.send('uploadGames', '');
});
