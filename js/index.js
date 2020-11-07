// for alternating icons
let flipIconCount = 1;
window.setInterval(function () {
  $('#flipIconContainer').removeClass(`i_${flipIconCount}`);
  flipIconCount++;
  if (flipIconCount > 16) {
    flipIconCount = 1;
  }
  $('#flipIconContainer').addClass(`i_${flipIconCount}`);
}, 3100);
