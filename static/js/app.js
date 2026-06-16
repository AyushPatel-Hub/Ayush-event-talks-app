// Global State
let updatesData = [];
let selectedUpdate = null;
let currentFilter = 'all';
let searchQuery = '';
let currentTemplate = 'default';

// SVG Progress Ring setup
const progressRingCircle = document.getElementById('char-progress');
const radius = progressRingCircle.r.baseVal.value;
const circumference = 2 * Math.PI * radius;

// Initialize Progress Ring
progressRingCircle.style.strokeDasharray = `${circumference} ${circumference}`;
progressRingCircle.style.strokeDashoffset = circumference;

// Elements
const refreshBtn = document.getElementById('refresh-btn');
const refreshIcon = document.getElementById('refresh-icon');
const lastUpdatedText = document.getElementById('last-updated-text');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const filterPills = document.getElementById('filter-pills');
const updatesList = document.getElementById('updates-list');
const feedLoading = document.getElementById('feed-loading');
const feedError = document.getElementById('feed-error');
const feedEmpty = document.getElementById('feed-empty');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');

// Detail Panel Elements
const detailEmptyState = document.getElementById('detail-empty-state');
const detailCard = document.getElementById('detail-card');
const detailDate = document.getElementById('detail-date');
const detailType = document.getElementById('detail-type');
const detailLink = document.getElementById('detail-link');
const detailContentHtml = document.getElementById('detail-content-html');

// Composer Elements
const tweetTextarea = document.getElementById('tweet-textarea');
const charCount = document.getElementById('char-count');
const charWarningMsg = document.getElementById('char-warning-msg');
const tweetBtn = document.getElementById('tweet-btn');
const resetTweetBtn = document.getElementById('reset-tweet-btn');
const templatePills = document.querySelectorAll('.template-pill');

// Toast Element
const toast = document.getElementById('toast');
const toastIcon = document.getElementById('toast-icon');
const toastMessage = document.getElementById('toast-message');

/* ==========================================================================
   Data Fetching & Cache Management
   ========================================================================== */

async function fetchUpdates(forceRefresh = false) {
    showLoading();
    refreshBtn.classList.add('refreshing');
    
    try {
        const url = forceRefresh ? '/api/updates?refresh=true' : '/api/updates';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data.success) {
            updatesData = data.updates;
            lastUpdatedText.textContent = `Last updated: ${data.last_fetched}`;
            
            if (data.warning) {
                showToast(data.warning, true);
            } else if (forceRefresh) {
                showToast("Updates refreshed successfully!");
            }
            
            renderFeed();
            
            // If we already had an update selected, try to reselect it in the new data
            if (selectedUpdate) {
                const found = updatesData.find(u => u.id === selectedUpdate.id);
                if (found) {
                    selectCard(found);
                } else {
                    deselectCard();
                }
            }
        } else {
            throw new Error(data.error || "Failed to fetch updates.");
        }
    } catch (error) {
        console.error("Fetch error:", error);
        showError(error.message || "Failed to connect to the server.");
        showToast("Error retrieving updates", true);
    } finally {
        refreshBtn.classList.remove('refreshing');
    }
}

/* ==========================================================================
   UI State Functions
   ========================================================================== */

function showLoading() {
    feedLoading.style.display = 'flex';
    feedError.style.display = 'none';
    feedEmpty.style.display = 'none';
    updatesList.style.display = 'none';
}

function showError(msg) {
    errorMessage.textContent = msg;
    feedLoading.style.display = 'none';
    feedError.style.display = 'flex';
    feedEmpty.style.display = 'none';
    updatesList.style.display = 'none';
}

function showEmpty() {
    feedLoading.style.display = 'none';
    feedError.style.display = 'none';
    feedEmpty.style.display = 'flex';
    updatesList.style.display = 'none';
}

function showFeed() {
    feedLoading.style.display = 'none';
    feedError.style.display = 'none';
    feedEmpty.style.display = 'none';
    updatesList.style.display = 'flex';
}

