import dotenv from 'dotenv';
import express from 'express';

import { OAuth2Client } from 'google-auth-library';

import Employee from './models/Employees.js';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import connectDB from './helpers/config.js';
import requestMeetingHandler from './controllers/requestMeeting.js';

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



export const oauth2Client = new OAuth2Client(
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


app.post('/request-meeting',requestMeetingHandler);
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