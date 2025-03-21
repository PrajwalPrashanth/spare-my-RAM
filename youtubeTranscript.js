// Function to extract video ID from YouTube URL
function extractVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

// Function to fetch YouTube transcript
async function fetchTranscript(videoId) {
    try {
        const { YoutubeTranscript } = await import('youtube-transcript');
        
        const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
        
        // Combine all text elements into a single transcript
        const fullTranscript = transcriptArray
            .map(item => item.text)
            .join(' ');
        
        console.log(fullTranscript);
        return fullTranscript.trim();
    } catch (error) {
        console.error('Error fetching transcript:', error);
        throw error;
    }
}

export { extractVideoId, fetchTranscript };