// @ts-check
import { nanoid } from "nanoid";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";
import {
  DOT_DEPLOY_API_BASE_URL,
  DOT_DEPLOY_ARTIFACT_NAME,
  VERIFICATION_TOKEN_FILE_NAME,
} from "./constants";
import { HttpClient } from "@actions/http-client";
import { RegisterBuildResponse } from "./types";

export function getMetadata() {
  const repositoryId = process.env.GITHUB_REPOSITORY_ID;
  const runId = process.env.GITHUB_RUN_ID;
  const branch = process.env.GITHUB_REF_NAME;
  const orgLogin = process.env.GITHUB_REPOSITORY_OWNER;

  return {
    repository_id: repositoryId,
    workflow_run_id: runId,
    branch_name: branch,
    org_login: orgLogin,
  };
}

export async function registerBuildStart() {
  const metadata = getMetadata();
  const verificationToken = nanoid(32);
  const appPrefix = "dot-deploy";
  let tmpDir: string = "";

  // Save the metadata to a temp file and upload it to the build artifact
  try {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), appPrefix));
    const verificationTokenFile = path.join(
      tmpDir,
      VERIFICATION_TOKEN_FILE_NAME,
    );
    await fs.writeFile(verificationTokenFile, verificationToken);

    const artifact = new DefaultArtifactClient();
    const { id, size } = await artifact.uploadArtifact(
      DOT_DEPLOY_ARTIFACT_NAME,
      [verificationTokenFile],
      tmpDir,
      {
        retentionDays: 1,
        compressionLevel: 0,
      },
    );

    core.debug(`Created artifact ${id} with size ${size}`);
    core.debug("Notifying dot-deploy of build start");

    const client = new HttpClient("dot-deploy");
    const url = `${DOT_DEPLOY_API_BASE_URL}/actions/builds/register`;
    const body = {
      ...metadata,
      artifact_id: id,
      verification_token: verificationToken,
    };

    core.debug(`Registering build start at ${url}`);

    const response = await client.postJson<RegisterBuildResponse>(url, body);

    if (response.statusCode <= 299) {
      core.debug("Successfully registered build start");
    } else {
      core.error("Failed to register build start");
      core.error(`Status: ${response.statusCode}`);
      core.error(`Body: ${response.result}`);
      throw new Error("Failed to register build start");
    }

    if (response.result?.status !== "ok") {
      core.error("Failed to register build start");
      core.error(`Status: ${response.statusCode}`);
      core.error(`Body: ${response.result}`);
      return;
    }

    core.saveState("build_id", id);
    core.setOutput("artifact_id", id);
    core.setOutput("verification_token", verificationToken);
    core.saveState("artifact_id", id);
    core.saveState("verification_token", verificationToken);
  } catch (error) {
    core.error("Error registering build start");
    throw error;
  } finally {
    if (tmpDir) {
      fs.rmdir(tmpDir).catch(() => {
        core.debug("Error removing temp directory");
      });
    }
  }
}
