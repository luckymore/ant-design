/* eslint-disable no-restricted-syntax, no-console */
// Attention: use all node builtin modules except `ali-oss`
// Must keep our ak/sk safe

// eslint-disable-next-line import/no-extraneous-dependencies
const OSS = require('ali-oss');
const path = require('path');
const fs = require('fs');
const { assert } = require('console');

// node scripts/visual-regression-upload.js ./visualRegressionReport.tar.gz --ref=pr-id
// node scripts/visual-regression-upload.js ./imageSnapshots.tar.gz --ref=master-commitId

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/visual-regression-upload.js <tarFilePath> --ref=<refValue>');
  process.exit(1);
}

/**
 * Extract the tar file path and ref value from the cli arguments
 * @param {string[]} cliArgs
 */
function parseArgs(cliArgs) {
  const filepath = cliArgs[0];
  let refValue = '';

  for (let i = 1; i < cliArgs.length; i++) {
    if (cliArgs[i].startsWith('--ref=')) {
      refValue = cliArgs[i].substring(6);
      break;
    }
  }

  return [filepath, refValue];
}

async function walkDir(dirPath) {
  const fileList = [];

  const files = await fs.promises.readdir(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const fileStat = fs.statSync(filePath);

    if (fileStat.isDirectory()) {
      // Recursively call this func for subdirs
      // eslint-disable-next-line no-await-in-loop
      fileList.push(...(await walkDir(filePath)));
    } else {
      fileList.push(filePath);
    }
  }

  return fileList;
}

/**
 *
 * @param {import('ali-oss')} client
 * @param {*} filePath
 * @param {*} refValue
 */
async function uploadFile(client, filePath, refValue) {
  const headers = {
    // https://help.aliyun.com/zh/oss/user-guide/object-acl
    'x-oss-object-acl': 'public-read',
    // https://help.aliyun.com/zh/oss/developer-reference/prevent-objects-from-being-overwritten-by-objects-that-have-the-same-names-3
    'x-oss-forbid-overwrite': 'false',
  };

  console.log('Uploading file: %s', filePath);
  try {
    const targetFilePath = path.relative(process.cwd(), filePath);
    const r1 = await client.put(`${refValue}/${targetFilePath}`, filePath, { headers });
    console.log('Uploading file successfully: %s', r1.name);
  } catch (err) {
    console.error('Uploading file failed: %s', err);
    process.exit(1);
  }
}

async function boot() {
  const [filepath, refValue] = parseArgs(args);
  assert(filepath, 'filepath is required');
  assert(refValue, 'refValue is required');

  const fileOrFolderName = filepath;
  // check if exists
  const filePath = path.resolve(process.cwd(), fileOrFolderName);

  if (!fs.existsSync(filePath)) {
    console.error('File not exists: %s', filePath);
    process.exit(1);
  }

  const client = new OSS({
    endpoint: 'oss-cn-shanghai.aliyuncs.com',
    accessKeyId: process.env.ALI_OSS_AK_ID,
    accessKeySecret: process.env.ALI_OSS_AK_SECRET,
    bucket: process.env.ALI_OSS_BUCKET,
  });

  // if is a file then upload it directly
  const stat = fs.statSync(filePath);
  if (stat.isFile()) {
    await uploadFile(client, filePath, refValue);
    return;
  }

  if (stat.isDirectory()) {
    const fileList = await walkDir(filePath);
    for (const file of fileList) {
      // eslint-disable-next-line no-await-in-loop
      await uploadFile(client, file, refValue);
    }
  }
}

boot();
