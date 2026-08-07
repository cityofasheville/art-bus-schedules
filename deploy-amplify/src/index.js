import { AmplifyClient, StartJobCommand, GetJobCommand, ListJobsCommand } from "@aws-sdk/client-amplify";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";

const amplifyClient = new AmplifyClient({ region: "us-east-1" });
const secretsClient = new SecretsManagerClient({ region: "us-east-1" });
const cloudfrontClient = new CloudFrontClient({ region: "us-east-1" });

// Cached at cold start to avoid a Secrets Manager call on every request.
let cachedApiKey = null;

async function getApiKey(secretName) {
  if (cachedApiKey) return cachedApiKey;
  const command = new GetSecretValueCommand({ SecretId: secretName });
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

async function startBuild(appId, branchName) {
  const command = new StartJobCommand({
    appId,
    branchName,
    jobType: "RELEASE",
  });
  const response = await amplifyClient.send(command);
  const jobId = response.jobSummary.jobId;
  console.log("Amplify build started, jobId:", jobId);
  return jobId;
}

async function getRunningJob(appId, branchName) {
  const command = new ListJobsCommand({
    appId,
    branchName,
    maxResults: 1,
    jobStatus: "RUNNING",
  });
  const response = await amplifyClient.send(command);
  if (response.jobSummaries.length > 0) {
    return response.jobSummaries[0].jobId;
  }
  return null;
}

async function getJobStatus(appId, branchName, jobId) {
  const command = new GetJobCommand({
    appId,
    branchName,
    jobId,
  });
  const response = await amplifyClient.send(command);
  const status = response.job.summary.status;
  console.log(`Job ${jobId} status: ${status}`);
  return status;
}

// Amplify job statuses that mean the build is no longer in progress.
const TERMINAL_STATUSES = ["SUCCEED", "FAILED", "CANCELLED"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Lambda execution time to leave over so we can still return a response
// instead of being killed mid-poll.
const TIMEOUT_BUFFER_MS = 10_000;
const POLL_INTERVAL_MS = 15_000;

// Poll until the job reaches a terminal status or we run out of execution time.
// Returns { status, timedOut } - timedOut is true when the build is still running.
async function waitForJob(appId, branchName, jobId, remainingTimeMs) {
  let status = await getJobStatus(appId, branchName, jobId);

  while (!TERMINAL_STATUSES.includes(status)) {
    if (remainingTimeMs() < POLL_INTERVAL_MS + TIMEOUT_BUFFER_MS) {
      console.log(`Ran out of time waiting on job ${jobId}, last status: ${status}`);
      return { status, timedOut: true };
    }
    await sleep(POLL_INTERVAL_MS);
    status = await getJobStatus(appId, branchName, jobId);
  }

  return { status, timedOut: false };
}

async function invalidateCache(distributionId) {
  const paths = ["/*"]; // Invalidate all paths. Adjust as needed.
  const input = {
    DistributionId: distributionId,
    InvalidationBatch: {
      // CallerReference must be unique for every request to avoid retrying the same invalidation
      CallerReference: `invalidate-${Date.now()}`, 
      Paths: {
        Quantity: paths.length,
        Items: paths,
      },
    },
  };

  // Errors propagate to the caller so it can decide whether a failed purge is fatal.
  const command = new CreateInvalidationCommand(input);
  const response = await cloudfrontClient.send(command);
  console.log("Invalidation created successfully:", response.Invalidation.Id);
  return response.Invalidation.Id;
}

export const handler = async (event, context) => {
  try {

    //Authenticate request
    const secretName = process.env.API_KEY_SECRET_NAME;
    const apiKey = await getApiKey(secretName);
    // To accommodate Bedrock run_lambda triggers
    const isRunLambda = event.JobType === "run_lambda";
    const payload = isRunLambda ? event.ETLJob.etl_tasks[0] : event;
    console.log(payload);
    if (!authenticate(payload, apiKey)) {
      return respond(401, { message: "Unauthorized" });
    }

    const amplifyId = process.env.amplifyId;
    const branchName = process.env.branch;
    const cloudfrontId = process.env.cloudfrontId;

    const segments = payload.rawPath.split("/");
    const route = segments[1];
    let jobId;

    // Start route - trigger a new build or return existing running job Id
    if (route === "start") {
      try {
        jobId = await startBuild(amplifyId, branchName);
        return respond(200, { jobId });
      } catch (error) {
        if (error.name === "LimitExceededException") {
          jobId = await getRunningJob(amplifyId, branchName);
          if (!jobId) {
            return respond(409, { message: "A build is already running but could not retrieve its ID." });
          }
          return respond(200, { message: "A build is already pending or running.", jobExists: true, jobId });
        }
        throw error;
      }
    }

    // Start-and-wait route - trigger a new build (or pick up the existing running
    // job), then poll until it finishes before responding. Intended for Bedrock
    // run_lambda, which invokes this function directly and so is not subject to the
    // ~30s API Gateway integration timeout that would kill this over HTTP.
    if (route === "start-and-wait") {
      let jobExists = false;
      try {
        jobId = await startBuild(amplifyId, branchName);
      } catch (error) {
        if (error.name !== "LimitExceededException") throw error;
        jobId = await getRunningJob(amplifyId, branchName);
        if (!jobId) {
          return respond(409, { message: "A build is already running but could not retrieve its ID." });
        }
        jobExists = true;
        console.log("A build is already pending or running, waiting on jobId:", jobId);
      }

      // Bound polling by the Lambda's own remaining execution time.
      // Falls back to a fixed window for local testing.
      const localDeadline = Date.now() + 15 * 60 * 1000;
      const remainingTimeMs = context?.getRemainingTimeInMillis
        ? () => context.getRemainingTimeInMillis()
        : () => localDeadline - Date.now();

      const { status, timedOut } = await waitForJob(amplifyId, branchName, jobId, remainingTimeMs);

      // Still building - hand the jobId back so the caller can poll /status/{jobId}
      if (timedOut) {
        return respond(202, { message: "Build is still in progress.", jobId, status, jobExists });
      }

      if (status !== "SUCCEED") {
        return respond(500, { message: "Build did not succeed.", jobId, status, jobExists });
      }
      
      // The build already succeeded, so a failed purge must not fail the request -
      // a stale cache is far cheaper than the caller retrying the whole rebuild.
      let invalidationId = null;
      try {
        invalidationId = await invalidateCache(cloudfrontId);
      } catch (error) {
        console.error("Build succeeded but cache invalidation failed:", error);
      }

      return respond(200, {
        message: "Build completed successfully.",
        jobId,
        status,
        jobExists,
        invalidated: Boolean(invalidationId),
        invalidationId,
      });
    }

    // Status route - check status of running job
    if (route === "status") {
      jobId = segments[2];
      if (!jobId) return respond(400, { message: "jobId is required" });
      const status = await getJobStatus(amplifyId, branchName, jobId);
      return respond(200, { jobId, status });
    }

    // Invalidate route - trigger a CloudFront cache invalidation
    if (route === "invalidate") {
      try {
        const invalidationId = await invalidateCache(cloudfrontId);
        return respond(200, { message: "Cache invalidation started", invalidationId });
      } catch (error) {
        console.error("Cache invalidation failed:", error);
        return respond(500, { message: "Cache invalidation failed" });
      }
    }

    return respond(404, { message: "Not found" });
  } catch (error) {
    console.error("Unhandled error:", error);
    return respond(500, { message: "Internal server error" });
  }
};