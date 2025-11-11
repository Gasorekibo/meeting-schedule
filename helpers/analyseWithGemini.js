// ---------- Gemini AI Analysis ----------
export default async function analyzeWithGemini(calendarData, customerMessage, employeeName) {
  const URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

  const prompt = `You are a helpful meeting scheduling assistant. A customer wants to schedule a meeting with ${employeeName}.

Customer's message: "${customerMessage}"

Here is ${employeeName}'s complete calendar data:

CURRENT TIME: ${calendarData.period.currentTime}
TIMEZONE: ${calendarData.workingHours.timezone}
WORKING HOURS: ${calendarData.workingHours.start} - ${calendarData.workingHours.end}

BUSY SLOTS (${calendarData.busySlots.length} total):
${calendarData.busySlots.map((slot, i) => `${i + 1}. ${slot.formatted}`).join('\n') || 'None'}

CALENDAR EVENTS:
${calendarData.events.map((event, i) => `${i + 1}. ${event.summary} - ${event.formatted}`).join('\n') || 'None'}

AVAILABLE TIME SLOTS (${calendarData.freeSlots.length} total):
${calendarData.freeSlots.map((slot, i) => `${i + 1}. ${slot.formatted}`).join('\n') || 'None'}

Please analyze this data and provide:
1. A friendly, professional response to the customer
2. Suggest the best 3-5 meeting times based on patterns (e.g., prefer mornings if they have afternoon meetings, suggest consecutive days if possible)
3. Group suggestions by day for easier reading
4. If there are no available slots, explain when they'll next be free
5. Keep the response concise but warm and helpful

Format your response in a conversational way, as if you're speaking directly to the customer.`;

  try {
   const formattedPrompt = {
    "contents": [
      {
        "parts":[
          { "text": prompt }
        ]
      }
    ]
   }
    const response = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': `${process.env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify(formattedPrompt),
    });
    const data = await response.json();
    console.log('Gemini AI response data:', data.candidates[0]);
    return data?.candidates[0].output;
  } catch (error) {
    console.error('Gemini AI error:', error);
    throw error;
  }
}