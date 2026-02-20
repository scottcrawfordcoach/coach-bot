import requests

url = "https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/web-content/scott-avatar.jpg"
response = requests.head(url)
print(f"Status Code: {response.status_code}")
print(f"Content-Type: {response.headers.get('Content-Type')}")
print(f"Content-Length: {response.headers.get('Content-Length')}")
