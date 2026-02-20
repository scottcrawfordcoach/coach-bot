require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BUCKET_NAME = 'website_assistant_knowledge';
const KNOWLEDGE_DIR = path.join(__dirname, '../supabase/storage/website_assistant_knowledge');

const SKIP_UPLOAD_FILES = new Set([
  'class_availability.csv',
  'gym-holiday-closures.csv',
]);

const REMOVE_FROM_BUCKET_FILES = [
  'class_availability.csv',
  'gym-holiday-closures.csv',
];

async function uploadKnowledge() {
  console.log(`Checking bucket: ${BUCKET_NAME}...`);

  // 1. Create Bucket if it doesn't exist
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error('Error listing buckets:', listError);
    return;
  }

  const bucketExists = buckets.find(b => b.name === BUCKET_NAME);
  if (!bucketExists) {
    console.log(`Creating bucket '${BUCKET_NAME}'...`);
    const { data, error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 1048576, // 1MB
      allowedMimeTypes: ['text/markdown', 'text/plain']
    });
    if (createError) {
      console.error('Error creating bucket:', createError);
      return;
    }
    console.log('Bucket created successfully.');
  } else {
    console.log(`Bucket '${BUCKET_NAME}' already exists.`);
  }

  // Remove legacy CSVs so the model only sees the Markdown versions
  const { error: removeError } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(REMOVE_FROM_BUCKET_FILES);

  if (removeError) {
    console.warn('Warning: failed to remove legacy CSV files:', removeError.message);
  } else {
    console.log('Removed legacy CSV files (if present).');
  }

  // 2. Upload Files
  const files = fs.readdirSync(KNOWLEDGE_DIR);
  for (const file of files) {
    if (!file.endsWith('.md') && !file.endsWith('.csv') && !file.endsWith('.json')) continue;
    if (SKIP_UPLOAD_FILES.has(file)) continue;

    const filePath = path.join(KNOWLEDGE_DIR, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    let contentType = 'text/plain';
    if (file.endsWith('.csv')) contentType = 'text/csv';
    else if (file.endsWith('.json')) contentType = 'application/json';
    else contentType = 'text/markdown';

    console.log(`Uploading ${file}...`);
    const { data, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(file, fileContent, {
        contentType: contentType,
        upsert: true
      });

    if (uploadError) {
      console.error(`Failed to upload ${file}:`, uploadError.message);
    } else {
      console.log(`Successfully uploaded ${file}`);
    }
  }
  console.log('Knowledge upload complete!');
}

uploadKnowledge();
