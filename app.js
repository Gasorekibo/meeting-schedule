import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { DateTime } from 'luxon';
import Employee from './models/Employees.js';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import buildFriendlyResponse from './helpers/buildFriendlyResponse.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB 🧑‍🚒');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    prompt: 'consent',
  });
  res.redirect(url);
});

app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('=== REFRESH TOKEN (copy this) ===');
    console.log(tokens.refresh_token);
    res.send(`
      <h3>Authorization successful!</h3>
      <p>Copy the <strong>refresh token</strong> from the server console and add the employee with the POST /save-employee endpoint.</p>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('OAuth error');
  }
});

app.post('/save-employee', async (req, res) => {
  const { name, email, refreshToken } = req.body;
  if (!name || !email || !refreshToken) {
    return res.status(400).json({ error: 'missing fields' });
  }
  try {
    const emp = new Employee({ name, email, refreshToken });
    await emp.save();
    res.json({ message: 'Employee saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Helper: get comprehensive calendar data ----------
async function getCalendarData(email, refreshToken, days = 7) {
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const now = DateTime.now().setZone('Africa/Kigali');
  const timeMin = now.toISO();
  const timeMax = now.plus({ days }).toISO();

  // Get busy/free data
  const { data: freebusyData } = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: email }],
    },
  });

  const busy = freebusyData.calendars[email].busy || [];

  // Get actual events for more context
  const { data: eventsData } = await calendar.events.list({
    calendarId: email,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = eventsData.items || [];

  // Calculate free slots
  const free = [];
  for (let day = 0; day < days; day++) {
    const dayStart = now.startOf('day').plus({ days: day, hours: 9 });
    const dayEnd = now.startOf('day').plus({ days: day, hours: 17 });
    
    let cursor = dayStart;
    
    while (cursor < dayEnd) {
      const slotEnd = cursor.plus({ hours: 1 });

      if (slotEnd <= now) {
        cursor = slotEnd;
        continue;
      }

      const overlaps = busy.some((b) => {
        const bStart = DateTime.fromISO(b.start).setZone('Africa/Kigali');
        const bEnd = DateTime.fromISO(b.end).setZone('Africa/Kigali');
        return cursor < bEnd && slotEnd > bStart;
      });

      if (!overlaps) {
        free.push({
          start: cursor.toISO(),
          formatted: cursor.toFormat('EEEE, MMMM d, yyyy – h:mm a'),
          day: cursor.toFormat('EEEE'),
          date: cursor.toFormat('MMMM d'),
          time: cursor.toFormat('h:mm a'),
        });
      }

      cursor = slotEnd;
    }
  }

  // Format busy slots with timezone conversion
  const busyFormatted = busy.map(b => {
    const start = DateTime.fromISO(b.start).setZone('Africa/Kigali');
    const end = DateTime.fromISO(b.end).setZone('Africa/Kigali');
    return {
      start: start.toISO(),
      end: end.toISO(),
      formatted: `${start.toFormat('EEEE, MMMM d, yyyy – h:mm a')} to ${end.toFormat('h:mm a')}`,
      day: start.toFormat('EEEE'),
      date: start.toFormat('MMMM d'),
      timeRange: `${start.toFormat('h:mm a')} - ${end.toFormat('h:mm a')}`,
    };
  });

  // Format events
  const eventsFormatted = events.map(e => {
    const start = e.start.dateTime 
      ? DateTime.fromISO(e.start.dateTime).setZone('Africa/Kigali')
      : DateTime.fromISO(e.start.date).setZone('Africa/Kigali');
    const end = e.end.dateTime 
      ? DateTime.fromISO(e.end.dateTime).setZone('Africa/Kigali')
      : DateTime.fromISO(e.end.date).setZone('Africa/Kigali');
    
    return {
      summary: e.summary || 'Busy',
      start: start.toISO(),
      end: end.toISO(),
      formatted: `${start.toFormat('EEEE, MMMM d – h:mm a')} to ${end.toFormat('h:mm a')}`,
      isAllDay: !e.start.dateTime,
    };
  });

  return {
    employee: {
      email,
      timezone: 'Africa/Kigali',
    },
    period: {
      start: timeMin,
      end: timeMax,
      days,
      currentTime: now.toFormat('EEEE, MMMM d, yyyy – h:mm a'),
    },
    busySlots: busyFormatted,
    events: eventsFormatted,
    freeSlots: free,
    workingHours: {
      start: '9:00 AM',
      end: '5:00 PM',
      timezone: 'Africa/Kigali (CAT)',
    },
  };
}

// ---------- Gemini AI Analysis ----------
async function analyzeWithGemini(calendarData, customerMessage, employeeName) {
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
// app.post('/request-meeting', async (req, res) => {
//   const { message } = req.body;
//   if (!message) return res.status(400).json({ error: 'no message' });

//   // Parse employee name from message
//   const match = message.match(/meet\s+(.+)/i);
//   if (!match) return res.status(400).json({ error: 'cannot parse name. Try: "meet [employee name]"' });

//   const name = match[1].trim();
//   const employee = await Employee.findOne({ name });
//   if (!employee) return res.status(404).json({ error: 'employee not found' });

//   const token = employee.getDecryptedToken();
//   if (!token) return res.status(401).json({ error: 'no token' });

//   try {
//     // Get comprehensive calendar data
//     const calendarData = await getCalendarData(employee.email, token);
    
//     // Analyze with Gemini AI
//     const aiResponse = await analyzeWithGemini(calendarData, message, employee.name);
    
//     res.json({
//       employee: employee.name,
//       message: aiResponse,
//       rawData: {
//         busySlots: calendarData.busySlots.length,
//         freeSlots: calendarData.freeSlots.length,
//         events: calendarData.events.length,
//       },
//       // Optional: include full data for debugging
//       // fullCalendarData: calendarData,
//     });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ error: 'calendar or AI error', details: e.message });
//   }
// });

// ---------- Optional: Get raw calendar data endpoint ----------

app.post('/request-meeting', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'no message' });

  const match = message.match(/meet\s+(.+)/i);
  if (!match) return res.status(400).json({ error: 'cannot parse name. Try: "meet [employee name]"' });

  const name = match[1].trim();
  const employee = await Employee.findOne({ name });
  if (!employee) return res.status(404).json({ error: 'employee not found' });

  const token = employee.getDecryptedToken();
  if (!token) return res.status(401).json({ error: 'no token' });

  try {
    const calendarData = await getCalendarData(employee.email, token);
    const aiSuggestion = await analyzeWithGemini(calendarData, message, employee.name);
    const response = buildFriendlyResponse(employee.name, calendarData, aiSuggestion);

    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'calendar or AI error', details: e.message });
  }
});
app.post('/calendar-data', async (req, res) => {
  const { employeeName } = req.body;
  if (!employeeName) return res.status(400).json({ error: 'no employee name' });

  const employee = await Employee.findOne({ name: employeeName });
  if (!employee) return res.status(404).json({ error: 'employee not found' });

  const token = employee.getDecryptedToken();
  if (!token) return res.status(401).json({ error: 'no token' });

  try {
    const calendarData = await getCalendarData(employee.email, token);
    res.json(calendarData);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'calendar error', details: e.message });
  }
});

app.listen(PORT, async () => {
  await connectDB();
  console.log(`Server listening on ${PORT}`);
});