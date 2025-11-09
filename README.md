# Solar Oasis - Project Estimation & Financial Tracker

A comprehensive tool to estimate projects, track finances, and manage operations in real time.

## Prerequisites

Before running this application, you must have the backend set up correctly using Google Sheets and Google Apps Script.

1.  **Google Sheet:** A Google Sheet with the required tabs (`projects`, `transactions`, etc.).
2.  **Google Apps Script:** The `Code.gs` script must be pasted into the Apps Script editor of your sheet.
3.  **Apps Script Deployment URL:** You must deploy the script as a web app to get a deployment URL.
4.  **API Key:** You must have created a secret API key and set it inside your `Code.gs` script.

## Local Development Setup

Follow these steps to run the application on your local machine.

### 1. Install Dependencies

Open your terminal in the project root folder and run:

```bash
npm install
```

### 2. Configure API Credentials

The application requires your secret keys and backend URL to function.

1.  In your code editor, open the file located at `src/api.ts`.
2.  At the very top of the file, you will find a configuration section. It looks like this:

    ```typescript
    // --- START OF CONFIGURATION ---
    const API_URL = "YOUR_GOOGLE_APPS_SCRIPT_URL_HERE";
    const API_KEY = "YOUR_SECRET_API_KEY_HERE";
    // --- END OF CONFIGURATION ---
    ```

3.  **Replace the placeholder values** with your actual Apps Script Deployment URL and your secret API Key. Make sure the key matches the one you set in your `Code.gs` file.

**IMPORTANT:** Hardcoding credentials like this is convenient for local development, but it is a security risk. If you ever plan to commit this project to a public repository (like GitHub), you should move these keys back to a secure environment file (`.env`) to avoid exposing them.

### 3. Run the Development Server

Once the dependencies are installed and `src/api.ts` is configured, start the local development server:

```bash
npm run dev
```

You can now open your browser and navigate to the local address provided in the terminal (usually `http://localhost:5173`) to see the application running.