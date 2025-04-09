import {
  initGemini,
  generateSummary,
  generateYouTubeSummary,
  extractPageContent,
  setYoutubeSummaryEnabled,
  isYouTubeUrl,
} from "./gemini.js";

let promptsFolderHandle = null;

document.addEventListener("DOMContentLoaded", async function () {
  console.log("Popup loaded");

  // Add status message for debugging
  showStatus("Loading extension...", "blue");

  // Add event listener for the select prompts folder button
  document
    .getElementById("selectPromptsFolder")
    .addEventListener("click", requestFolderAccess);

  // Check if current tab is a YouTube video
  chrome.tabs.query(
    { active: true, currentWindow: true },
    async function (tabs) {
      const currentTab = tabs[0];
      const isYouTubeVideo = isYouTubeUrl(currentTab?.url);

      // Show/hide the YouTube Research section based on if it's a YouTube video
      document.getElementById("ytResearchSection").style.display =
        isYouTubeVideo ? "block" : "none";

      // Set default research prompt if current tab is a YouTube video
      if (isYouTubeVideo) {
        const defaultResearchPrompt =
          "Please provide a detailed analysis of this YouTube video based on its transcript. Include:\n" +
          "1. Main topics and key points\n" +
          "2. Important facts and data mentioned\n" +
          "3. Notable quotes or statements\n" +
          "4. Any methodologies or techniques discussed\n" +
          "5. A critical analysis of the content\n\n" +
          "{transcript}";

        document.getElementById("ytResearchPrompt").value =
          defaultResearchPrompt;
      }
    }
  );

  // Load saved settings
  chrome.storage.sync.get(
    ["obsidianVault", "obsidianNote", "geminiApiKey", "enableYoutubeSummary"],
    async function (items) {
      console.log("Settings loaded:", Object.keys(items));

      if (items.obsidianVault) {
        document.getElementById("obsidianVault").value = items.obsidianVault;
        // Load prompts when vault is loaded
        loadObsidianPrompts();
      }
      if (items.obsidianNote) {
        document.getElementById("obsidianNote").value = items.obsidianNote;
      }
      if (items.geminiApiKey) {
        document.getElementById("geminiApiKey").value = items.geminiApiKey;
        const initialized = await initGemini(items.geminiApiKey);
        if (!initialized) {
          showStatus(
            "Failed to initialize Gemini API. Please check your API key.",
            "red"
          );
        } else {
          showStatus("Extension ready", "blue");
        }
      } else {
        showStatus("Please enter your Gemini API key", "blue");
      }

      // Set YouTube summary toggle state
      const enableYoutubeSummary = items.enableYoutubeSummary || false;
      document.getElementById("enableYoutubeSummary").checked =
        enableYoutubeSummary;
      setYoutubeSummaryEnabled(enableYoutubeSummary);
    }
  );

  // Save settings when changed
  document
    .getElementById("obsidianVault")
    .addEventListener("change", saveSettings);
  document
    .getElementById("obsidianNote")
    .addEventListener("change", saveSettings);
  document
    .getElementById("geminiApiKey")
    .addEventListener("change", saveSettings);
  document
    .getElementById("enableYoutubeSummary")
    .addEventListener("change", saveSettings);

  // Button event listeners for summarized content
  document
    .getElementById("exportToObsidian")
    .addEventListener("click", exportToObsidian);
  document
    .getElementById("copyToClipboard")
    .addEventListener("click", copyToClipboard);
  document
    .getElementById("downloadList")
    .addEventListener("click", downloadList);

  // Button event listeners for links only (no summaries)
  document
    .getElementById("exportLinksToObsidian")
    .addEventListener("click", exportLinksToObsidian);
  document
    .getElementById("copyLinksToClipboard")
    .addEventListener("click", copyLinksToClipboard);
  document
    .getElementById("downloadLinks")
    .addEventListener("click", downloadLinks);

  // Button event listeners for YouTube research
  document
    .getElementById("analyzeAndExportYT")
    .addEventListener("click", analyzeAndExportYT);

  // Add transcript copy button listener
  document
    .getElementById("copyTranscript")
    .addEventListener("click", copyYouTubeTranscript);

  // Add auto-scroll button listener
  document
    .getElementById("autoScroll")
    .addEventListener("click", startAutoScroll);

  // Add event listener for prompt selection
  document
    .getElementById("obsidianPromptSelect")
    .addEventListener("change", handlePromptSelection);
});

