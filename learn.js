(function initialiseSubtleLearn() {
  "use strict";
  SubtleLearnController.start().catch((error) => {
    const status = document.querySelector("#context-status");
    if (status) status.textContent = error instanceof Error ? error.message : "Learn could not start.";
  });
})();
