import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

// Initialize the Apify SDK
await Actor.init();

// Fetch Actor inputs
const input = await Actor.getInput() || {};
const {
    keywords = [
        "IT Support",
        "Help desk support",
        "Technical Support",
        "Field service technician"
    ],
    locations = [
        "Greater Toronto Area, Ontario, Canada"
    ],
    maxItems = 40,
    postedWithin = "r86400" // Default: Past 24 Hours
} = input;

console.log(`Starting scraper with parameters:`);
console.log(`- Keywords: ${JSON.stringify(keywords)}`);
console.log(`- Locations: ${JSON.stringify(locations)}`);
console.log(`- Max Items: ${maxItems}`);
console.log(`- Date Posted Filter: ${postedWithin}`);

// Set to track processed job IDs to prevent duplicates
const processedJobIds = new Set();
// Track saved jobs
let savedJobsCount = 0;

// Setup Crawlee CheerioCrawler
const crawler = new CheerioCrawler({
    // Concurrency limit to prevent hitting LinkedIn's rate limits too fast
    maxConcurrency: 5,
    minConcurrency: 1,

    // Add randomized request headers to mimic standard browser requests
    preNavigationHooks: [
        async (crawlingContext, gotOptions) => {
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ];
            const randomAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

            gotOptions.headers = {
                ...gotOptions.headers,
                'User-Agent': randomAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.linkedin.com/jobs/search',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            };

            // Implement a small randomized delay before navigating to reduce blocking
            const delayMs = Math.floor(Math.random() * 2000) + 1000; // 1s to 3s delay
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    ],

    // requestHandler parses pages
    async requestHandler({ $, request, crawler: crawlerInstance }) {
        const { url, userData } = request;
        console.log(`Processing URL: ${url} (Label: ${userData.label || 'unknown'})`);

        if (savedJobsCount >= maxItems) {
            console.log(`Reached limit of ${maxItems} saved jobs. Skipping processing.`);
            return;
        }

        if (userData.label === 'search') {
            // Find job listings inside the search page response
            const $jobs = $('li');
            console.log(`Found ${$jobs.length} job elements on search page.`);

            let foundNewJobs = false;

            $jobs.each((i, element) => {
                if (savedJobsCount >= maxItems) return false; // Break loop if reached limit

                let jobId = '';
                
                // Try data-entity-urn
                const entityUrn = $(element).find('div.base-card, div.job-search-card').attr('data-entity-urn');
                if (entityUrn) {
                    jobId = entityUrn.split(':').pop();
                }
                
                // Try data-id
                if (!jobId) {
                    const dataId = $(element).find('div.base-card, div.job-search-card').attr('data-id');
                    if (dataId) jobId = dataId;
                }
                
                // Try parsing href
                if (!jobId) {
                    const href = $(element).find('a.base-card__full-link').attr('href');
                    if (href) {
                        const match = href.match(/\/view\/.*?(\d+)/) || href.match(/-(\d+)\?/);
                        if (match) jobId = match[1];
                    }
                }

                if (jobId && !processedJobIds.has(jobId)) {
                    processedJobIds.add(jobId);
                    foundNewJobs = true;

                    // Enqueue the detailed job posting view page
                    const detailUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
                    crawlerInstance.addRequests([{
                        url: detailUrl,
                        userData: {
                            label: 'detail',
                            jobId,
                            searchKeyword: userData.keyword
                        }
                    }]);
                }
            });

            // Handle pagination if we found jobs and haven't exceeded the target count
            if (foundNewJobs && $jobs.length >= 10 && savedJobsCount < maxItems) {
                const nextStart = userData.start + 25;
                const nextSearchUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(userData.keyword)}&location=${encodeURIComponent(userData.location)}&f_TPR=${postedWithin}&start=${nextStart}`;
                console.log(`Enqueuing next page of search for "${userData.keyword}" in "${userData.location}" (start: ${nextStart})`);
                await crawlerInstance.addRequests([{
                    url: nextSearchUrl,
                    userData: {
                        label: 'search',
                        keyword: userData.keyword,
                        location: userData.location,
                        start: nextStart
                    }
                }]);
            }

        } else if (userData.label === 'detail') {
            // Extract job posting details
            const title = $('.top-card-layout__title, h2.top-card-layout__title, h1.topcard__title, h1.top-card-layout__title, h1').first().text().trim();
            const company = $('.topcard__org-name-link, .topcard__flavor--metadata a, .topcard__flavor, a[data-tracking-control-name="public_jobs_topcard-org-name"]').first().text().trim();
            const jobLocation = $('.topcard__flavor--bullet, .top-card-layout__first-subline .topcard__flavor').first().text().trim();

            const descriptionHtml = $('.show-more-less-html__markup').html() || '';
            const descriptionText = $('.show-more-less-html__markup').text().trim().replace(/\s+/g, ' ');

            // Extracted date posted text (e.g. "2 hours ago", "1 day ago")
            let postedDate = '';
            const postedElement = $('.posted-time-ago__text, .topcard__flavor--metadata').filter((i, el) => {
                const text = $(el).text().toLowerCase();
                return text.includes('ago') || text.includes('hour') || text.includes('day') || text.includes('minute') || text.includes('week');
            }).first();
            
            if (postedElement.length > 0) {
                postedDate = postedElement.text().trim();
            } else {
                // Fallback check
                postedDate = $('.topcard__flavor--metadata, .topcard__flavor').filter((i, el) => {
                    const text = $(el).text().toLowerCase();
                    return text.includes('ago') || text.includes('hour') || text.includes('day');
                }).first().text().trim();
            }

            // Extracted applicants text (e.g. "23 applicants", "Over 100 applicants")
            let applicantsText = '0 applicants';
            const applicantsElement = $('.num-applicants__caption, .topcard__flavor--metadata').filter((i, el) => {
                const text = $(el).text().toLowerCase();
                return text.includes('applicant') || text.includes('applied');
            }).first();
            
            if (applicantsElement.length > 0) {
                applicantsText = applicantsElement.text().trim();
            }

            let applicantsCount = 0;
            const applicantsNumberMatch = applicantsText.match(/(\d+)/);
            if (applicantsNumberMatch) {
                applicantsCount = parseInt(applicantsNumberMatch[1], 10);
            }

            if (!title) {
                console.log(`Failed to extract job details for ID: ${userData.jobId} (likely blocked or page layout mismatch).`);
                return;
            }

            // Perform secondary relevance filtering to ensure it relates to IT support / Helpdesk / Support technician / field tech
            const titleLower = title.toLowerCase();
            const descriptionLower = descriptionText.toLowerCase();
            
            const matchesRole = [
                'support', 'help desk', 'helpdesk', 'technician', 'help-desk', 
                'desktop', 'field service', 'service desk', 'it systems'
            ].some(kw => titleLower.includes(kw) || (titleLower.includes('it') && descriptionLower.includes('support')));

            if (!matchesRole) {
                console.log(`Skipping job: "${title}" at ${company} - Job title does not seem closely related to IT/Technical Support.`);
                return;
            }

            // Construct result object
            const result = {
                jobId: userData.jobId,
                title,
                company,
                location: jobLocation,
                postedDate: postedDate || 'Recently',
                applicantsRaw: applicantsText,
                applicantsCount,
                searchKeyword: userData.searchKeyword,
                jobUrl: `https://www.linkedin.com/jobs/view/${userData.jobId}`,
                descriptionText: descriptionText.substring(0, 1000) + (descriptionText.length > 1000 ? '...' : ''), // Preview
                fullDescriptionHtml: descriptionHtml
            };

            // Push data to the dataset
            await Actor.pushData(result);
            savedJobsCount++;
            console.log(`[Job ${savedJobsCount}/${maxItems} Saved] "${title}" at ${company}`);

            if (savedJobsCount >= maxItems) {
                console.log(`Saved requested maximum of ${maxItems} jobs. Crawling complete!`);
            }
        }
    },

    // Handle failed requests
    failedRequestHandler({ request }) {
        console.error(`Request ${request.url} failed repeatedly. Skipping.`);
    }
});

// Seed requests queue
const initialRequests = [];
for (const keyword of keywords) {
    for (const loc of locations) {
        const searchUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(loc)}&f_TPR=${postedWithin}&start=0`;
        initialRequests.push({
            url: searchUrl,
            userData: {
                label: 'search',
                keyword,
                location: loc,
                start: 0
            }
        });
    }
}

// Run crawler
console.log('Seeding initial search requests...');
await crawler.run(initialRequests);

// Clean up
await Actor.exit();