// Save settings to Chrome storage
async function saveSettings() {
  const obsidianVault = document.getElementById("obsidianVault").value;
  const obsidianNote = document.getElementById("obsidianNote").value;
  const geminiApiKey = document.getElementById("geminiApiKey").value;
  const enableYoutubeSummary = document.getElementById(
    "enableYoutubeSummary"
  ).checked;

  showStatus("Saving settings...", "blue");

  if (geminiApiKey) {
    const initialized = await initGemini(geminiApiKey);
    if (!initialized) {
      showStatus("Invalid Gemini API key", "red");
      return;
    }
  }

  setYoutubeSummaryEnabled(enableYoutubeSummary);

  chrome.storage.sync.set(
    {
      obsidianVault: obsidianVault,
      obsidianNote: obsidianNote,
      geminiApiKey: geminiApiKey,
      enableYoutubeSummary: enableYoutubeSummary,
    },
    function () {
      showStatus("Settings saved");
    }
  );
}

// Collect tabs and return a promise
function collectCurrentTabs() {
  console.log("Collecting current tabs");
  return new Promise((resolve) => {
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      console.log(`Found ${tabs.length} tabs`);
      resolve(tabs);
    });
  });
}

// Process a single tab and generate its summary
async function processTab(tab) {
  try {
    showStatus(`Processing: ${tab.title}...`);
    console.log("Processing tab:", tab.id, tab.title);

    // First check if it's a YouTube URL and the feature is enabled
    const isYouTube = isYouTubeUrl(tab.url);
    const youTubeSummaryEnabled = document.getElementById(
      "enableYoutubeSummary"
    ).checked;

    if (isYouTube && youTubeSummaryEnabled) {
      console.log("Processing YouTube video...");
      const ytSummary = await generateYouTubeSummary(tab.url);
      if (ytSummary) {
        return {
          title: tab.title,
          url: tab.url,
          summary: ytSummary,
        };
      }
      console.log(
        "YouTube transcript summarization failed, falling back to regular content extraction"
      );
    }

    // Regular content extraction flow (non-YouTube or fallback)
    console.log("Using regular content extraction...");
    const content = await extractPageContent(tab);
    console.log("Content extracted:", content.substring(0, 50) + "...");

    return {
      title: tab.title,
      url: tab.url,
      summary: await generateSummary(content, tab.url),
    };
  } catch (error) {
    console.error("Error processing tab:", error);
    return {
      title: tab.title,
      url: tab.url,
      summary: `Error processing tab: ${error.message}`,
    };
  }
}

// Format tabs as markdown links with summaries
async function formatTabsAsMarkdown(tabs) {
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();

  let markdown = `# Saved Tabs (${dateStr} at ${timeStr})\n\n`;

  showStatus("Processing tabs in sequence...");

  // Process tabs one by one to prevent overwhelming the browser
  const processedTabs = [];
  for (const tab of tabs) {
    const processed = await processTab(tab);
    processedTabs.push(processed);
  }

  for (const tab of processedTabs) {
    markdown += `## [${tab.title}](${tab.url})\n\n`;
    markdown += `**Summary:** ${tab.summary}\n\n`;
  }

  return markdown;
}

// Format tabs as markdown links only (no summaries)
async function formatTabsAsLinksOnly(tabs) {
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();

  let markdown = `# Saved Links (${dateStr} at ${timeStr})\n\n`;

  for (const tab of tabs) {
    markdown += `- [${tab.title}](${tab.url})\n`;
  }

  return markdown;
}

// Function to export content to Obsidian
async function exportContentToObsidian(content, successMessage) {
  const obsidianVault = document.getElementById("obsidianVault").value;
  const obsidianNote = document.getElementById("obsidianNote").value;

  if (!obsidianVault || !obsidianNote) {
    showStatus("Please enter Obsidian vault and note names", "red");
    return false;
  }

  try {
    // Encode the content for the URL
    const encodedContent = encodeURIComponent("\n\n" + content);

    // Create the Obsidian URL using Advanced URI plugin format
    const baseUrl = `obsidian://advanced-uri?vault=${encodeURIComponent(
      obsidianVault
    )}&filepath=${encodeURIComponent(obsidianNote)}`;
    const fullUrl = `${baseUrl}&mode=append&data=${encodedContent}`;

    if (fullUrl.length > 2000) {
      // URL length limit
      console.log("URL too long, using clipboard method");
      await navigator.clipboard.writeText(content);

      // Open Obsidian with clipboard paste command
      const clipboardUrl = `${baseUrl}&mode=append&clipboard=true`;
      window.open(clipboardUrl, "_blank");
      showStatus(successMessage + " (via clipboard)");
    } else {
      window.open(fullUrl, "_blank");
      showStatus(successMessage);
    }
    return true;
  } catch (error) {
    console.error("Obsidian export error:", error);
    showStatus(`Export failed: ${error.message}`, "red");
    return false;
  }
}

