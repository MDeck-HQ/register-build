import * as core from "@actions/core";

async function run() {}

run().catch(e => {
  core.setFailed(e.message);
});
