import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Gemini API client
let geminiClient = null;

// Function to initialize Gemini API with your API key
async function initGemini(apiKey) {
    try {
        console.log('Initializing Gemini API...');
        const genAI = new GoogleGenerativeAI(apiKey);
        geminiClient = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        console.log('Gemini API initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing Gemini:', error);
        return false;
    }
}

// Function to generate summary using Gemini
async function generateSummary(content) {
    console.log('Generating summary for content length:', content?.length);
    if (!geminiClient) {
        throw new Error('Gemini API not initialized. Please check your API key.');
    }

    if (!content || content.trim().length === 0) {
        return 'No content available to summarize';
    }

    // If we couldn't extract content, generate a summary based on the URL
    if (content.startsWith('Unable to') && content.includes('URL:')) {
        const url = content.split('URL:')[1].trim();
        const prompt = `Please provide a brief, informative summary (2-3 sentences) of what this website is likely about, based only on its URL: ${url}. 
        Note that I couldn't access the actual content. Focus on what you know about this domain and what the URL path suggests.`;
        
        try {
            console.log('Generating URL-based summary...');
            const result = await geminiClient.generateContent(prompt);
            const response = await result.response;
            const summary = response.text();
            return `[Auto-generated based on URL only] ${summary.trim()}`;
        } catch (error) {
            console.error('Error generating URL summary:', error);
            return `Unable to summarize. This appears to be a ${getUrlType(url)} website.`;
        }
    }

    try {
        const prompt = `Please provide a brief, informative summary (2-3 sentences) of the following content:\n\n${content}`;
        console.log('Sending request to Gemini API...');
        const result = await geminiClient.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();
        console.log('Summary generated successfully');
        return summary.trim() || 'Summary generation failed';
    } catch (error) {
        console.error('Error generating summary:', error);
        return `Unable to generate summary: ${error.message}`;
    }
}

// Check if content script is available
async function isContentScriptAvailable(tabId) {
    return new Promise((resolve) => {
        try {
            // Set a timeout in case message never returns
            const timeoutId = setTimeout(() => {
                console.log('Content script ping timed out');
                resolve(false);
            }, 500);
            
            chrome.tabs.sendMessage(
                tabId, 
                { action: 'ping' }, 
                response => {
                    clearTimeout(timeoutId);
                    
                    // Check for runtime error
                    if (chrome.runtime.lastError) {
                        console.log('Content script not available:', chrome.runtime.lastError);
                        resolve(false);
                        return;
                    }
                    
                    // Check for valid response
                    if (!response || response.status !== 'pong') {
                        console.log('Invalid response from content script');
                        resolve(false);
                        return;
                    }
                    
                    console.log('Content script is available');
                    resolve(true);
                }
            );
        } catch (error) {
            console.error('Error checking content script:', error);
            resolve(false);
        }
    });
}

// Safe check if an API exists
function apiExists(obj, path) {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
        if (current === undefined || current === null || !(part in current)) {
            return false;
        }
        current = current[part];
    }
    
    return typeof current === 'function';
}

// Extract content by injecting script via executeScript - safer implementation
async function extractContentUsingScripting(tabId) {
    console.log('Attempting to extract content using scripting API for tab:', tabId);
    
    try {
        // Check if chrome.scripting API is available
        if (!apiExists(chrome, 'scripting.executeScript')) {
            console.warn('chrome.scripting.executeScript API is not available');
            return null;
        }
        
        // Define the function to be executed in the page context
        function extractContentFromPage() {
            try {
                // Create a clone of the body to avoid modifying the original page
                const bodyClone = document.body.cloneNode(true);
                
                // Remove non-content elements
                const elementsToRemove = bodyClone.querySelectorAll(
                    'script, style, noscript, iframe, ' +
                    'nav, header, footer, aside, ' + 
                    '[role="banner"], [role="navigation"], [role="complementary"], ' +
                    '.nav, .navigation, .header, .footer, .sidebar, .ad, .advertisement, ' +
                    '.cookie-banner, .popup, .modal, .social-links, .related-posts'
                );
                
                elementsToRemove.forEach(element => {
                    if (element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                });
                
                // Try to find the main content container
                const mainContentSelectors = [
                    'main', 
                    'article', 
                    '[role="main"]',
                    '.content', 
                    '#content', 
                    '.main-content',
                    '#main-content', 
                    '.post-content',
                    '.article-content',
                    '.entry-content'
                ];
                
                let contentElement = null;
                
                // Try each selector until we find content
                for (const selector of mainContentSelectors) {
                    const element = bodyClone.querySelector(selector);
                    if (element && element.textContent.trim().length > 100) {
                        contentElement = element;
                        break;
                    }
                }
                
                // If we can't find a specific content element, use the body
                if (!contentElement) {
                    contentElement = bodyClone;
                }
                
                // Get all paragraphs from the content element
                const paragraphs = contentElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
                
                // Extract text from paragraphs
                let contentText = '';
                paragraphs.forEach(p => {
                    if (p.textContent.trim().length > 20) { // Only add substantial paragraphs
                        contentText += p.textContent.trim() + ' ';
                    }
                });
                
                // If we couldn't find good paragraphs, fall back to all text
                if (contentText.length < 100) {
                    contentText = contentElement.textContent;
                }
                
                // Clean up the content
                contentText = contentText
                    .replace(/\s+/g, ' ')
                    .trim();
                
                // Limit content length but try to break at a sentence
                if (contentText.length > 3000) {
                    const truncated = contentText.slice(0, 3000);
                    const lastSentence = truncated.lastIndexOf('.');
                    if (lastSentence > 2000) {
                        contentText = truncated.slice(0, lastSentence + 1);
                    } else {
                        contentText = truncated;
                    }
                }
                
                return contentText || 'No content found on page';
            } catch (error) {
                return `Error extracting content via scripting: ${error.message}`;
            }
        }
        
        // Execute the function in the page context
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: extractContentFromPage
        });
        
        if (results && results[0] && results[0].result) {
            console.log('Successfully extracted content via scripting, length:', results[0].result.length);
            return results[0].result;
        }
        
        return null;
    } catch (error) {
        console.error('Error with scripting.executeScript:', error);
        return null;
    }
}

