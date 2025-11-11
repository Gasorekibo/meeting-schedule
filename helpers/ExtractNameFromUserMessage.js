export default async function extractNameFromUserMessage(message) {
    if (!message || typeof message !== 'string') {
        throw new Error('Invalid message: must be a non-empty string');
    }
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    
    const formattedPrompt = {
        contents: [
            {
                parts: [
                    {
                        text: `Extract the name of the employee from the following user message: "${message}"

Respond with only the name, no additional text.
If no name is found, respond with "Name not found".`
                    }
                ]
            }
        ]
    };

    try {
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': process.env.GEMINI_API_KEY,
            },
            body: JSON.stringify(formattedPrompt),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!extractedText) {
            throw new Error('Unexpected API response structure');
        }
        return extractedText.trim();

    } catch (error) {
        console.error('Error extracting name from user message:', error);
        throw error;
    }
}