 Read the *.har files in current directory and extract the relevant tokens and cookies used for the subsequent requests.
 Create a minimal Node.js script to check restaurant availability on this website. The script should be robust and self-contained, handling dynamic authentication tokens automatically.

Requirements:

Two-Step Process:

Step 1 (Auth): Fetch a restaurant profile page to establish a session. Parse the HTML response to extract the relevant tokens and cookies used for the subsequent requests.
Step 2 (Query): identify the correct API endpoint and payload to use for the availability check. Use the extracted tokens and cookies to make a POST request to the API endpoint.

Headers: Ensure the request includes a realistic User-Agent, Content-Type: application/json. Sometimes the cookies are optional and if so we shouldn't include it in the final script. We should minimize the script so that it works, but nothing more than neccesary for it to work.

The script should produce a reuseful function that user can use to query other restaurants, parties, and time availability instead of hardcoding the restaurant id, party size, and time.

Output: The script should print the number of available slots found for the requested restaurant, numbers of the party date and time. This script should be tested to produce the right results.

Input: The script should accept three arguments:
1. The restaurant URL (standard or venues path) or use ID directly
2. The party size
3. The party date

Support both URL formats:
Standard: https://resy.com/cities/san-francisco-ca/liholiho-yacht-club
Venues path: https://resy.com/cities/san-francisco-ca/venues/penny-roma

Example:
node resy-avail.js https://resy.com/cities/san-francisco-ca/liholiho-yacht-club 2 2026-02-10
node resy-avail.js 547 2 2026-02-12
