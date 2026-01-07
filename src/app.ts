// This is the entry point of the application.
// It initializes the application logic, configurations, middleware, and route handling.

import express from 'express';
import { json } from 'body-parser';
import { routes } from './routes'; // Assuming you have a routes file

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(json());

// Routes
app.use('/api', routes); // Assuming you have defined routes

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});