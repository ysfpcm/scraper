import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { load } from 'cheerio';

// Set the URLs to scrape
const TARGET_URLS = [
  'https://help.exatouch.com/knowledge-base/process-bottle-returns/',
  'https://help.exatouch.com/knowledge-base/define-custom-variables/',
  'https://help.exatouch.com/knowledge-base/advantages-of-setting-up-multiple-skus-for-an-item/',
  'https://help.exatouch.com/knowledge-base/generate-sku-numbers-locally/',
  'https://help.exatouch.com/knowledge-base/find-an-item/',
  'https://help.exatouch.com/knowledge-base/duplicate-an-item/',
  'https://help.exatouch.com/knowledge-base/set-low-level-quantity-for-an-item/',
  'https://help.exatouch.com/knowledge-base/modify-inventory-levels/',
  'https://help.exatouch.com/knowledge-base/new-feature-dynamic-reordering-8-324/',
  'https://help.exatouch.com/knowledge-base/custom-buttons/',
  'https://help.exatouch.com/knowledge-base/custom-buttons-add-a-discount-to-the-register/',
  'https://help.exatouch.com/knowledge-base/difference-between-custom-buttons-and-custom-variables/',
  'https://help.exatouch.com/knowledge-base/create-categories-and-subcategories/',
  'https://help.exatouch.com/knowledge-base/difference-between-required-and-optional-modifiers/',
  'https://help.exatouch.com/knowledge-base/ebt-payments/',
  'https://help.exatouch.com/knowledge-base/set-tax-rate-for-an-individual-item/',
  'https://help.exatouch.com/knowledge-base/set-tax-rate-for-an-individual-service/',
  'https://help.exatouch.com/knowledge-base/set-general-tax-rates/',
  'https://help.exatouch.com/knowledge-base/set-pre-post-tax-rates/',
  'https://help.exatouch.com/knowledge-base/set-per-unit-tax-rates/',
  'https://help.exatouch.com/knowledge-base/add-cost-to-a-modifier/',
  'https://help.exatouch.com/knowledge-base/enable-duplicate-required-modifiers/',
  'https://help.exatouch.com/knowledge-base/create-a-modifier/',
  'https://help.exatouch.com/knowledge-base/add-modifier-to-a-group/',
  'https://help.exatouch.com/knowledge-base/label-a-modifier-group/',
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Only GET requests are allowed' });
    return;
  }

  try {
    const articles = [];

    // Define the output path
    const filePath = path.join(process.cwd(), 'data', 'scrapedData.json');

    // Read the existing JSON data from the file if it exists
    let existingData = [];
    if (fs.existsSync(filePath)) {
      try {
        const fileData = fs.readFileSync(filePath, 'utf8');
        if (fileData && fileData.trim().length > 0) {
          existingData = JSON.parse(fileData);
        }
      } catch (error) {
        console.error('Error parsing existing JSON data:', error);
        existingData = [];
      }
    }

    // Loop through each URL
    for (const TARGET_URL of TARGET_URLS) {
      // Skip URLs that have already been scraped
      if (existingData.some(article => article.url === TARGET_URL)) {
        continue;
      }

      try {
        // Fetch the HTML of the target page
        const { data } = await axios.get(TARGET_URL, { timeout: 10000 });
        const $ = load(data);

        // Extract desired data, including dropdown content
        const title = $('h1, h2, h3').first().text().trim();
        let content = '';

        // Extract all paragraph content, including content from dropdowns
        $('p, li').each((i, elem) => {
          content += $(elem).text().trim() + '\n';
        });

        if (title && content.trim()) {
          articles.push({ title, content: content.trim(), url: TARGET_URL });
        }
      } catch (error) {
        console.error(`Error fetching URL (${TARGET_URL}):`, error.message);
        continue;
      }
    }

    // Append the new articles to the existing data
    const updatedData = [...existingData, ...articles];

    // Convert the updated data into JSON
    const jsonContent = JSON.stringify(updatedData, null, 2);

    // Write the JSON data to a file
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, jsonContent, 'utf8');
    } catch (error) {
      console.error('Error writing JSON data to file:', error);
      res.status(500).json({ message: 'Error saving scraped data', error: error.message });
      return;
    }

    // Send the JSON data as response
    res.status(200).json({ message: 'Scraping successful', data: articles });
  } catch (error) {
    console.error('Error scraping website:', error);
    res.status(500).json({ message: 'Error scraping website', error: error.message });
  }
}
