// Track if scrolling is in progress
let isScrollingInProgress = false;

// Function to extract YouTube Watch Later video information
function extractYouTubeWatchLaterInfo() {
  const videos = [];
  const videoElements = document.querySelectorAll(
    "ytd-playlist-video-renderer"
  );

  videoElements.forEach((video) => {
    const titleElement = video.querySelector("#video-title");
    const channelElement = video.querySelector(".ytd-channel-name a");
    const durationElement = video.querySelector(".badge-shape-wiz__text");
    const videoLink = titleElement?.href || "";

    videos.push({
      title: titleElement?.textContent?.trim() || "",
      channel: channelElement?.textContent?.trim() || "",
      duration: durationElement?.textContent?.trim() || "",
      url: videoLink,
      timestamp: new Date().toISOString(),
    });
  });

  return videos;
}

// Function to perform auto-scrolling with detection of lazy-loaded content
async function autoScroll() {
  return new Promise((resolve) => {
    let previousHeight = 0;
    let noChangeCount = 0;
    const maxNoChangeCount = 5;
    let scrollInterval;

    // Start scrolling
    scrollInterval = setInterval(() => {
      const currentHeight = document.documentElement.scrollHeight;
      const scrollPosition = window.scrollY + window.innerHeight;

      // Check if we've reached the bottom and content hasn't changed
      if (scrollPosition >= currentHeight - 10) {
        // Added small threshold
        if (currentHeight === previousHeight) {
          noChangeCount++;
          if (noChangeCount >= maxNoChangeCount) {
            clearInterval(scrollInterval);
            window.scrollTo(0, 0); // Scroll back to top
            isScrollingInProgress = false;
            const videos = extractYouTubeWatchLaterInfo();
            resolve(videos);
          }
        } else {
          // Reset counter if height changed
          noChangeCount = 0;
        }
      }

      // Update previous height
      previousHeight = currentHeight;

      // Scroll by 800px
      window.scrollBy(0, 800);
    }, 500); // Check every 500ms

    // Safety timeout after 30 seconds
    setTimeout(() => {
      if (scrollInterval) {
        clearInterval(scrollInterval);
        window.scrollTo(0, 0);
        isScrollingInProgress = false;
        const videos = extractYouTubeWatchLaterInfo();
        resolve(videos);
      }
    }, 30000);
  });
}

// Remove any existing listeners
chrome.runtime.onMessage.removeListener(handleMessage);

// Message handler function
async function handleMessage(request, sender, sendResponse) {
  if (request.action === "startAutoScroll") {
    // Check if already scrolling
    if (isScrollingInProgress) {
      sendResponse({
        status: "error",
        message: "Scroll already in progress",
      });
      return true;
    }

    // Check if we're on YouTube Watch Later page
    if (!window.location.href.includes("youtube.com/playlist?list=WL")) {
      sendResponse({
        status: "error",
        message: "Please navigate to YouTube Watch Later page first",
      });
      return true;
    }

    // Set scrolling flag
    isScrollingInProgress = true;

    // Clear any existing scroll position
    window.scrollTo(0, 0);

    try {
      const videos = await autoScroll();
      sendResponse({
        status: "complete",
        videos: videos,
      });
    } catch (error) {
      console.error("Scroll error:", error);
      isScrollingInProgress = false;
      sendResponse({
        status: "error",
        message: error.message,
      });
    }
    return true; // Will respond asynchronously
  }
  return false;
}

// Add message listener
chrome.runtime.onMessage.addListener(handleMessage);
