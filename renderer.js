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
      requestGameFiltering();
    }, 300);
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
      requestGameFiltering();
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

function requestGameFiltering() {
  ipcRenderer.send('filterGames', '');
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
