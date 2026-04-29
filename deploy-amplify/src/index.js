import { AmplifyClient, StartJobCommand } from "@aws-sdk/client-amplify";

// Initialize the client. It will automatically use the Lambda's IAM execution role.
const client = new AmplifyClient({ region: "us-east-1" }); // Replace with your region

export const handler = async (event) => {
  const params = {
    appId: process.env.appId,        // e.g., d1234567890
    branchName: process.env.branch,  // target branch
    jobType: "RELEASE"               // RELEASE triggers a new deployment
  };

  try {
    const command = new StartJobCommand(params);
    const response = await client.send(command);
    
    console.log("Successfully triggered Amplify build:", response.jobSummary.jobId);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Build started successfully!" }),
    };
  } catch (error) {
    console.error("Error triggering Amplify build:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to start build." }),
    };
  }
};