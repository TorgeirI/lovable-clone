import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../../public')));

// Serve generated projects from output directory
app.use('/output', express.static(path.join(__dirname, '../../output')));

// API routes
app.use(routes);

// Serve frontend for all non-API routes
app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Lovable Clone server running on http://localhost:${PORT}`);
    console.log(`📁 Serving static files from: ${path.join(__dirname, '../../public')}`);
    console.log(`📂 Output directory: ${path.join(__dirname, '../../output')}`);
});

export default app;