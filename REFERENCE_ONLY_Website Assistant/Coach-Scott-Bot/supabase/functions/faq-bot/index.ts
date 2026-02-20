import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages: incomingMessages, query } = await req.json()
    
    // Handle both formats (legacy 'query' or new 'messages' array)
    let conversationMessages = [];
    if (incomingMessages && Array.isArray(incomingMessages)) {
        conversationMessages = incomingMessages;
    } else if (query) {
        conversationMessages = [{ role: 'user', content: query }];
    } else {
        throw new Error('No messages or query provided')
    }

    // Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Initialize OpenAI Client
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    const openai = new OpenAI({
      apiKey: apiKey,
    })

    // 1. Load Knowledge Files from Bucket
    const bucketName = 'website_assistant_knowledge'
    const { data: fileList, error: listError } = await supabase
      .storage
      .from(bucketName)
      .list()

    if (listError) {
      console.error('Error listing files:', listError)
      throw new Error('Failed to load knowledge base')
    }

    let knowledgeBaseText = ''
    let behaviorConfig = null;

    // Filter for markdown, CSV, and JSON files
    const allowedExtensions = ['.md', '.csv', '.json']
    const knowledgeFiles = fileList.filter(f => allowedExtensions.some(ext => f.name.endsWith(ext)))
    
    for (const file of knowledgeFiles) {
      const { data, error: downloadError } = await supabase
        .storage
        .from(bucketName)
        .download(file.name)

      if (downloadError) {
        console.error(`Error downloading ${file.name}:`, downloadError)
        continue
      }

      const text = await data.text()
      
      if (file.name === 'behavior.json') {
        try {
          behaviorConfig = JSON.parse(text);
        } catch (e) {
          console.error('Error parsing behavior.json:', e);
        }
      } else {
        knowledgeBaseText += `\n\n--- Source: ${file.name} ---\n${text}`
      }
    }

    // 2. Construct Prompt
    let systemPrompt = '';

    if (behaviorConfig) {
      // Build prompt from JSON config
      systemPrompt = `${behaviorConfig.role_definition}\n\nYour goal is to answer visitor questions using the following priority order:\n\n`;
      
      if (behaviorConfig.priority_tiers) {
        behaviorConfig.priority_tiers.forEach(tier => {
          systemPrompt += `${tier.title}\n${tier.instructions}\n\n`;
        });
      }

      if (behaviorConfig.safety_guidelines) {
        systemPrompt += `${behaviorConfig.safety_guidelines}\n\n`;
      }
      
      systemPrompt += `Context from Knowledge Base:\n${knowledgeBaseText}`;
      
    } else {
      // Fallback to hardcoded prompt if behavior.json is missing
      systemPrompt = `
You are Coach Scott's AI assistant. You are friendly, encouraging, and knowledgeable about wellness, fitness, and nutrition.

Your goal is to answer visitor questions using the following priority order:

TIER 1: DIRECT KNOWLEDGE (Highest Priority)
Use the provided context (Markdown files, CSVs) as your primary source of truth. 
- If the user asks about schedules, pricing, or specific "Coach Scott" policies, you MUST use this information.
- Pay attention to metadata headers in Markdown files to understand the context.

TIER 1.5: REAL-TIME DATA (High Priority)
If the user asks for specific nutritional information about a food (e.g., "How much protein in an egg?"), use the 'get_nutrition_info' tool to fetch accurate data from the USDA database.
- Use this data to answer the question precisely.

TIER 2: TRUSTED SOURCES
If the answer is not explicitly in the files, check the "Approved Sources" list in the context.
- If a relevant source is listed (e.g., "Matthew Walker for Sleep"), you may use your general training to explain that source's standard recommendations.
- Explicitly mention the source: "As recommended by [Source Name]..."

TIER 3: GENERAL KNOWLEDGE (Lowest Priority)
If no specific file or trusted source covers the topic:
- You may provide general, widely accepted wellness information.
- You MUST add a caution: "While I don't have a specific resource from Coach Scott on this, generally speaking..." or "Standard wellness guidelines suggest..."
- Do NOT make up specific policies or prices.

SAFETY & LIMITS:
- Do not give medical advice. If a question is medical in nature, disclaim that you are an AI and suggest seeing a doctor.
- Keep your answers concise (2-3 sentences) unless a longer explanation is necessary.

Context from Knowledge Base:
${knowledgeBaseText}
`
    }

    // Define Tools
    const tools = [
      {
        type: "function",
        function: {
          name: "get_nutrition_info",
          description: "Get nutritional information for a specific food item from the USDA database.",
          parameters: {
            type: "object",
            properties: {
              foodQuery: {
                type: "string",
                description: "The food item to search for (e.g., 'raw apple', 'cheddar cheese').",
              },
            },
            required: ["foodQuery"],
          },
        },
      },
    ];

    // 3. Call OpenAI (First Pass)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationMessages
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      tools: tools,
      tool_choice: "auto",
      temperature: 0.7,
    })

    const responseMessage = completion.choices[0].message
    let reply = responseMessage.content

    // 4. Handle Tool Calls
    if (responseMessage.tool_calls) {
      const toolCall = responseMessage.tool_calls[0]; // Handle first tool call
      if (toolCall.function.name === "get_nutrition_info") {
        const { foodQuery } = JSON.parse(toolCall.function.arguments);
        
        // Call USDA API
        const fdcApiKey = Deno.env.get('FDC_API_KEY');
        let toolResult = "No nutritional data found.";

        if (fdcApiKey) {
          try {
            const fdcRes = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${fdcApiKey}&query=${encodeURIComponent(foodQuery)}&pageSize=1`);
            const fdcData = await fdcRes.json();
            
            if (fdcData.foods && fdcData.foods.length > 0) {
              const food = fdcData.foods[0];
              const nutrients = food.foodNutrients.filter(n => 
                ['Protein', 'Total lipid (fat)', 'Carbohydrate, by difference', 'Energy'].includes(n.nutrientName)
              );
              
              toolResult = `Data for ${food.description}:\n`;
              nutrients.forEach(n => {
                toolResult += `- ${n.nutrientName}: ${n.value} ${n.unitName}\n`;
              });
            }
          } catch (e) {
            console.error("USDA API Error:", e);
            toolResult = "Error fetching nutritional data.";
          }
        } else {
            toolResult = "Configuration Error: FDC_API_KEY not set.";
        }

        // Add tool result to messages
        messages.push(responseMessage);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });

        // Call OpenAI again (Second Pass)
        const secondCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages,
          temperature: 0.7,
        });
        
        reply = secondCompletion.choices[0].message.content;
      }
    }

    // 4. Return Response
    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error processing request:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
