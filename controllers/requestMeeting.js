import analyzeWithGemini from '../helpers/analyseWithGemini.js';
import buildFriendlyResponse from '../helpers/buildFriendlyResponse.js';
import Employee from '../models/Employees.js';
import getCalendarData from '../helpers/getCalendarData.js';
import extractNameFromUserMessage from '../helpers/ExtractNameFromUserMessage.js';

export default async function requestMeetingHandler(req, res) {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'no message' });

  const name = await extractNameFromUserMessage(message).then(n => n.trim());
  if (!name || name === "Name not found") return res.status(400).json({ error: 'Please provide a valid employee name in your message.' });
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