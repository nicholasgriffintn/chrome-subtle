(function initialiseSubtlePopup() {
  "use strict";
  SubtleLearnLauncher.start();
  SubtlePopup.start().catch(SubtlePopup.showStartError);
})();
