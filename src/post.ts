import * as core from "@actions/core";

async function postprocess() {
  core.info("Goodbye world!");
}

postprocess().catch(e => {
  core.setFailed(e.message);
});
