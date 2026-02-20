# Coach Scott Bot

This is a simple AI-powered FAQ and Wellness Assistant for Coach Scott's website.

## Project Structure

- `frontend/`: Contains the HTML/JS widget to be embedded on the website.
- `supabase/functions/faq-bot/`: The backend logic (Edge Function) that processes queries.
- `supabase/storage/website_assistant_knowledge/`: Local folder for knowledge base files (Markdown).

## Setup Instructions

### 1. Environment Variables
Open the `.env` file in the root directory and fill in your secrets:
- `OPENAI_API_KEY`: Your OpenAI API key.
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Key (found in Project Settings > API).

### 2. Deploying the Edge Function
You need the Supabase CLI installed.

1.  Login to Supabase:
    ```bash
    supabase login
    ```
2.  Link your project:
    ```bash
    supabase link --project-ref yxndmpwqvdatkujcukdv
    ```
3.  Set your secrets in Supabase (so the deployed function can access them):
    ```bash
    supabase secrets set OPENAI_API_KEY=your_openai_key_here
    supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
    ```
4.  Deploy the function:
    ```bash
    supabase functions deploy faq-bot --no-verify-jwt
    ```

### 3. Setting up the Knowledge Base
1.  Go to your Supabase Dashboard > Storage.
2.  Create a new public bucket named `website_assistant_knowledge`.
3.  Upload the Markdown files from `supabase/storage/website_assistant_knowledge/` to this bucket.

### 4. Testing the Frontend
1.  Open `frontend/index.html` in your browser.
2.  Type a question like "Who is Coach Scott?" or "How much water should I drink?".
3.  The bot should reply based on the knowledge files.

### 5. Embedding on GoDaddy
1.  Copy the code between `<!-- START OF WIDGET CODE -->` and `<!-- END OF WIDGET CODE -->` in `frontend/index.html`.
2.  Paste it into an HTML block on your GoDaddy site.
