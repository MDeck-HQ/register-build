import { registerBuildStart } from "./lib/build";
import * as core from "@actions/core";

async function preprocess() {
  await registerBuildStart();
}

preprocess().catch(e => {
  core.setFailed(e.message);
});