// Function to start auto-scrolling
async function startAutoScroll() {
  try {
    showStatus("Starting YouTube Watch Later extraction...", "blue");

    // Get the current active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // Inject the content script if it hasn't been injected yet
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["autoScroll.js"],
    });

    // Send message to start auto-scrolling
    chrome.tabs.sendMessage(
      tab.id,
      { action: "startAutoScroll" },
      async (response) => {
        if (chrome.runtime.lastError) {
          showStatus("Failed to extract videos", "red");
          return;
        }

        if (response.status === "error") {
          showStatus(response.message, "red");
          return;
        }

        if (response.status === "complete" && response.videos) {
          const videos = response.videos;

          // Create markdown content
          let markdown = "# YouTube Watch Later Videos\n\n";
          markdown += `Extracted on ${new Date().toLocaleString()}\n\n`;

          videos.forEach((video, index) => {
            markdown += `## ${index + 1}. ${video.title}\n`;
            markdown += `- Channel: ${video.channel}\n`;
            markdown += `- Duration: ${video.duration}\n`;
            markdown += `- URL: ${video.url}\n\n`;
          });

          await exportContentToObsidian(
            markdown,
            `Extracted ${videos.length} videos and sent to Obsidian`
          );
        }
      }
    );
  } catch (error) {
    console.error("Auto-scroll error:", error);
    showStatus(`Failed to extract videos: ${error.message}`, "red");
  }
}

// Function to export to Obsidian
async function exportToObsidian() {
  try {
    showStatus("Preparing for Obsidian export...", "blue");

    const tabs = await collectCurrentTabs();

    if (tabs.length === 0) {
      showStatus("No tabs found to export", "red");
      return;
    }

    const markdown = await formatTabsAsMarkdown(tabs);
    await exportContentToObsidian(markdown, "Exported to Obsidian");
  } catch (error) {
    console.error("Obsidian export error:", error);
    showStatus(`Export failed: ${error.message}`, "red");
  }
}

// Function to export links to Obsidian
async function exportLinksToObsidian() {
  try {
    showStatus("Preparing links for Obsidian export...", "blue");

    const tabs = await collectCurrentTabs();

    if (tabs.length === 0) {
      showStatus("No tabs found to export", "red");
      return;
    }

    const markdown = await formatTabsAsLinksOnly(tabs);
    await exportContentToObsidian(markdown, "Links exported to Obsidian");
  } catch (error) {
    console.error("Obsidian links export error:", error);
    showStatus(`Links export failed: ${error.message}`, "red");
  }
}

// Copy to clipboard
async function copyToClipboard() {
  try {
    showStatus("Preparing for clipboard copy...", "blue");

    const tabs = await collectCurrentTabs();

    if (tabs.length === 0) {
      showStatus("No tabs found to copy", "red");
      return;
    }

    const markdown = await formatTabsAsMarkdown(tabs);

    copyTextToClipboard(markdown);

    showStatus("Copied to clipboard");
  } catch (error) {
    console.error("Clipboard error:", error);
    showStatus(`Copy failed: ${error.message}`, "red");
  }
}

// Copy links only to clipboard (no summaries)
async function copyLinksToClipboard() {
  try {
    showStatus("Preparing links for clipboard...", "blue");

    const tabs = await collectCurrentTabs();

    if (tabs.length === 0) {
      showStatus("No tabs found to copy", "red");
      return;
    }

    const markdown = await formatTabsAsLinksOnly(tabs);

    copyTextToClipboard(markdown);

    showStatus("Links copied to clipboard");
  } catch (error) {
    console.error("Links clipboard error:", error);
    showStatus(`Links copy failed: ${error.message}`, "red");
  }
}

