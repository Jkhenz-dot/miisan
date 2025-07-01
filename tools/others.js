import dotenv from "dotenv";
dotenv.config();
import fs from "fs";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryOperation(fn, maxRetries, delayMs = 1000) {
  let error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.log(`Attempt ${attempt} failed: ${err.message}`);
      error = err;
      if (attempt < maxRetries) {
        console.log(`Waiting ${delayMs}ms before next attempt...`);
        await delay(delayMs);
      } else {
        console.log(`All ${maxRetries} attempts failed.`);
      }
    }
  }

  throw new Error(
    `Operation failed after ${maxRetries} attempts: ${error.message}`,
  );
}

const nsfwWordsArray = JSON.parse(
  fs.readFileSync("./text/nsfwWords.json", "utf-8"),
);

function filterPrompt(text) {
  nsfwWordsArray.forEach((word) => {
    const regexPattern = new RegExp(word.split("").join("\\W*"), "gi");
    text = text.replace(regexPattern, "");
  });
  return text;
}

export { delay, retryOperation, filterPrompt };
