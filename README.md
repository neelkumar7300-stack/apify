# LinkedIn Job Scraper (Apify Actor)

This is a serverless Apify Actor written in Node.js using **Crawlee** to scrape the latest job postings from LinkedIn without requiring authentication.

## Features

- **Guest Access**: Uses LinkedIn's public guest endpoints, eliminating the risk of personal account suspensions.
- **Time Range Filter**: Specifically targets jobs posted within the last 24 hours (or configurable timeframes).
- **Keyword Filtering**: Searches for specific technical and support keywords (e.g., IT Support, Help Desk, Technical Support, Field Service Technician).
- **Secondary Relevance Verification**: Checks crawled job titles to ensure they match support/technician roles before saving.
- **Data Extracted**:
  - Job Title
  - Company Name
  - Location
  - Date Posted
  - Total Applicants Count
  - Job Posting URL
  - Description (Text & Full HTML)

---

## Local Development & Setup

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended).

### 2. Install Dependencies

In the project root directory, run:

```bash
npm install
```

### 3. Configure Input (Local Emulation)

The Apify SDK emulates the platform's key-value store locally in the `storage` folder. To pass inputs during local runs:

1. Create a directory structure: `storage/key_value_stores/default/` (this is automatically created on first run, but you can create it manually to set the input).
2. Create a file named `INPUT.json` inside that directory:
   - **Path**: `storage/key_value_stores/default/INPUT.json`
3. Add your configuration parameters:

```json
{
  "keywords": [
    "IT Support",
    "Help desk support",
    "Technical Support",
    "Field service technician"
  ],
  "location": "United States",
  "maxItems": 40,
  "postedWithin": "r86400"
}
```

### 4. Run the Scraper Locally

Start the Actor locally using:

```bash
npm start
```

### 5. Inspect the Results

Once completed, the extracted job listings will be saved as JSON files in the local dataset directory:
- **Path**: `storage/datasets/default/`

---

## Deploying to Apify

### Option A: Using Apify CLI

1. Install the Apify CLI:
   ```bash
   npm install -g apify-cli
   ```
2. Log in to your Apify account:
   ```bash
   apify login
   ```
3. Deploy the Actor from your project directory:
   ```bash
   apify push
   ```

### Option B: Using GitHub Integration

1. Push this project to a GitHub repository.
2. In the [Apify Console](https://console.apify.com/), click **Create new Actor**.
3. Link the Actor to your GitHub repository.
4. Apify will automatically build and deploy the Actor whenever you push changes to GitHub.
