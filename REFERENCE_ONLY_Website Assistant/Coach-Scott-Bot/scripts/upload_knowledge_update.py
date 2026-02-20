import os
import requests

# Configuration
SUPABASE_URL = "https://yxndmpwqvdatkujcukdv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4bmRtcHdxdmRhdGt1amN1a2R2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMDY5NSwiZXhwIjoyMDgwMzc2Njk1fQ.qqZ9FcIqAvjbTncKgRnt2SfcaoY0gFITvyPNFLZtvFM"
BUCKET_NAME = "website_assistant_knowledge"

FILES_TO_UPLOAD = [
    {
        "local_path": r"d:\Projects\Website Assistant\Coach-Scott-Bot\supabase\storage\website_assistant_knowledge\behavior.json",
        "storage_path": "behavior.json",
        "content_type": "application/json"
    },
    {
        "local_path": r"d:\Projects\Website Assistant\Coach-Scott-Bot\supabase\storage\website_assistant_knowledge\crawford-coaching-knowledge.md",
        "storage_path": "crawford-coaching-knowledge.md",
        "content_type": "text/markdown"
    },
    {
        "local_path": r"d:\Projects\Website Assistant\Coach-Scott-Bot\supabase\storage\website_assistant_knowledge\class_availability.csv",
        "storage_path": "class_availability.csv",
        "content_type": "text/csv"
    },
    {
        "local_path": r"d:\Projects\Website Assistant\Coach-Scott-Bot\supabase\storage\website_assistant_knowledge\approved_sources.csv",
        "storage_path": "approved_sources.csv",
        "content_type": "text/csv"
    }
]

for file_info in FILES_TO_UPLOAD:
    local_path = file_info["local_path"]
    storage_path = file_info["storage_path"]
    content_type = file_info["content_type"]

    if not os.path.exists(local_path):
        print(f"File not found: {local_path}")
        continue

    with open(local_path, 'rb') as f:
        file_content = f.read()

    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{storage_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true"
    }

    print(f"Uploading {storage_path}...")
    response = requests.post(url, data=file_content, headers=headers)

    if response.status_code == 200:
        print(f"Successfully uploaded {storage_path}")
    else:
        print(f"Failed to upload {storage_path}: {response.status_code} - {response.text}")
