import * as core from "@actions/core";
import { customAlphabet } from "nanoid/non-secure";

async function run() {
  core.debug("Checking provided build-id");
  let buildId = core.getInput("build-id");
  if (!buildId) {
    throw new Error("build-id is required");
  }

  // Generate a build ID if value is "auto"
  if (buildId === "auto") {
    core.debug("Generating build-id");

    // Generated build-id is the short commit SHA+random suffixed with the build number
    const commitSha = process.env.GITHUB_SHA?.substring(0, 6);
    const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
    const runNumber = process.env.GITHUB_RUN_NUMBER;
    const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

    if (!commitSha || !runAttempt || !runNumber) {
      // If the commit SHA or build number is not available, fallback to a random build ID
      // Chance of collision is:
      // 0.18% with 100k builds
      // 0.002% with 10k builds
      core.debug(`Generating random build-id`);
      buildId = nanoid(8);
    } else {
      // The generated build ID is made of the following parts:
      // - The first 6 characters of the commit SHA (makes it easier to find the commit without querying the API)
      // - The run number
      // - The run attempt (differentiates between retries)
      core.debug(`Generating build-id from commit SHA and build number`);
      buildId = `${commitSha}${runNumber}`;

      if (runAttempt && runAttempt !== "1") {
        buildId += `-${runAttempt}`;
      }
    }

    core.debug(`Generated build-id: ${buildId}`);
  } else {
    // Build ID must be between 1 and 100 characters long and can only contain sensible characters.
    // Characters allowed: a-z, A-Z, 0-9, [-_.$#:;]
    if (!/^[a-zA-Z0-9\-_.$#:;]{1,100}$/.test(buildId)) {
      throw new Error(
        "Invalid build-id. Must be between 1 and 100 characters long and can only contain alphanumeric characters, and the following special characters: -_.$#:;",
      );
    }
  }

  core.saveState("build_number", buildId);
}

run().catch(e => {
  core.setFailed(e.message);
});
