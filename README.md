# TrafficGuard - AI Traffic Violation Detection System

TrafficGuard is a high-performance traffic analysis engine that uses AI to detect traffic rule violations (Helmet, Seatbelt) and recognize license plates from images and videos. It features a YOLOv8-style visual interface with dynamic tracking and a simulated computer vision console.

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide React
- **Backend**: Node.js, Express, Multer
- **Database**: MongoDB (with Mongoose)
- **AI Engine**: Google Gemini 3.1 Pro (Multimodal)

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [MongoDB](https://www.mongodb.com/try/download/community) (Running locally on port 27017)
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)

## Local Setup Instructions

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd trafficguard
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory and add your credentials:
```env
GEMINI_API_KEY="your_actual_gemini_api_key_here"
MONGODB_URI="mongodb://localhost:27017/trafficguard"
APP_URL="http://localhost:3000"
```
*Note: You can use `.env.example` as a template.*

### 4. Start MongoDB
Ensure your local MongoDB service is running:
```bash
# On Windows (Command Prompt)
net start MongoDB

# On macOS/Linux
brew services start mongodb-community
# or
sudo systemctl start mongod
```

### 5. Run the Application
Start the development server (Express + Vite):
```bash
npm run dev
```

The application will be available at: [http://localhost:3000](http://localhost:3000)

## Project Structure

- `/server.ts`: Express server entry point with MongoDB connection and API routes.
- `/src/App.tsx`: Main React application and YOLO-style UI.
- `/src/types.ts`: TypeScript interfaces for detections and violations.
- `/public/uploads`: Directory where uploaded images and videos are stored.

## Features

- **Dynamic YOLO Overlays**: Real-time bounding boxes that track vehicles in videos.
- **AI Snapshot Analysis**: High-precision violation detection using Gemini 3.1 Pro.
- **YOLO Console**: Simulated terminal output showing AI inference logs.
- **History & Reports**: Persistent storage of all detections in MongoDB.
- **Fail-Safe Mode**: Automatic in-memory fallback if MongoDB is unavailable.
