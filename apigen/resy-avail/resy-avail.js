#!/usr/bin/env node

const https = require('https');
const url = require('url');

/**
 * Robust Node.js script to check restaurant availability on Resy.com.
 * Extracts tokens/venue IDs from the profile page and queries the /4/find API.
 */

async function fetchPage(targetUrl) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            }
        };

        https.get(targetUrl, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ body: data, headers: res.headers }));
        }).on('error', reject);
    });
}

async function postJson(urlStr, headers, payload) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(urlStr);
        const postData = JSON.stringify(payload);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function parseResyUrl(resyUrl) {
    const parsed = new URL(resyUrl);
    const pathParts = parsed.pathname.split('/').filter(p => p);
    
    // Format: /cities/san-francisco-ca/liholiho-yacht-club
    // or /cities/san-francisco-ca/venues/penny-roma
    let location = 'sf'; // Default
    let slug = '';

    if (pathParts[0] === 'cities') {
        location = pathParts[1];
        if (pathParts[2] === 'venues') {
            slug = pathParts[3];
        } else {
            slug = pathParts[2];
        }
    } else if (pathParts[0] === 'venues') {
        slug = pathParts[1];
    } else {
        slug = pathParts[pathParts.length - 1];
    }

    return { location, slug };
}

async function getVenueId(location, slug, apiKey) {
    const venueApiUrl = `https://api.resy.com/3/venue?url_slug=${slug}&location=${location}`;
    const headers = {
        'Authorization': `ResyAPI api_key="${apiKey}"`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    return new Promise((resolve, reject) => {
        https.get(venueApiUrl, { headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    // Standard response structure for /3/venue
                    if (json.venue && json.venue.id) {
                         resolve(json.venue.id.toString());
                    } else if (json.id && typeof json.id !== 'object') {
                         resolve(json.id.toString());
                    } else if (json.id && json.id.resy) {
                         resolve(json.id.resy.toString());
                    } else {
                        reject(new Error(`Venue ID not found in response: ${JSON.stringify(json).substring(0, 200)}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse venue API response: ${data.substring(0, 200)}`));
                }
            });
        }).on('error', reject);
    });
}

async function checkAvailability(restaurantUrlOrId, partySize, date) {
    const apiKey = 'VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5'; // Standard API Key
    let venueId;

    if (/^\d+$/.test(restaurantUrlOrId)) {
        venueId = restaurantUrlOrId;
        console.log(`Using provided Venue ID: ${venueId}`);
    } else {
        const { location, slug } = parseResyUrl(restaurantUrlOrId);
        console.log(`Resolved: Location=${location}, Slug=${slug}`);

        console.log(`Fetching Venue ID for ${slug}...`);
        venueId = await getVenueId(location, slug, apiKey);
        console.log(`Found Venue ID: ${venueId}`);
    }

    // Step 2: Query API
    const apiUrl = 'https://api.resy.com/4/find';
    const headers = {
        'Authorization': `ResyAPI api_key="${apiKey}"`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://resy.com',
        'Referer': restaurantUrlOrId.startsWith('http') ? restaurantUrlOrId : 'https://resy.com/',
        'X-Origin': 'https://resy.com'
    };

    const payload = {
        lat: 0,
        long: 0,
        day: date,
        party_size: parseInt(partySize),
        venue_id: parseInt(venueId)
    };

    console.log(`Checking availability for Date: ${date}, Party Size: ${partySize}...`);
    const result = await postJson(apiUrl, headers, payload);
    return result;
}

// CLI Execution
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.log('Usage: node resy-avail.js <restaurant_url> <party_size> <date>');
        console.log('Example: node resy-avail.js https://resy.com/cities/san-francisco-ca/liholiho-yacht-club 2 2026-02-10');
        process.exit(1);
    }

    const [restaurantUrl, partySize, date] = args;

    checkAvailability(restaurantUrl, partySize, date)
        .then(result => {
            const slots = result.results?.venues?.[0]?.slots || [];
            console.log(`\nFound ${slots.length} available slots:`);
            slots.forEach(slot => {
                console.log(`- ${slot.date.start} (${slot.config.type})`);
            });
            
            if (slots.length === 0 && result.results?.venues?.length === 0) {
                 // Try alternative path in response structure if applicable
                 const altSlots = result.results?.slots || [];
                 if (altSlots.length > 0) {
                     console.log(`\nFound ${altSlots.length} available slots:`);
                     altSlots.forEach(slot => {
                         console.log(`- ${slot.date.start} (${slot.config.type})`);
                     });
                 } else {
                     console.log("No slots found.");
                 }
            }
        })
        .catch(err => {
            console.error('Error checking availability:', err.message);
            process.exit(1);
        });
}

module.exports = { checkAvailability };
