const https = require('https'); 

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Checks OpenTable availability for a given restaurant, date, time, and party size.
 * @param {string} restaurantId - The restaurant ID (e.g., 6262)
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} time - Time in HH:mm format
 * @param {number} partySize - Number of people
 */
async function checkRestaurantAvailability(restaurantId, date, time, partySize) {
    // Step 1: Fetch Profile Page to get CSRF Token and Cookies
    const profileUrl = `https://www.opentable.com/restaurant/profile/${restaurantId}`;
    
    let cookies = '';
    let csrfToken = '';

    try {
        const profileResponse = await fetch(profileUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        if (!profileResponse.ok) {
            throw new Error(`Failed to fetch profile page: ${profileResponse.status} ${profileResponse.statusText}`);
        }

        // Extract Cookies
        const setCookieHeader = profileResponse.headers.getSetCookie();
        if (setCookieHeader && setCookieHeader.length > 0) {
            cookies = setCookieHeader.map(c => c.split(';')[0]).join('; ');
        }

        // Extract CSRF Token from HTML
        const html = await profileResponse.text();
        const csrfMatch = html.match(/"__CSRF_TOKEN__"\s*:\s*"([^"]+)"/);
        if (csrfMatch && csrfMatch[1]) {
            csrfToken = csrfMatch[1];
        } else {
             const metaMatch = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
             if (metaMatch) {
                 csrfToken = metaMatch[1];
             } else {
                 console.warn('Warning: Could not find CSRF token. Request might fail.');
             }
        }

        // Step 2: Query Availability API
        const apiUrl = 'https://www.opentable.com/dapi/fe/gql?optype=query&opname=RestaurantsAvailability';
        
        const payload = {
            operationName: 'RestaurantsAvailability',
            variables: {
                onlyPop: false,
                forwardDays: 0,
                // requireTimes: false,
                // requireTypes: ['Standard', 'Experience'],
                restaurantIds: [parseInt(restaurantId)],
                date: date,
                time: time,
                partySize: parseInt(partySize),
                databaseRegion: 'NA',
                restaurantAvailabilityTokens: [],
                loyaltyRedemptionTiers: [],
            },
            extensions: {
                persistedQuery: {
                    version: 1,
                    sha256Hash: 'b2d05a06151b3cb21d9dfce4f021303eeba288fac347068b29c1cb66badc46af'
                }
            }
        };

        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json',
                'x-csrf-token': csrfToken,
                'Cookie': cookies,
                'Origin': 'https://www.opentable.com',
                'Referer': profileUrl
            },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            throw new Error(`API Request failed: ${apiResponse.status} ${apiResponse.statusText}\nBody: ${errText}`);
        }

        const data = await apiResponse.json();

        if (data.errors) {
            console.error('GraphQL Errors:', JSON.stringify(data.errors, null, 2));
            return;
        }

        const availData = data.data?.availability;
        if (!availData) {
             console.log('No availability data found.');
             return;
        }
        
        const restaurantAvail = availData[0];
        const availabilityDays = restaurantAvail.availabilityDays || [];
        let totalSlots = 0;

        console.log(`Availability for Restaurant ${restaurantId} on ${date} @ ${time} (${partySize} ppl):`);
        
        // Parse query base time (HH:mm) into minutes
        const [baseHours, baseMinutes] = time.split(':').map(Number);
        const baseTotalMinutes = baseHours * 60 + baseMinutes;

        availabilityDays.forEach(day => {
            const slots = day.slots || [];
            const availableSlots = slots.filter(s => s.isAvailable);
            
            if (availableSlots.length > 0) {
                availableSlots.forEach(slot => {
                    const offset = slot.timeOffsetMinutes || 0;
                    let finalMinutes = baseTotalMinutes + offset;
                    
                    if (finalMinutes < 0) finalMinutes += 1440;
                    if (finalMinutes >= 1440) finalMinutes -= 1440;
                    
                    const h = Math.floor(finalMinutes / 60);
                    const m = finalMinutes % 60;
                    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                    
                    const points = slot.pointsValue !== undefined ? slot.pointsValue : (slot.points !== undefined ? slot.points : 'N/A');
                    
                    console.log(`- ${timeStr} (Points: ${points})`);
                    totalSlots++;
                });
            }
        });

        console.log(`Total Slots Found: ${totalSlots}`);
        return totalSlots;

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run the script
const args = process.argv.slice(2);
const rid = args[0] || '6262'; 
const date = args[1] || '2026-02-11';
const time = args[2] || '19:00';
const partySize = args[3] || 2;

checkRestaurantAvailability(rid, date, time, partySize);
