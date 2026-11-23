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

function readExistingData(filePath) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { data: [], mode: undefined };
    }
    throw error;
  }

  const data = JSON.parse(contents);
  if (!Array.isArray(data)) {
    throw new Error('Expected scraped data to be a JSON array');
  }
  return { data, mode: fs.statSync(filePath).mode & 0o777 };
}

function extractTitle($) {
  function headingText(node) {
    if (node.name === 'script' || node.name === 'style') return '';
    if (node.name === 'br') return ' ';
    if (node.type === 'text') return node.data;
    return (node.children || []).map(headingText).join('');
  }

  return $('h1, h2, h3').toArray()
    .map(element => headingText(element).replace(/[ \t\r\n\f]+/g, ' ').trim())
    .find(Boolean);
}

function extractContent($) {
  const lines = [];
  let currentLine = '';
  const blockElements = new Set([
    'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl',
    'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
    'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p',
    'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th',
    'thead', 'tr', 'ul',
  ]);

  function flush() {
    const line = currentLine.replace(/[ \t\r\n\f]+/g, ' ').trim();
    if (line) {
      lines.push(line);
    }
    currentLine = '';
  }

  function visit(node) {
    if (node.name === 'script' || node.name === 'style') return;
    const isBlock = blockElements.has(node.name);
    if (isBlock || node.name === 'br') flush();
    if (node.type === 'text') currentLine += node.data;
    if (node.children) node.children.forEach(visit);
    if (isBlock) flush();
  }

  $('p, li').each((index, element) => {
    for (let parent = element.parent; parent; parent = parent.parent) {
      if (parent.name === 'p' || parent.name === 'li') return;
    }
    visit(element);
  });

  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ message: 'Only GET requests are allowed' });
    return;
  }

  try {
    const articles = [];
    const failedUrls = [];

    // Define the output path
    const filePath = path.join(process.cwd(), 'data', 'scrapedData.json');

    // Read the existing JSON data from the file if it exists
    let existingData;
    try {
      existingData = readExistingData(filePath).data;
    } catch (error) {
      console.error('Error reading existing JSON data:', error);
      res.status(500).json({ message: 'Error reading existing scraped data', error: error.message });
      return;
    }

    // Loop through each URL
    for (const TARGET_URL of TARGET_URLS) {
      // Skip URLs that have already been scraped
      if (existingData.some(article => article?.url === TARGET_URL)) {
        continue;
      }

      try {
        // Fetch the HTML of the target page
        const { data } = await axios.get(TARGET_URL, { timeout: 10000 });
        const $ = load(data);

        const title = extractTitle($);
        const content = extractContent($);

        if (title && content.trim()) {
          articles.push({ title, content: content.trim(), url: TARGET_URL });
        } else {
          failedUrls.push(TARGET_URL);
        }
      } catch (error) {
        console.error(`Error fetching URL (${TARGET_URL}):`, error.message);
        failedUrls.push(TARGET_URL);
        continue;
      }
    }

    let currentData;
    let currentMode;
    try {
      ({ data: currentData, mode: currentMode } = readExistingData(filePath));
    } catch (error) {
      console.error('Error reading existing JSON data:', error);
      res.status(500).json({ message: 'Error reading existing scraped data', error: error.message });
      return;
    }

    const savedArticles = articles.filter(article => !currentData.some(existing => existing?.url === article.url));
    if (savedArticles.length > 0) {
      const updatedData = [...currentData, ...savedArticles];
      const jsonContent = JSON.stringify(updatedData, null, 2);

      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tempDir = fs.mkdtempSync(path.join(path.dirname(filePath), '.scrapedData-'));
        try {
          const tempFile = path.join(tempDir, 'scrapedData.json');
          fs.writeFileSync(tempFile, jsonContent, 'utf8');
          if (currentMode !== undefined) {
            fs.chmodSync(tempFile, currentMode);
          }
          fs.renameSync(tempFile, filePath);
        } finally {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (cleanupError) {
            console.error('Error removing temporary scraped data:', cleanupError);
          }
        }
      } catch (error) {
        console.error('Error writing JSON data to file:', error);
        res.status(500).json({ message: 'Error saving scraped data', error: error.message });
        return;
      }
    }

    if (failedUrls.length > 0) {
      res.status(502).json({ message: 'Scraping incomplete', data: savedArticles, failedUrls });
      return;
    }

    // Send the JSON data as response
    res.status(200).json({ message: 'Scraping successful', data: savedArticles });
  } catch (error) {
    console.error('Error scraping website:', error);
    res.status(500).json({ message: 'Error scraping website', error: error.message });
  }
}
