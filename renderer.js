const { ipcRenderer } = require('electron');
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
}

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

ipcRenderer.on('processingProgressUpdate', (event, { finished }) => {
  // all games have been processed
  if (finished) {
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
    const remainingGames = $('#processingProgress').progress('get value');
    $('#scanResultsProcessBtn').addClass('loading');

    // request next game to be processed
    setTimeout(() => {
      ipcRenderer.send('processNextGame', '');
    }, 50);
  }
});

ipcRenderer.on('selectedPlayerCode', (event, { code, games }) => {
  showPlayerGames(code, games);
});

ipcRenderer.on('allPlayerCodes', (event, playerCodes) => {
  openPlayerCodeSelectionModal(playerCodes);
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

function showPlayerGames(code, games) {
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
    $('#uploadGamesBtn').show();
  }
}

function requestSelectedPlayerCode() {
  ipcRenderer.send('getSelectedPlayerCode', '');
}

function requestAllPlayerCodes() {
  ipcRenderer.send('getAllPlayerCodes', '');
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
  ipcRenderer.send('processNextGame', '');
});
// change player code btn
$('#playerChangeBtn').on('click', () => {
  requestAllPlayerCodes();
});
