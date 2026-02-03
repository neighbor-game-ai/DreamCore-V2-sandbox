const { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const config = require('./config');

const getR2Endpoint = () => {
  if (config.R2_ENDPOINT) {
    return config.R2_ENDPOINT;
  }
  if (config.R2_ACCOUNT_ID) {
    return `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  return '';
};

const isR2Enabled = () => {
  return Boolean(
    config.R2_BUCKET &&
    config.R2_PUBLIC_BASE_URL &&
    config.R2_ACCESS_KEY_ID &&
    config.R2_SECRET_ACCESS_KEY &&
    getR2Endpoint()
  );
};

const getR2Client = () => {
  const endpoint = getR2Endpoint();
  if (!endpoint) {
    throw new Error('R2 endpoint is not configured');
  }
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY
    }
  });
};

const getPublicUrl = (key) => {
  const base = config.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
  // URL-encode each path segment to handle special characters (spaces, #, etc.)
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${base}/${encodedKey}`;
};

const putObject = async ({ key, body, contentType, cacheControl }) => {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: config.R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl
  });
  return client.send(command);
};

const headObject = async ({ key }) => {
  const client = getR2Client();
  const command = new HeadObjectCommand({
    Bucket: config.R2_BUCKET,
    Key: key
  });
  return client.send(command);
};

const objectExists = async (key) => {
  try {
    await headObject({ key });
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
};

const listObjects = async ({ prefix, continuationToken } = {}) => {
  const client = getR2Client();
  const command = new ListObjectsV2Command({
    Bucket: config.R2_BUCKET,
    Prefix: prefix,
    ContinuationToken: continuationToken
  });
  return client.send(command);
};

module.exports = {
  getR2Endpoint,
  getR2Client,
  getPublicUrl,
  putObject,
  headObject,
  objectExists,
  listObjects,
  isR2Enabled
};
