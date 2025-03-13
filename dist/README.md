# spareMyMac Chrome Extension

A Chrome extension that helps you save memory on your Mac by collecting URLs from unopened tabs and exporting them to Obsidian notes with AI-generated summaries.

## Features

- Generate AI summaries of tab content using Google's Gemini API
- Export collected URLs with summaries to Obsidian notes
- Copy URLs with summaries to clipboard as markdown
- Download URLs with summaries as a markdown file
- Export links without summaries (faster option)
- Copy links without summaries to clipboard
- Download links without summaries as a markdown file

## Installation

### Prerequisites

- Node.js and npm installed on your computer
- A Google AI (Gemini) API key

### Setup

1. Clone or download this repository
2. Navigate to the project folder in your terminal
3. Install dependencies:
   ```
   npm install
   ```
4. Build the extension:
   ```
   npm run build
   ```
5. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top right)
   - Click "Load unpacked" and select the `dist` folder

## Obtaining a Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the API key and paste it in the extension settings

## Usage

1. Click on the spareMyMac icon in your Chrome toolbar
2. Enter your Gemini API key, Obsidian vault name, and note name in Settings
3. Choose one of the following options:

   **With AI Summaries:**
   - "Export to Obsidian" - Exports links and summaries to Obsidian
   - "Copy to Clipboard" - Copies links and summaries as markdown
   - "Download as Markdown" - Downloads the list as a markdown file

   **Links Only (No Summaries):**
   - "Export Links to Obsidian" - Exports only links to Obsidian (faster)
   - "Copy Links to Clipboard" - Copies only links as markdown
   - "Download Links" - Downloads only links as a markdown file

## Obsidian Integration

To export tabs to Obsidian:

1. Enter your Obsidian vault name in the "Obsidian Vault Name" field
2. Enter the note name in the "Note Name" field (the note must already exist in your vault)
3. Click "Export to Obsidian" or "Export Links to Obsidian"

The extension will append the links to your existing note using the obsidian://append URI protocol. If the note doesn't exist yet, you'll need to create it first in Obsidian.

## Development

To build the extension in watch mode during development:
```
npm run watch
```

This will automatically rebuild when files are changed.

## Notes

- You need to have Obsidian installed for the Obsidian export feature to work
- The extension appends to existing notes rather than creating new ones
- The extension uses a CORS proxy to fetch page content from different origins
- For faster operation without AI summaries, use the "Links Only" options

## License

MIT 