// Download as markdown
async function downloadList() {
  try {
    showStatus("Preparing for download...", "blue");

    const tabs = await collectCurrentTabs();

    if (tabs.length === 0) {
      showStatus("No tabs found to download", "red");
      return;
    }

    const markdown = await formatTabsAsMarkdown(tabs);

    // Create a download link
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    // Create a date string for the filename
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];

    // Create and click a download link
    const a = document.createElement("a");
    a.href = url;
    a.download = `saved-tabs-${dateStr}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showStatus("Download complete");
  } catch (error) {
    console.error("Download error:", error);
    showStatus(`Download failed: ${error.message}`, "red");
  }
}

// Download links only as markdown (no summaries)
async function downloadLinks() {
  try {
    showStatus("Preparing links for download...", "blue");

    const tabs = await collectCurrentTabs();

    if (tabs.length === 0) {
      showStatus("No tabs found to download", "red");
      return;
    }

    const markdown = await formatTabsAsLinksOnly(tabs);

    // Create a download link
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    // Create a date string for the filename
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];

    // Create and click a download link
    const a = document.createElement("a");
    a.href = url;
    a.download = `saved-links-${dateStr}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showStatus("Links download complete");
  } catch (error) {
    console.error("Links download error:", error);
    showStatus(`Links download failed: ${error.message}`, "red");
  }
}

// Helper function to copy text to clipboard
function copyTextToClipboard(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

// Show status message
function showStatus(message, color = "#4caf50") {
  const statusElement = document.getElementById("status");
  statusElement.textContent = message;
  statusElement.style.color = color;
}

// Function to analyze and export YouTube analysis
async function analyzeAndExportYT() {
  try {
    showStatus("Analyzing YouTube video...", "blue");

    // Get the current tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!isYouTubeUrl(tab.url)) {
      showStatus("Not a YouTube video", "red");
      return;
    }

    // Get custom prompt
    const customPrompt = document.getElementById("ytResearchPrompt").value;

    // Generate the YouTube analysis
    const analysis = await generateYouTubeSummary(tab.url, customPrompt);

    if (!analysis) {
      showStatus(
        "Failed to analyze video. Transcript may be unavailable.",
        "red"
      );
      return;
    }

    // Display the analysis
    const resultElement = document.getElementById("ytAnalysisResult");
    resultElement.textContent = analysis;
    resultElement.style.display = "block";

    // Format the content for Obsidian with markdown
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();

    let markdown = `# YouTube Research: ${tab.title}\n\n`;
    markdown += `*Analyzed on ${dateStr} at ${timeStr}*\n\n`;
    markdown += `URL: ${tab.url}\n\n`;
    markdown += `## Analysis\n\n${analysis}\n\n`;

    // Export the analysis to Obsidian
    await exportContentToObsidian(
      markdown,
      "Video analyzed and exported to Obsidian"
    );

    showStatus("Analysis complete and exported to Obsidian", "green");
  } catch (error) {
    console.error("Error analyzing and exporting YouTube video:", error);
    showStatus(`Analysis failed: ${error.message}`, "red");
  }
}

// Function to copy YouTube transcript to clipboard
async function copyYouTubeTranscript() {
  try {
    showStatus("Fetching transcript...", "blue");

    // Get current tab
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });

    if (!tabs || tabs.length === 0) {
      showStatus("No active tab found", "red");
      return;
    }

    const currentTab = tabs[0];

    // Check if it's a YouTube video
    if (!isYouTubeUrl(currentTab.url)) {
      showStatus("Not a YouTube video", "red");
      return;
    }

    // Import necessary functions
    const { extractVideoId, fetchTranscript } = await import(
      "./youtubeTranscript.js"
    );

    // Get video ID
    const videoId = extractVideoId(currentTab.url);
    if (!videoId) {
      showStatus("Invalid YouTube URL", "red");
      return;
    }

    // Fetch transcript
    const transcript = await fetchTranscript(videoId);
    if (!transcript) {
      showStatus("No transcript available", "red");
      return;
    }

    // Format the transcript with video title and URL
    const formattedTranscript = `# ${currentTab.title}\n${currentTab.url}\n\n## Transcript:\n\n${transcript}`;

    // Copy to clipboard
    await copyTextToClipboard(formattedTranscript);

    showStatus("Transcript copied to clipboard!", "#4caf50");
  } catch (error) {
    console.error("Error copying YouTube transcript:", error);
    showStatus(`Error: ${error.message}`, "red");
  }
}

