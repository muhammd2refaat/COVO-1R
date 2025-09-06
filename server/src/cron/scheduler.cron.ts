import cron from "node-cron";
import runFacebookCronJob from "./facebookCronJob";
import { refreshAllInstagramTokens } from "./instagramCronJob";
import { refreshAllYoutubeTokens } from "./youtubeCronJob";
import { refreshAllTwitterTokens } from "./twitterCronJob";
import { getMainDBConnection } from "../config/database";

// Flag to track if cron jobs should run
let cronJobsEnabled = false;

// Enable cron jobs after database is connected
export const enableCronJobs = () => {
  cronJobsEnabled = true;
  console.log("✅ Cron jobs enabled after database connection");
};

cron.schedule("0 * * * *", async () => {
  // Check if database is connected before running cron jobs
  const dbConnection = getMainDBConnection();
  if (!cronJobsEnabled || !dbConnection || dbConnection.readyState !== 1) {
    console.log("⏸️ Skipping cron jobs - database not ready");
    return;
  }

  console.log("🚀 Running all social platform cron jobs (hourly)");

  try {
    await runFacebookCronJob();
    console.log("✅ Facebook cron job completed.");
  } catch (err) {
    console.error("❌ Facebook cron job failed:", err.message);
  }

  try {
    await refreshAllInstagramTokens();
    console.log("✅ Instagram cron job completed.");
  } catch (err) {
    console.error("❌ Instagram cron job failed:", err.message);
  }

  try {
    await refreshAllYoutubeTokens();
    console.log("✅ YouTube cron job completed.");
  } catch (err) {
    console.error("❌ YouTube cron job failed:", err.message);
  }

  try {
    await refreshAllTwitterTokens();
    console.log("✅ Twitter cron job completed.");
  } catch (err) {
    console.error("❌ Twitter cron job failed:", err.message);
  }

  console.log("✅ All cron jobs completed.");
});
