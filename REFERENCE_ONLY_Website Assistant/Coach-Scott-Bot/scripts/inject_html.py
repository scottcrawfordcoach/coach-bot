import os

html_path = r"d:\Projects\Website Assistant\Coach-Scott-Bot\supabase\functions\synergize-page\page.html"
ts_path = r"d:\Projects\Website Assistant\Coach-Scott-Bot\supabase\functions\synergize-page\index.ts"

with open(html_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

# Escape backticks and ${} to prevent template literal issues
html_content = html_content.replace('`', '\\`').replace('${', '\\${')

with open(ts_path, 'r', encoding='utf-8') as f:
    ts_content = f.read()

new_ts_content = ts_content.replace('const html = ``;', f'const html = `{html_content}`;')

with open(ts_path, 'w', encoding='utf-8') as f:
    f.write(new_ts_content)

print("HTML injected successfully.")