// Function to request folder access
async function requestFolderAccess() {
  try {
    // Check if File System Access API is supported
    if (window.showDirectoryPicker) {
      // Modern approach using File System Access API
      promptsFolderHandle = await window.showDirectoryPicker({
        mode: "read",
        startIn: "documents",
      });

      // Store the folder name for future reference
      chrome.storage.local.set({
        promptsFolderName: promptsFolderHandle.name,
      });

      // Load prompts immediately after selecting the folder
      await loadObsidianPrompts();
      return promptsFolderHandle;
    } else {
      // Fallback approach using traditional file input
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.webkitdirectory = true;
      input.directory = true;

      // Return a promise that resolves when the file is selected
      return new Promise((resolve) => {
        input.onchange = async (e) => {
          const files = Array.from(e.target.files).filter((file) =>
            file.name.endsWith(".md")
          );
          promptsFolderHandle = {
            name:
              files[0]?.webkitRelativePath.split("/")[0] || "Selected Folder",
            files: files,
            // Implement a custom getFileHandle method for compatibility
            getFileHandle: async (fileName) => {
              const file = files.find((f) => f.name === fileName);
              if (!file) throw new Error("File not found");
              return {
                getFile: async () => file,
              };
            },
            // Implement a custom values method for compatibility
            values: async function* () {
              for (const file of files) {
                yield {
                  kind: "file",
                  name: file.name,
                  handle: file,
                };
              }
            },
          };

          // Store the folder name for future reference
          chrome.storage.local.set({
            promptsFolderName: promptsFolderHandle.name,
          });

          // Load prompts immediately after selecting the folder
          await loadObsidianPrompts();
          resolve(promptsFolderHandle);
        };

        // Trigger the file input click
        input.click();
      });
    }
  } catch (error) {
    console.error("Error accessing folder:", error);
    showStatus("Failed to access prompts folder", "red");
    return null;
  }
}

// Function to refresh prompts
async function refreshPrompts() {
  // Clear the existing folder handle to force re-selection
  promptsFolderHandle = null;
  await requestFolderAccess();
}

// Function to load prompts from the selected folder
async function loadObsidianPrompts() {
  try {
    if (!promptsFolderHandle) {
      showStatus("Please select a prompts folder first", "blue");
      return;
    }

    // Get all files in the folder
    const files = [];
    if (promptsFolderHandle.values) {
      // Modern API approach
      try {
        for await (const entry of promptsFolderHandle.values()) {
          if (entry.kind === "file" && entry.name.endsWith(".md")) {
            files.push({
              name: entry.name,
              handle: entry,
            });
          }
        }
      } catch (error) {
        // If we get an error reading the directory, try refreshing the handle
        console.error("Error reading directory, attempting refresh:", error);
        await refreshPrompts();
        return;
      }
    } else if (promptsFolderHandle.files) {
      // Fallback approach
      files.push(
        ...promptsFolderHandle.files.map((file) => ({
          name: file.name,
          handle: file,
        }))
      );
    }

    // Update the dropdown
    const select = document.getElementById("obsidianPromptSelect");

    // Clear existing options except the first one
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Add new options
    for (const file of files) {
      const option = document.createElement("option");
      option.value = file.name;
      option.textContent = file.name.replace(".md", "");
      select.appendChild(option);
    }

    // Add/Update the refresh button
    let refreshButton = document.getElementById("refreshPrompts");
    if (!refreshButton) {
      refreshButton = document.createElement("button");
      refreshButton.id = "refreshPrompts";
      refreshButton.textContent = "Refresh Prompts";
      refreshButton.className = "secondary-button";
      refreshButton.style.marginBottom = "10px";
      refreshButton.onclick = refreshPrompts; // Use the new refresh function

      // Insert the refresh button after the select prompts folder button
      const selectButton = document.getElementById("selectPromptsFolder");
      selectButton.parentNode.insertBefore(
        refreshButton,
        selectButton.nextSibling
      );
    }

    showStatus("Prompts loaded successfully", "green");
  } catch (error) {
    console.error("Error loading prompts:", error);
    showStatus("Failed to load prompts", "red");
  }
}

// Function to handle prompt selection
async function handlePromptSelection(event) {
  const selectedFile = event.target.value;
  if (!selectedFile || !promptsFolderHandle) return;

  try {
    let fileContent;
    if (promptsFolderHandle.getFileHandle) {
      // Modern API approach
      try {
        const fileHandle = await promptsFolderHandle.getFileHandle(
          selectedFile
        );
        const file = await fileHandle.getFile();
        fileContent = await file.text();
      } catch (error) {
        // If we get an error reading the file, try refreshing the handle
        console.error("Error reading file, attempting refresh:", error);
        await refreshPrompts();
        return;
      }
    } else {
      // Fallback approach
      const file = promptsFolderHandle.files.find(
        (f) => f.name === selectedFile
      );
      if (!file) throw new Error("File not found");
      fileContent = await file.text();
    }

    // Update the textarea
    document.getElementById("ytResearchPrompt").value = fileContent;
    showStatus("Prompt loaded successfully", "green");
  } catch (error) {
    console.error("Error reading prompt file:", error);
    showStatus("Failed to read prompt file", "red");
  }
}
