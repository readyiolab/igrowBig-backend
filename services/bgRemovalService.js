// services/bgRemovalService.js
const fs = require("fs");
const FormData = require("form-data");
const axios = require("axios");

const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY || "H3eD4sghrqmPNMY2vwg57Vxf";

/**
 * Remove background from an image using Remove.bg API
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Buffer>} - Image buffer with background removed
 */
async function removeBackground(imagePath) {
  try {
    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);

    // Create form data
    const formData = new FormData();
    formData.append("size", "auto");
    formData.append("image_file", imageBuffer, {
      filename: "image.png",
      contentType: "image/png",
    });

    // Call Remove.bg API
    const response = await axios.post(
      "https://api.remove.bg/v1.0/removebg",
      formData,
      {
        headers: {
          "X-Api-Key": REMOVE_BG_API_KEY,
          ...formData.getHeaders(),
        },
        responseType: "arraybuffer",
      }
    );

    if (response.status === 200) {
      console.log("✅ Background removed successfully");
      return Buffer.from(response.data);
    } else {
      throw new Error(`Remove.bg API error: ${response.status}`);
    }
  } catch (error) {
    console.error("❌ Background removal failed:", error.message);
    
    // If Remove.bg fails, return original image
    if (error.response) {
      console.error("API Response:", error.response.data?.toString());
    }
    
    // Return original image as fallback
    return fs.readFileSync(imagePath);
  }
}

module.exports = { removeBackground };