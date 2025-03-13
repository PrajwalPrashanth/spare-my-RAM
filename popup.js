import { initGemini, generateSummary, extractPageContent } from './gemini.js';

document.addEventListener('DOMContentLoaded', async function() {
  console.log('Popup loaded');
  
  // Add status message for debugging
  showStatus('Loading extension...', 'blue');
  
  // Load saved settings
  chrome.storage.sync.get(['obsidianVault', 'obsidianNote', 'geminiApiKey'], async function(items) {
    console.log('Settings loaded:', Object.keys(items));
    
    if (items.obsidianVault) {
      document.getElementById('obsidianVault').value = items.obsidianVault;
    }
    if (items.obsidianNote) {
      document.getElementById('obsidianNote').value = items.obsidianNote;
    }
    if (items.geminiApiKey) {
      document.getElementById('geminiApiKey').value = items.geminiApiKey;
      const initialized = await initGemini(items.geminiApiKey);
      if (!initialized) {
        showStatus('Failed to initialize Gemini API. Please check your API key.', 'red');
      } else {
        showStatus('Extension ready', 'blue');
      }
    } else {
      showStatus('Please enter your Gemini API key', 'blue');
    }
  });

  // Save settings when changed
  document.getElementById('obsidianVault').addEventListener('change', saveSettings);
  document.getElementById('obsidianNote').addEventListener('change', saveSettings);
  document.getElementById('geminiApiKey').addEventListener('change', saveSettings);

  // Button event listeners for summarized content
  document.getElementById('exportToObsidian').addEventListener('click', exportToObsidian);
  document.getElementById('copyToClipboard').addEventListener('click', copyToClipboard);
  document.getElementById('downloadList').addEventListener('click', downloadList);
  
  // Button event listeners for links only (no summaries)
  document.getElementById('exportLinksToObsidian').addEventListener('click', exportLinksToObsidian);
  document.getElementById('copyLinksToClipboard').addEventListener('click', copyLinksToClipboard);
  document.getElementById('downloadLinks').addEventListener('click', downloadLinks);
});

// Save settings to Chrome storage
async function saveSettings() {
  const obsidianVault = document.getElementById('obsidianVault').value;
  const obsidianNote = document.getElementById('obsidianNote').value;
  const geminiApiKey = document.getElementById('geminiApiKey').value;
  
  showStatus('Saving settings...', 'blue');
  
  if (geminiApiKey) {
    const initialized = await initGemini(geminiApiKey);
    if (!initialized) {
      showStatus('Invalid Gemini API key', 'red');
      return;
    }
  }

  chrome.storage.sync.set({
    'obsidianVault': obsidianVault,
    'obsidianNote': obsidianNote,
    'geminiApiKey': geminiApiKey
  }, function() {
    showStatus('Settings saved');
  });
}

// Collect tabs and return a promise
function collectCurrentTabs() {
  console.log('Collecting current tabs');
  return new Promise((resolve) => {
    chrome.tabs.query({currentWindow: true}, function(tabs) {
      console.log(`Found ${tabs.length} tabs`);
      resolve(tabs);
    });
  });
}

// Process a single tab and generate its summary
async function processTab(tab) {
  try {
    showStatus(`Processing: ${tab.title}...`);
    console.log('Processing tab:', tab.id, tab.title);
    
    const content = await extractPageContent(tab);
    console.log('Content extracted:', content.substring(0, 50) + '...');
    
    if (content.startsWith('Unable to extract content:')) {
      return {
        title: tab.title,
        url: tab.url,
        summary: content
      };
    }
    
    const summary = await generateSummary(content);
    console.log('Summary generated:', summary);
    
    return {
      title: tab.title,
      url: tab.url,
      summary: summary
    };
  } catch (error) {
    console.error('Error processing tab:', error);
    return {
      title: tab.title,
      url: tab.url,
      summary: `Error processing tab: ${error.message}`
    };
  }
}

