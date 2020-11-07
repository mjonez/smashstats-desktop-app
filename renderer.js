const { ipcRenderer } = require('electron');
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
});

ipcRenderer.on('scanDirComplete', (event, { slpCount, newSlpCount }) => {
  $('#gamesFound').html(slpCount);
  // no new games
  if (newSlpCount <= 0) {
    // clear label
    $('#ngfPrefix').html();
    $('#newGamesFound').html();
    $('#ngfPostfix').html();
    // hide progression button
    $('#scanResultsProcessBtn').hide();
  }
  // new games
  else {
    $('#ngfPrefix').html('+');
    $('#newGamesFound').html(newSlpCount);
    $('#ngfPostfix').html(' since last upload');
    $('#scanResultsProcessBtn').show();
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

ipcRenderer.on('processingProgressUpdate', (event, { current, total }) => {
  console.log('current: ' + current + ' | total: ' + total);
  $('#processingProgress').progress('set total', total);
  $('#processingProgress').progress('set progress', current);
  $('#scanResultsProcessBtn').text(
    $('#processingProgress').progress('get value')
  );
});

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
  ipcRenderer.send('processGames', '');
  $('#processingProgress').progress('reset');
});
