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

  try {
    const command = new CreateInvalidationCommand(input);
    const response = await cloudfrontClient.send(command);
    console.log("Invalidation created successfully:", response.Invalidation.Id);
    return response;
  } catch (error) {
    console.error("Error creating invalidation:", error);
  }
}

export const handler = async (event) => {
  try {

    //Authenticate request
    const secretName = process.env.API_KEY_SECRET_NAME;
    const apiKey = await getApiKey(secretName);
    // To accommodate Bedrock run_lambda triggers
    const payload = event.JobType === "run_lambda" ? event.ETLJob.etl_tasks : event;
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
        const result = await invalidateCache(cloudfrontId);
        return respond(200, { message: "Cache invalidation started", invalidationId: result.Invalidation.Id });
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