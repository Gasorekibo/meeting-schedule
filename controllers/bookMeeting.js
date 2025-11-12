import { google } from 'googleapis';
import Employee from '../models/Employees.js';
import { oauth2Client } from '../app.js';
const bookMeetingHandler = async (req, res) => {
  const { 
    employeeEmail, 
    meetingTitle, 
    startTime, 
    endTime, 
    description,
    attendees 
  } = req.body;

  if (!employeeEmail || !meetingTitle || !startTime || !endTime) {
    return res.status(400).json({ 
      error: 'Missing required fields: employeeEmail, meetingTitle, startTime, endTime' 
    });
  }

  try {
    const employee = await Employee.findOne({ email: employeeEmail });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const refreshToken = employee.getDecryptedToken();
    if (!refreshToken) {
      return res.status(401).json({ error: 'No valid token for this employee' });
    }

    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });


    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    let allAttendees = attendees ? attendees.map(email => ({ email })) : [];

    const employeeInAttendees = allAttendees.some(
      attendee => attendee.email.toLowerCase() === employeeEmail.toLowerCase()
    );
    
    if (!employeeInAttendees) {
      allAttendees.unshift({ 
        email: employeeEmail,
        organizer: true,
        responseStatus: 'accepted' 
      });
    }

    const event = {
      summary: meetingTitle,
      description: description || '',
      start: {
        dateTime: startTime,
        timeZone: 'Africa/Kigali',
      },
      end: {
        dateTime: endTime,
        timeZone: 'Africa/Kigali',
      },
      attendees: allAttendees, 
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    // Create the event
    const response = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      sendUpdates: 'all', 
      resource: event,
    });

    console.log('✅ Meeting booked:', response.data.htmlLink);

    res.json({
      success: true,
      message: 'Meeting booked successfully',
      event: {
        id: response.data.id,
        link: response.data.htmlLink,
        meetLink: response.data.hangoutLink || response.data.conferenceData?.entryPoints?.[0]?.uri,
        summary: response.data.summary,
        start: response.data.start.dateTime,
        end: response.data.end.dateTime,
        attendees: response.data.attendees,
      }
    });

  } catch (error) {
    console.error('❌ Error booking meeting:', error);
    
    // Check if it's a scope error
    if (error.code === 403 && error.message.includes('insufficient authentication scopes')) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'This user needs to re-authorize with calendar write permissions',
        reauthorizeUrl: `/reauth/${employeeEmail}`,
        details: 'Please visit the reauthorize URL to grant calendar event creation permissions'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to book meeting', 
      details: error.message 
    });
  }
};

export default bookMeetingHandler;