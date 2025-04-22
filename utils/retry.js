// utils/retry.js
const retry = async (operation, maxRetries = 3, delayMs = 2000) => {
    let lastError = null;
  
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        console.warn(`Attempt ${attempt} failed: ${err.message}`);
  
        if (attempt === maxRetries) {
          throw lastError; // After max retries, throw the last error
        }
  
        // Wait before the next attempt
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  };
  
  module.exports = retry;