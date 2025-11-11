import analyzeWithGemini from '../helpers/analyseWithGemini.js';
import buildFriendlyResponse from '../helpers/buildFriendlyResponse.js';
import Employee from '../models/Employees.js';
import getCalendarData from '../helpers/getCalendarData.js';
export default async function requestMeetingHandler(req, res) {
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
}