// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    // Add a ping handler to verify the content script is loaded
    if (request.action === 'ping') {
        console.log('Received ping request, responding with pong');
        sendResponse({ status: 'pong' });
    }
    else if (request.action === 'getMetadata') {
        // Extract page metadata
        const metadata = extractMetadata();
        sendResponse(metadata);
    }
    else if (request.action === 'getPageContent') {
        // Extract full page content
        const content = extractPageContent();
        sendResponse({ content });
    }
    return true; // Keep channel open for async response
});

// Extract full page content
function extractPageContent() {
    try {
        console.log('Extracting page content from DOM');
        
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
        console.error('Error extracting page content:', error);
        return `Error extracting content: ${error.message}`;
    }
}

// Extract metadata from the current page
function extractMetadata() {
    try {
        // Get meta description
        const metaDescription = document.querySelector('meta[name="description"]')?.content || 
                                document.querySelector('meta[property="og:description"]')?.content || '';
                              
        // Get meta keywords
        const metaKeywords = document.querySelector('meta[name="keywords"]')?.content || '';
        
        // Get first paragraph or content preview
        let contentPreview = '';
        const firstParagraph = document.querySelector('p');
        if (firstParagraph) {
            contentPreview = firstParagraph.textContent.trim();
            if (contentPreview.length > 300) {
                contentPreview = contentPreview.substring(0, 300) + '...';
            }
        }
        
        // Get h1 heading
        const mainHeading = document.querySelector('h1')?.textContent.trim() || '';
        
        return {
            description: metaDescription,
            keywords: metaKeywords,
            heading: mainHeading,
            preview: contentPreview
        };
    } catch (error) {
        console.error('Error extracting metadata:', error);
        return { description: '', keywords: '', heading: '', preview: '' };
    }
} 