// Fallback method: Extract content using activeTab directly
async function extractContentUsingActiveTab(tab) {
    console.log('Attempting to extract content using activeTab for tab:', tab.id);
    
    try {
        // Try to execute script directly without using the scripting API
        // This is a fallback method for older Chrome versions
        return new Promise((resolve) => {
            chrome.tabs.executeScript(
                tab.id,
                { 
                    code: `
                    (function() {
                        // Simple text extraction
                        try {
                            // Get document title
                            const title = document.title || '';
                            
                            // Try to get meta description
                            const metaDesc = document.querySelector('meta[name="description"]')?.content || 
                                             document.querySelector('meta[property="og:description"]')?.content || '';
                            
                            // Get first few paragraphs
                            const paragraphs = Array.from(document.querySelectorAll('p'))
                                .filter(p => p.textContent.trim().length > 50)
                                .slice(0, 5)
                                .map(p => p.textContent.trim())
                                .join(' ');
                            
                            return title + '\\n\\n' + (metaDesc ? metaDesc + '\\n\\n' : '') + paragraphs;
                        } catch (e) {
                            return 'Error extracting content: ' + e.message;
                        }
                    })();
                    ` 
                },
                (results) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error with executeScript:', chrome.runtime.lastError);
                        resolve(null);
                        return;
                    }
                    
                    if (results && results[0]) {
                        resolve(results[0]);
                    } else {
                        resolve(null);
                    }
                }
            );
        });
    } catch (error) {
        console.error('Error with activeTab extraction:', error);
        return null;
    }
}

// Extract content directly from the DOM using content script
async function extractDOMContent(tab) {
    try {
        console.log('Extracting content directly from DOM for tab:', tab.id);
        
        // First check if content script is available
        const isAvailable = await isContentScriptAvailable(tab.id);
        
        // If content script is available, use it
        if (isAvailable) {
            console.log('Content script is available, using it to extract content');
            // Send message to content script to extract page content
            return new Promise((resolve) => {
                chrome.tabs.sendMessage(
                    tab.id, 
                    { action: 'getPageContent' }, 
                    response => {
                        if (chrome.runtime.lastError) {
                            console.error('Error communicating with content script:', chrome.runtime.lastError);
                            resolve(null); // Return null to indicate failure, will fall back to other methods
                            return;
                        }
                        
                        if (response && response.content) {
                            console.log('DOM content extracted successfully, length:', response.content.length);
                            resolve(response.content);
                        } else {
                            console.log('No content returned from content script');
                            resolve(null);
                        }
                    }
                );
            });
        } 
        
        // If content script is not available, try using the scripting API instead
        console.log('Content script not available, trying alternative methods');
        
        // First try with the scripting API
        const scriptingContent = await extractContentUsingScripting(tab.id);
        if (scriptingContent) {
            return scriptingContent;
        }
        
        // If that fails, try the activeTab API
        console.log('Scripting API failed, trying activeTab API');
        return await extractContentUsingActiveTab(tab);
    } catch (error) {
        console.error('Error extracting DOM content:', error);
        return null; // Return null to indicate failure, will fall back to other methods
    }
}

// Direct extraction method (uses title and meta description)
async function extractMetadata(tab) {
    try {
        console.log('Using direct metadata extraction for tab:', tab.id);
        
        // Get the tab title
        const title = tab.title || '';
        
        // We'll skip trying to use content script for metadata since it's already failing
        // Just use the tab information directly
        return `Tab Title: ${title}\nURL: ${tab.url}`;
    } catch (error) {
        console.error('Error extracting metadata:', error);
        return `Tab Title: ${tab.title || ''}\nURL: ${tab.url}`;
    }
}

