import dotenv from 'dotenv';
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import Employee from './models/Employees.js';
import cors from 'cors';
import connectDB from './helpers/config.js';
import requestMeetingHandler from './controllers/requestMeeting.js';
import bookMeetingHandler from './controllers/bookMeeting.js';

dotenv.config();
const app = express();
app.use(express.json());

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));
const PORT = process.env.PORT || 3000;

export const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    prompt: 'consent',
  });
  res.redirect(url);
});


app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const data = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(data.tokens);
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${data.tokens.access_token}`
      }
    });
    
    const userInfo = await userInfoResponse.json();
    const existingEmployee = await Employee.findOne({ email: userInfo.email });
    
    if (existingEmployee) {
      existingEmployee.refreshToken = data.tokens.refresh_token;
      await existingEmployee.save();
      console.log('Updated existing employee:', userInfo.email);
    } else {
      const newEmployee = new Employee({
        name: userInfo.name,
        email: userInfo.email,
        refreshToken: data.tokens.refresh_token
      });
      await newEmployee.save();
      console.log('Saved new employee:', userInfo.email);
    }
    
    res.send(`
      <h3>Authorization successful!</h3>
      <p><strong>Name:</strong> ${userInfo.name}</p>
      <p><strong>Email:</strong> ${userInfo.email}</p>
      <p>✅ Employee automatically saved to database!</p>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('OAuth error: ' + err.message);
  }
});
app.get('/', (req, res)=> {
  res.send('Welcome to the Meeting Scheduler API. Please authenticate at /auth');
})
app.post('/request-meeting',requestMeetingHandler);
app.post('/book-meeting', bookMeetingHandler);
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