import os
import requests

# Configuration
SUPABASE_URL = "https://yxndmpwqvdatkujcukdv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4bmRtcHdxdmRhdGt1amN1a2R2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMDY5NSwiZXhwIjoyMDgwMzc2Njk1fQ.qqZ9FcIqAvjbTncKgRnt2SfcaoY0gFITvyPNFLZtvFM"
BUCKET_NAME = "web-content"
FILE_PATH = r"d:\Projects\Website Assistant\Coach-Scott-Bot\supabase\functions\synergize-page\page.html"
UPLOAD_PATH = "index.html"

# Read HTML content
with open(FILE_PATH, 'r', encoding='utf-8') as f:
    html_content = f.read()

# Replace placeholder
html_content = html_content.replace("{{SUPABASE_URL}}", SUPABASE_URL)

# Upload to Supabase Storage
url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{UPLOAD_PATH}"
headers = {
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "text/html",
    "x-upsert": "true"  # Overwrite if exists
}

response = requests.post(url, data=html_content.encode('utf-8'), headers=headers)

if response.status_code == 200:
    print(f"Successfully uploaded to {url}")
    print(f"Public URL: {SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{UPLOAD_PATH}")
else:
    print(f"Failed to upload: {response.status_code} - {response.text}")
