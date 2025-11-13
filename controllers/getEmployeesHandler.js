import Employee from '../models/Employees.js';

export default async function getEmployeesHandler(req, res) {
    try {
        const employees = await Employee.find({});
        res.status(200).json(employees);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
}