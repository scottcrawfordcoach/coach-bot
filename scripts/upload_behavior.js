/**
 * upload_behavior.js
 * Uploads behavior.json to the "coach-specs" Supabase storage bucket.
 *
 * Usage:  npm run upload-behavior
 * Requires: .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function upload() {
  const filePath = path.join(__dirname, '..', 'behavior.json')

  if (!fs.existsSync(filePath)) {
    console.error('behavior.json not found in project root')
    process.exit(1)
  }

  const fileBuffer = fs.readFileSync(filePath)
  const bucketName = 'coach-specs'

  console.log(`Uploading behavior.json to "${bucketName}" bucket...`)

  const { data, error } = await supabase
    .storage
    .from(bucketName)
    .upload('behavior.json', fileBuffer, {
      contentType: 'application/json',
      upsert: true,
    })

  if (error) {
    console.error('Upload failed:', error.message)
    process.exit(1)
  }

  console.log('Upload successful:', data.path)
}

upload()
