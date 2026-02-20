import requests

# Configuration
SUPABASE_URL = "https://yxndmpwqvdatkujcukdv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4bmRtcHdxdmRhdGt1amN1a2R2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMDY5NSwiZXhwIjoyMDgwMzc2Njk1fQ.qqZ9FcIqAvjbTncKgRnt2SfcaoY0gFITvyPNFLZtvFM"
BUCKET_NAME = "web-content"

url = f"{SUPABASE_URL}/storage/v1/bucket/{BUCKET_NAME}"
headers = {
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}
data = {
    "public": True
}

print(f"Updating bucket {BUCKET_NAME} to public...")
response = requests.put(url, json=data, headers=headers)

if response.status_code == 200:
    print("Successfully updated bucket to public.")
else:
    print(f"Failed to update bucket: {response.status_code} - {response.text}")

# Verify image again
img_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/scott-avatar.jpg"
print(f"Checking image: {img_url}")
head_res = requests.head(img_url)
print(f"Image Status: {head_res.status_code}")
