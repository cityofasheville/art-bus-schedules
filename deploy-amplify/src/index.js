import { AmplifyClient, StartJobCommand, GetJobCommand } from "@aws-sdk/client-amplify";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const amplifyClient = new AmplifyClient({ region: "us-east-1" });
const secretsClient = new SecretsManagerClient({ region: "us-east-1" });

// Cached at cold start to avoid a Secrets Manager call on every request.
let cachedApiKey = null;

async function getApiKey() {
  if (cachedApiKey) return cachedApiKey;
  const command = new GetSecretValueCommand({ SecretId: process.env.API_KEY_SECRET_NAME });
  const response = await secretsClient.send(command);
  cachedApiKey = JSON.parse(response.SecretString).API_KEY;
  return cachedApiKey;
}

const respond = (statusCode, body) => ({
  statusCode,
  body: JSON.stringify(body),
});

function authenticate(event, apiKey) {
  const authHeader = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return token === apiKey;
}

async function startBuild() {
  const command = new StartJobCommand({
    appId: process.env.appId,
    branchName: process.env.branch,
    jobType: "RELEASE",
  });
  const response = await amplifyClient.send(command);
  const jobId = response.jobSummary.jobId;
  console.log("Amplify build started, jobId:", jobId);
  return jobId;
}

async function getJobStatus(jobId) {
  const command = new GetJobCommand({
    appId: process.env.appId,
    branchName: process.env.branch,
    jobId,
  });
  const response = await amplifyClient.send(command);
  const status = response.job.summary.status;
  console.log(`Job ${jobId} status: ${status}`);
  return status;
}

export const handler = async (event) => {
  try {

    //Authenticate request
    const apiKey = await getApiKey();
    if (!authenticate(event, apiKey)) {
      return respond(401, { message: "Unauthorized" });
    }

    const segments = event.rawPath.split("/");
    const route = segments[1];

    // Start route
    if (route === "start") {
      try {
        const jobId = await startBuild();
        return respond(200, { jobId });
      } catch (error) {
        if (error.name === "LimitExceededException") {
          return respond(409, { message: "A build is already pending or running." });
        }
        throw error;
      }
    }

    // Status route
    if (route === "status") {
      const jobId = segments[2];
      if (!jobId) return respond(400, { message: "jobId is required" });
      const status = await getJobStatus(jobId);
      return respond(200, { jobId, status });
    }

    return respond(404, { message: "Not found" });
  } catch (error) {
    console.error("Unhandled error:", error);
    return respond(500, { message: "Internal server error" });
  }
};