function showToast(message, isError = false) {
    toastMessage.textContent = message;
    if (isError) {
        toastIcon.className = "fa-solid fa-circle-exclamation toast-icon error";
    } else {
        toastIcon.className = "fa-solid fa-circle-check toast-icon";
    }
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

/* ==========================================================================
   Feed Rendering & Filtering
   ========================================================================== */

function renderFeed() {
    // Filter updates
    const filteredUpdates = updatesData.filter(item => {
        // Filter by type
        const typeMatch = currentFilter === 'all' || item.type.toLowerCase() === currentFilter;
        
        // Filter by search query
        const textToSearch = `${item.date} ${item.type} ${item.description_text}`.toLowerCase();
        const searchMatch = searchQuery === '' || textToSearch.includes(searchQuery.toLowerCase());
        
        return typeMatch && searchMatch;
    });

    if (filteredUpdates.length === 0) {
        showEmpty();
        return;
    }

    updatesList.innerHTML = '';
    
    filteredUpdates.forEach(item => {
        const card = document.createElement('div');
        card.className = `update-card ${selectedUpdate && selectedUpdate.id === item.id ? 'selected' : ''}`;
        card.dataset.id = item.id;
        
        // Get badge color class
        const typeClass = `type-${item.type.toLowerCase()}`;
        
        card.innerHTML = `
            <div class="card-header">
                <span class="card-date">${item.date}</span>
                <span class="pill-badge ${typeClass}">${item.type}</span>
            </div>
            <div class="card-body">
                ${item.description_html}
            </div>
            <div class="card-footer">
                <span class="share-hint"><i class="fa-brands fa-x-twitter"></i> Tweet this</span>
                <span class="read-more">View details <i class="fa-solid fa-chevron-right"></i></span>
            </div>
        `;
        
        card.addEventListener('click', () => selectCard(item));
        updatesList.appendChild(card);
    });

    showFeed();
}

/* ==========================================================================
   Card Selection & Details Display
   ========================================================================== */

function selectCard(update) {
    selectedUpdate = update;
    
    // Highlight active card in feed
    document.querySelectorAll('.update-card').forEach(card => {
        if (card.dataset.id === update.id) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });

    // Populate details panel
    detailDate.textContent = update.date;
    detailType.textContent = update.type;
    detailType.className = `pill-badge type-${update.type.toLowerCase()}`;
    detailLink.href = update.link;
    detailContentHtml.innerHTML = update.description_html;

    // Show card and hide empty state
    detailEmptyState.style.display = 'none';
    detailCard.style.display = 'flex';

    // Populate composer with default template
    updateTweetComposer();
    
    // Scroll detail panel into view on mobile
    if (window.innerWidth <= 1024) {
        detailCard.scrollIntoView({ behavior: 'smooth' });
    }
}

function deselectCard() {
    selectedUpdate = null;
    detailEmptyState.style.display = 'flex';
    detailCard.style.display = 'none';
}

/* ==========================================================================
   Tweet Template Generation & Composer
   ========================================================================== */

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

function generateTweetText(update, template) {
    if (!update) return '';
    
    const dateStr = update.date;
    const typeLabel = update.type.toUpperCase();
    const linkUrl = update.link;
    
    // Base max length for summary depends on tags and template overhead
    let templateOverhead = 0;
    let hashtags = '';
    
    switch (template) {
        case 'hype':
            hashtags = '\n\n#GoogleCloud #BigQuery #DataEngineering 🚀';
            templateOverhead = `🔥 NEW BigQuery update (${dateStr})!\n\n""\n\nDetails: ${linkUrl}${hashtags}`.length;
            break;
        case 'short':
            hashtags = ' #BigQuery';
            templateOverhead = `BigQuery ${update.type} (${dateStr}): "" ${linkUrl}${hashtags}`.length;
            break;
        case 'default':
        default:
            hashtags = '\n\n#BigQuery #GoogleCloud';
            templateOverhead = `Google Cloud BigQuery Update - ${update.type} (${dateStr}):\n\n""\n\nRead more: ${linkUrl}${hashtags}`.length;
            break;
    }
    
    // Twitter max length is 280
    const maxSummaryLen = Math.max(50, 280 - templateOverhead);
    const summary = truncateText(update.description_text, maxSummaryLen);
    
    switch (template) {
        case 'hype':
            return `🔥 NEW BigQuery update (${dateStr})!\n\n"${summary}"\n\nDetails: ${linkUrl}${hashtags}`;
        case 'short':
            return `BigQuery ${update.type} (${dateStr}): "${summary}" ${linkUrl}${hashtags}`;
        case 'default':
        default:
            return `Google Cloud BigQuery Update - ${update.type} (${dateStr}):\n\n"${summary}"\n\nRead more: ${linkUrl}${hashtags}`;
    }
}

function updateTweetComposer() {
    if (!selectedUpdate) return;
    
    const tweetText = generateTweetText(selectedUpdate, currentTemplate);
    tweetTextarea.value = tweetText;
    updateCharCounter();
}

function updateCharCounter() {
    const text = tweetTextarea.value;
    const len = text.length;
    const remaining = 280 - len;
    
    charCount.textContent = remaining;
    
    // Calculate progress percentage
    const percent = Math.min(100, (len / 280) * 100);
    const offset = circumference - (percent / 100) * circumference;
    
    progressRingCircle.style.strokeDashoffset = offset;
    
    // Update color indicator of progress ring
    if (remaining < 0) {
        progressRingCircle.style.stroke = 'var(--color-breaking)';
        charCount.className = "char-count char-danger";
        charWarningMsg.textContent = "Over limit!";
        charWarningMsg.className = "char-warning-msg char-danger";
        tweetBtn.disabled = true;
    } else if (remaining <= 40) {
        progressRingCircle.style.stroke = 'var(--color-issue)';
        charCount.className = "char-count char-warning";
        charWarningMsg.textContent = "Almost full";
        charWarningMsg.className = "char-warning-msg char-warning";
        tweetBtn.disabled = false;
    } else {
        progressRingCircle.style.stroke = 'var(--primary)';
        charCount.className = "char-count";
        charWarningMsg.textContent = "";
        charWarningMsg.className = "char-warning-msg";
        tweetBtn.disabled = len === 0;
    }
}

/* ==========================================================================
   Event Listeners
   ========================================================================== */

// Refresh Button click
refreshBtn.addEventListener('click', () => fetchUpdates(true));

// Retry Button click on error state
retryBtn.addEventListener('click', () => fetchUpdates(true));

// Search Input listeners
searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    if (searchQuery.trim() !== '') {
        clearSearchBtn.style.display = 'block';
    } else {
        clearSearchBtn.style.display = 'none';
    }
    renderFeed();
});

// Clear Search click
clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    renderFeed();
    searchInput.focus();
});

// Category pills filters
filterPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    
    // Highlight active pill
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    
    // Update current filter
    currentFilter = pill.dataset.type;
    renderFeed();
});

// Textarea live typing counter
tweetTextarea.addEventListener('input', updateCharCounter);

// Reset Tweet button
resetTweetBtn.addEventListener('click', () => {
    updateTweetComposer();
    showToast("Template reset");
});

// Template selection pills
templatePills.forEach(pill => {
    pill.addEventListener('click', () => {
        templatePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        
        currentTemplate = pill.dataset.template;
        updateTweetComposer();
    });
});

// Tweet Button click handler (opens Twitter intent link)
tweetBtn.addEventListener('click', () => {
    const text = tweetTextarea.value;
    if (text.length === 0) return;
    if (text.length > 280) {
        showToast("Tweet exceeds the 280 character limit!", true);
        return;
    }
    
    const encodedText = encodeURIComponent(text);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
    
    // Open in a new window/tab
    window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
});

// Window resize handler (handling responsive layout shifts cleanly)
window.addEventListener('resize', () => {
    // If we transition to mobile and had something selected, keep it, but let css layout adjust
});

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    fetchUpdates(false);
});