// Format tabs as markdown links with summaries
async function formatTabsAsMarkdown(tabs) {
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();
  
  let markdown = `# Saved Tabs (${dateStr} at ${timeStr})\n\n`;
  
  showStatus('Processing tabs in sequence...');
  
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

// Export tabs to Obsidian
async function exportToObsidian() {
  try {
    showStatus('Preparing for Obsidian export...', 'blue');
    
    const obsidianVault = document.getElementById('obsidianVault').value;
    const obsidianNote = document.getElementById('obsidianNote').value;
    
    if (!obsidianVault || !obsidianNote) {
      showStatus('Please enter Obsidian vault and note names', 'red');
      return;
    }
    
    const tabs = await collectCurrentTabs();
    
    if (tabs.length === 0) {
      showStatus('No tabs found to export', 'red');
      return;
    }
    
    const markdown = await formatTabsAsMarkdown(tabs);
    
    // Encode the markdown content for the URL
    const encodedContent = encodeURIComponent('\n\n' + markdown);
    
    // Create the Obsidian URL using Advanced URI plugin format
    const obsidianUrl = `obsidian://advanced-uri?vault=${encodeURIComponent(obsidianVault)}&filepath=${encodeURIComponent(obsidianNote)}&mode=append&data=${encodedContent}`;
    
    // Try to open Obsidian
    window.location.href = obsidianUrl;
    
    showStatus('Exported to Obsidian');
  } catch (error) {
    console.error('Obsidian export error:', error);
    showStatus(`Export failed: ${error.message}`, 'red');
  }
}

// Export links only to Obsidian (no summaries)
async function exportLinksToObsidian() {
  try {
    showStatus('Preparing links for Obsidian export...', 'blue');
    
    const obsidianVault = document.getElementById('obsidianVault').value;
    const obsidianNote = document.getElementById('obsidianNote').value;
    
    if (!obsidianVault || !obsidianNote) {
      showStatus('Please enter Obsidian vault and note names', 'red');
      return;
    }
    
    const tabs = await collectCurrentTabs();
    
    if (tabs.length === 0) {
      showStatus('No tabs found to export', 'red');
      return;
    }
    
    const markdown = await formatTabsAsLinksOnly(tabs);
    
    // Encode the markdown content for the URL
    const encodedContent = encodeURIComponent('\n\n' + markdown);
    
    // Create the Obsidian URL using Advanced URI plugin format
    const obsidianUrl = `obsidian://advanced-uri?vault=${encodeURIComponent(obsidianVault)}&filepath=${encodeURIComponent(obsidianNote)}&mode=append&data=${encodedContent}`;
    
    // Try to open Obsidian
    window.location.href = obsidianUrl;
    
    showStatus('Links exported to Obsidian');
  } catch (error) {
    console.error('Obsidian links export error:', error);
    showStatus(`Links export failed: ${error.message}`, 'red');
  }
}

// Copy to clipboard
async function copyToClipboard() {
  try {
    showStatus('Preparing for clipboard copy...', 'blue');
    
    const tabs = await collectCurrentTabs();
    
    if (tabs.length === 0) {
      showStatus('No tabs found to copy', 'red');
      return;
    }
    
    const markdown = await formatTabsAsMarkdown(tabs);
    
    copyTextToClipboard(markdown);
    
    showStatus('Copied to clipboard');
  } catch (error) {
    console.error('Clipboard error:', error);
    showStatus(`Copy failed: ${error.message}`, 'red');
  }
}

// Copy links only to clipboard (no summaries)
async function copyLinksToClipboard() {
  try {
    showStatus('Preparing links for clipboard...', 'blue');
    
    const tabs = await collectCurrentTabs();
    
    if (tabs.length === 0) {
      showStatus('No tabs found to copy', 'red');
      return;
    }
    
    const markdown = await formatTabsAsLinksOnly(tabs);
    
    copyTextToClipboard(markdown);
    
    showStatus('Links copied to clipboard');
  } catch (error) {
    console.error('Links clipboard error:', error);
    showStatus(`Links copy failed: ${error.message}`, 'red');
  }
}

// Download as markdown
async function downloadList() {
  try {
    showStatus('Preparing for download...', 'blue');
    
    const tabs = await collectCurrentTabs();
    
    if (tabs.length === 0) {
      showStatus('No tabs found to download', 'red');
      return;
    }
    
    const markdown = await formatTabsAsMarkdown(tabs);
    
    // Create a download link
    const blob = new Blob([markdown], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    
    // Create a date string for the filename
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    
    // Create and click a download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `saved-tabs-${dateStr}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    showStatus('Download complete');
  } catch (error) {
    console.error('Download error:', error);
    showStatus(`Download failed: ${error.message}`, 'red');
  }
}

// Download links only as markdown (no summaries)
async function downloadLinks() {
  try {
    showStatus('Preparing links for download...', 'blue');
    
    const tabs = await collectCurrentTabs();
    
    if (tabs.length === 0) {
      showStatus('No tabs found to download', 'red');
      return;
    }
    
    const markdown = await formatTabsAsLinksOnly(tabs);
    
    // Create a download link
    const blob = new Blob([markdown], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    
    // Create a date string for the filename
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    
    // Create and click a download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `saved-links-${dateStr}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    showStatus('Links download complete');
  } catch (error) {
    console.error('Links download error:', error);
    showStatus(`Links download failed: ${error.message}`, 'red');
  }
}

// Helper function to copy text to clipboard
function copyTextToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

// Show status message
function showStatus(message, color = '#4caf50') {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.style.color = color;
} 