// List of CORS proxies to try in order
const corsProxies = [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?',
    'https://proxy.cors.sh/',
    'https://cors-anywhere.herokuapp.com/',
    'https://api.allorigins.win/raw?url='
];

// Function to fetch content from a URL using multiple proxies
async function fetchContent(url) {
    console.log('Fetching content from URL:', url);
    
    // Extract metadata from URL for fallback
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const path = urlObj.pathname;
    
    let regionBlocked = false;
    let lastError = '';
    
    // Try each proxy in sequence
    for (const proxy of corsProxies) {
        try {
            console.log(`Trying proxy: ${proxy}`);
            const targetUrl = proxy + encodeURIComponent(url);
            
            const response = await fetch(targetUrl, {
                headers: {
                    'Accept': 'text/html',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                // Set a timeout to avoid hanging
                signal: AbortSignal.timeout(8000)
            });

            if (!response.ok) {
                console.log(`Proxy ${proxy} returned ${response.status}`);
                
                // Check if we're dealing with country/region blocking
                if (response.status === 403) {
                    const text = await response.text();
                    if (text.includes('country') && text.includes('block')) {
                        regionBlocked = true;
                        lastError = 'Regional blocking detected, proxy access restricted';
                    }
                }
                
                continue; // Try the next proxy
            }

            const html = await response.text();
            
            // Use DOMParser to extract text content
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Remove script, style, and other non-content elements
            const elementsToRemove = doc.querySelectorAll('script, style, nav, header, footer, aside');
            elementsToRemove.forEach(element => element.remove());
            
            // Get the main content
            const mainContent = doc.querySelector('main, article, .content, #content, .post, #main');
            let content = mainContent ? mainContent.textContent : doc.body.textContent;
            
            // Clean up the text
            content = content.replace(/\s+/g, ' ').trim();
            
            if (content.length === 0) {
                console.log('No content found, trying next proxy');
                continue; // Try the next proxy
            }
            
            // Limit content length
            if (content.length > 1500) {
                content = content.substring(0, 1500);
            }
            
            return content;
        } catch (error) {
            console.error(`Error with proxy ${proxy}:`, error);
            lastError = error.message;
            // Continue to the next proxy
        }
    }
    
    // If all proxies fail, return metadata about the URL
    const errorReason = regionBlocked 
        ? 'CORS proxies are blocked in your region' 
        : `Proxies failed: ${lastError}`;
    
    return `Unable to extract content from URL: ${url}\nDomain: ${domain}\nPath: ${path}\nError: ${errorReason}`;
}

// Helper function to determine URL type
function getUrlType(url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('google.dev') || lowerUrl.includes('ai.google')) {
        return 'Google AI developer documentation';
    }
    if (lowerUrl.includes('github.com')) {
        return 'GitHub repository';
    }
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
        return 'YouTube video';
    }
    if (lowerUrl.includes('docs.') || lowerUrl.includes('/docs/')) {
        return 'documentation';
    }
    if (lowerUrl.includes('blog') || lowerUrl.includes('article')) {
        return 'blog or article';
    }
    
    // Extract domain for generic classification
    try {
        const domain = new URL(url).hostname;
        return domain + ' page';
    } catch {
        return 'web';
    }
}

// Function to extract content directly from tab's URL
async function extractPageContent(tab) {
    console.log('Extracting content from tab:', tab?.id, tab?.url);
    
    try {
        if (!tab || !tab.url) {
            return 'No URL to extract content from';
        }
        
        // Skip non-HTTP URLs
        if (!tab.url.startsWith('http')) {
            return `Unable to extract content: Unsupported URL protocol (${tab.url})`;
        }

        // Try methods in order of preference:
        
        // 1. First, try to extract content directly from the DOM (best option)
        const domContent = await extractDOMContent(tab);
        if (domContent && domContent.length > 100) {
            console.log('Successfully extracted content from DOM');
            return domContent;
        }
        
        console.log('DOM extraction failed or returned insufficient content, trying fallback methods');
        
        // 2. Then try to use metadata as a secure fallback (always available)
        const metadata = await extractMetadata(tab);
        
        // 3. Finally try to fetch content with proxies (may fail with 403)
        let proxyContent;
        try {
            proxyContent = await fetchContent(tab.url);
        } catch (error) {
            console.error('All proxies failed:', error);
            return metadata;
        }
        
        // If proxy content extraction fails or is too short, use metadata
        if (proxyContent.startsWith('Unable to') || proxyContent.length < 50) {
            return metadata;
        }
        
        return proxyContent;
    } catch (error) {
        console.error('Error extracting content:', error);
        return `Unable to extract content: ${error.message}\nURL: ${tab?.url}`;
    }
}

export { initGemini, generateSummary, extractPageContent }; 