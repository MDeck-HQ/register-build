import * as core from "@actions/core";
import { registerBuildId } from "./lib/build";

async function postprocess() {
  // Registering the build ID is the last step of the process
  // This will upload an artifact with the build ID. dot.Deploy will pull this artifact to get the build ID.
  await registerBuildId();
}

postprocess().catch(e => {
  core.setFailed(e.message);
});
