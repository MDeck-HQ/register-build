import { nanoid } from "nanoid";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as core from "@actions/core";
import artifact, { ArtifactNotFoundError } from "@actions/artifact";
import {
  BUILD_VERSION_FILE_NAME,
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
    repository_id: Number(repositoryId),
    workflow_run_id: Number(runId),
    branch_name: branch,
    org_login: orgLogin,
  };
}

async function deleteArtifactIfExists(artifactName: string): Promise<void> {
  try {
    await artifact.deleteArtifact(artifactName);
  } catch (error) {
    if (error instanceof ArtifactNotFoundError) {
      core.debug(`Skipping deletion of '${artifactName}', it does not exist`);
      return;
    }

    // Best effort, we don't want to fail the action if this fails
    core.debug(`Unable to delete artifact: ${(error as Error).message}`);
  }
}

export async function uploadArtifact({
  name,
  content,
  filename,
}: {
  name: string;
  filename: string;
  content: string;
}) {
  // First try to delete the artifact if it exists
  await deleteArtifactIfExists(name);

  const appPrefix = "dot-deploy";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), appPrefix));
  const file = path.join(tmpDir, filename);
  await fs.writeFile(file, content);

  const { id, size } = await artifact.uploadArtifact(name, [file], tmpDir, {
    retentionDays: 1,
    compressionLevel: 0,
  });

  return { id, size };
}

export async function registerBuildStart() {
  const metadata = getMetadata();
  const verificationToken = nanoid(32);
  let tmpDir: string = "";

  // Save the metadata to a temp file and upload it to the build artifact
  try {
    const { id, size } = await uploadArtifact({
      name: DOT_DEPLOY_ARTIFACT_NAME,
      filename: VERIFICATION_TOKEN_FILE_NAME,
      content: verificationToken,
    });

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
    core.debug(`Metadata: ${JSON.stringify(metadata)}`);

    const response = await client.postJson<RegisterBuildResponse>(url, body);

    if (response.statusCode <= 299) {
      core.debug("Successfully registered build start");
    } else {
      core.debug("Failed to register build start");
      core.debug(`Status: ${response.statusCode}`);
      core.debug(`Body: ${JSON.stringify(response.result)}`);
      throw new Error(
        `Failed to register build start: Got response code ${response.statusCode}`,
      );
    }

    if (response.result?.status !== "ok") {
      core.debug(`Status: ${response.statusCode}`);
      core.debug(`Body: ${JSON.stringify(response.result)}`);
      throw new Error("Failed to register build start");
    }

    const build_id = response.result.build?.id;

    core.saveState("build_id", build_id);
    core.saveState("artifact_id", id);
    core.saveState("verification_token", verificationToken);
  } catch (error) {
    core.error("Error registering build start");
    core.setFailed(error as Error);
    throw error;
  } finally {
    if (tmpDir) {
      fs.rmdir(tmpDir).catch(() => {
        core.debug("Error removing temp directory");
      });
    }
  }
}

export async function registerBuildId() {
  const buildId = core.getState("build_id");
  const buildVersion = core.getState("version");

  if (!buildId) {
    throw new Error("Build version not found.");
  }

  const content = JSON.stringify({ version: buildVersion, id: buildId });

  const { size, id } = await uploadArtifact({
    name: DOT_DEPLOY_ARTIFACT_NAME,
    filename: BUILD_VERSION_FILE_NAME,
    content: content,
  });

  core.debug(`Created artifact ${id} with size ${size}`);
  core.info(`Registered build version ${buildId}`);
  return {
    id,
    size,
    buildId,
  };
}

export type BuildInfo = {
  version: string;
};

export async function writeBuildSummary({ version }: BuildInfo) {
  const repoName = process.env.GITHUB_REPOSITORY!.split("/")[1].toLowerCase();

  const summary = [
    "## dot.Deploy Build Info",
    `The build version \`${version}\` was registered with dot.Deploy`,
    "You can run the following commands on Slack to interact with this build:",
    `  - \`/dd repo deploy -b ${version} -r ${repoName} -e <your-environment>\`: Deploy the build to an environment`,
    `  - \`/dd build describe -b ${version} -r ${repoName}\`: View information about this build`,
    `  - \`/dd build taint -b ${version} -r ${repoName} -m <reason> \`: Mark the build as bad`,
  ];

  core.summary.addRaw(summary.join("\n"), true);
  await core.summary.write();
}
