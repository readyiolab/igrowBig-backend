const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
require("dotenv").config();

const s3 = new S3Client({
  region: "us-east-1", // Required for AWS SDK compatibility
  endpoint: process.env.DO_SPACES_ENDPOINT, // e.g., https://blr1.digitaloceanspaces.com
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
  forcePathStyle: false, // Use virtual-hosted-style URLs
});

const uploadToS3 = async (file, folder) => {
  if (!file || (!file.path && !file.buffer) || !file.filename) {
    throw new Error("Invalid file object: missing path/buffer or filename");
  }
  if (!folder) {
    throw new Error("Folder parameter is missing");
  }

  console.log("Uploading to Spaces:", { folder, filename: file.filename });

  let fileContent;
  if (file.buffer) {
    fileContent = file.buffer;
  } else if (file.path) {
    fileContent = fs.readFileSync(file.path);
    // Clean up the file after upload
    fs.unlinkSync(file.path);
  }

  const params = {
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: `${folder}/${file.filename}`,
    Body: fileContent,
    ContentType: file.mimetype,
    ACL: "public-read",
  };

  const command = new PutObjectCommand(params);
  await s3.send(command);

  return `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com/${params.Key}`;
};
const deleteFromS3 = async (fileUrl) => {
  if (!fileUrl) {
    throw new Error("File URL is missing");
  }

  const key = fileUrl.split(`${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com/`)[1];
  if (!key) {
    throw new Error(`Invalid Spaces URL: unable to extract Key from ${fileUrl}`);
  }

  console.log("Deleting from Spaces:", { key });

  const params = {
    Bucket: process.env.DO_SPACES_BUCKET, // e.g., igrowbig
    Key: key,
  };

  const command = new DeleteObjectCommand(params);
  await s3.send(command);
};

module.exports = { uploadToS3, deleteFromS3 };

// const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
// const fs = require("fs");
// require("dotenv").config();

// const s3 = new S3Client({
//   region: "us-east-1",
//   endpoint: process.env.DO_SPACES_ENDPOINT,
//   credentials: {
//     accessKeyId: process.env.DO_SPACES_KEY,
//     secretAccessKey: process.env.DO_SPACES_SECRET,
//   },
//   forcePathStyle: false,
// });

// const uploadToS3 = async (file, folder) => {
//   if (!file || !file.path || !file.filename) {
//     throw new Error("Invalid file object: missing path or filename");
//   }
//   if (!folder) {
//     throw new Error("Folder parameter is missing");
//   }

//   console.log("Uploading to Spaces:", { folder, filename: file.filename });

//   const fileContent = fs.readFileSync(file.path);
//   const params = {
//     Bucket: process.env.DO_SPACES_BUCKET,
//     Key: `${folder}/${file.filename}`,
//     Body: fileContent,
//     ContentType: file.mimetype,
//     ACL: "public-read",
//   };

//   const command = new PutObjectCommand(params);
//   await s3.send(command);
//   fs.unlinkSync(file.path);

//   return `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com/${params.Key}`;
// };

// const deleteFromS3 = async (fileUrl) => {
//   if (!fileUrl) {
//     throw new Error("File URL is missing");
//   }

//   const key = fileUrl.split(`${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com/`)[1];
//   if (!key) {
//     throw new Error(`Invalid Spaces URL: unable to extract Key from ${fileUrl}`);
//   }

//   console.log("Deleting from Spaces:", { key });

//   const params = {
//     Bucket: process.env.DO_SPACES_BUCKET,
//     Key: key,
//   };

//   const command = new DeleteObjectCommand(params);
//   await s3.send(command);
// };

// module.exports = { uploadToS3, deleteFromS3 };