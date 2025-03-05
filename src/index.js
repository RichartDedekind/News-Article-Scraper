const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const sanitize = require('sanitize-filename');
const readline = require('readline');
const HttpsProxyAgent = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const randomUseragent = require('random-useragent');
const dotenv = require('dotenv');
const url = require('url');

// Load environment variables from .env file
dotenv.config();

// Create output directory if it doesn't exist
const OUTPUT_DIR = path.join(__dirname, '../articles');
fs.ensureDirSync(OUTPUT_DIR);

// Proxy configuration
const PROXY_TYPE = process.env.PROXY_TYPE || 'none';
const HTTP_PROXY = process.env.HTTP_PROXY;
const HTTPS_PROXY = process.env.HTTPS_PROXY;
const SOCKS_PROXY = process.env.SOCKS_PROXY;

// SmartProxy configuration
const SMARTPROXY_USER = process.env.SMARTPROXY_USER;
const SMARTPROXY_PASS = process.env.SMARTPROXY_PASS;
const SMARTPROXY_HOST = process.env.SMARTPROXY_HOST || 'gate.smartproxy.com';
const SMARTPROXY_PORT = process.env.SMARTPROXY_PORT || '7000';

// Proxy list configuration
const PROXY_LIST_FILE = process.env.PROXY_LIST_FILE || 'proxies.txt';
const USE_PROXY_LIST = process.env.USE_PROXY_LIST === 'true';
let proxyList = [];
let currentProxyIndex = 0;

// Load proxy list if enabled
if (PROXY_TYPE === 'proxy_list' || USE_PROXY_LIST) {
  try {
    const proxyListPath = path.resolve(__dirname, '..', PROXY_LIST_FILE);
    if (fs.existsSync(proxyListPath)) {
      const content = fs.readFileSync(proxyListPath, 'utf8');
      proxyList = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && line.includes('://'));
      
      if (proxyList.length > 0) {
        console.log(`Loaded ${proxyList.length} proxies from ${PROXY_LIST_FILE}`);
      } else {
        console.warn(`No valid proxies found in ${PROXY_LIST_FILE}`);
      }
    } else {
      console.warn(`Proxy list file ${PROXY_LIST_FILE} not found`);
    }
  } catch (error) {
    console.error(`Error loading proxy list: ${error.message}`);
  }
}

const REQUEST_DELAY = parseInt(process.env.REQUEST_DELAY || '1000', 10);
const USE_RANDOM_USER_AGENT = process.env.USE_RANDOM_USER_AGENT === 'true';
const RESPECT_ROBOTS_TXT = process.env.RESPECT_ROBOTS_TXT === 'true';

// Cache for robots.txt rules
const robotsCache = {};

// Function to get the next proxy from the list
function getNextProxy() {
  if (proxyList.length === 0) {
    return null;
  }
  
  const proxy = proxyList[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxyList.length;
  return proxy;
}

// Function to get a proxy agent based on configuration
function getProxyAgent(targetUrl) {
  const parsedUrl = new URL(targetUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  
  // If using proxy list, get the next proxy
  if (PROXY_TYPE === 'proxy_list' && proxyList.length > 0) {
    const proxyUrl = getNextProxy();
    console.log(`Using proxy: ${proxyUrl}`);
    
    if (proxyUrl.startsWith('socks')) {
      return new SocksProxyAgent(proxyUrl);
    } else {
      return new HttpsProxyAgent(proxyUrl);
    }
  }
  
  // Otherwise use the configured proxy
  switch (PROXY_TYPE) {
    case 'http':
      return new HttpsProxyAgent(HTTP_PROXY);
    case 'https':
      return new HttpsProxyAgent(HTTPS_PROXY);
    case 'socks5':
      return new SocksProxyAgent(SOCKS_PROXY);
    case 'smartproxy':
      // Format SmartProxy URL
      const smartProxyUrl = `http://${SMARTPROXY_USER}:${SMARTPROXY_PASS}@${SMARTPROXY_HOST}:${SMARTPROXY_PORT}`;
      return new HttpsProxyAgent(smartProxyUrl);
    default:
      return null;
  }
}

// Function to get proxy configuration for axios
function getProxyConfig() {
  // If using proxy list, get the next proxy
  if (PROXY_TYPE === 'proxy_list' && proxyList.length > 0) {
    const proxyUrl = getNextProxy();
    try {
      const parsedUrl = new URL(proxyUrl);
      const auth = parsedUrl.username && parsedUrl.password 
        ? { username: parsedUrl.username, password: parsedUrl.password } 
        : undefined;
      
      return {
        host: parsedUrl.hostname,
        port: parsedUrl.port,
        auth,
        protocol: parsedUrl.protocol.replace(':', '')
      };
    } catch (error) {
      console.error(`Invalid proxy URL: ${proxyUrl}`);
      return null;
    }
  }
  
  if (PROXY_TYPE === 'smartproxy') {
    return {
      host: SMARTPROXY_HOST,
      port: SMARTPROXY_PORT,
      auth: {
        username: SMARTPROXY_USER,
        password: SMARTPROXY_PASS
      },
      protocol: 'http'
    };
  }
  return null;
}

// Function to get a random user agent
function getUserAgent() {
  if (USE_RANDOM_USER_AGENT) {
    return randomUseragent.getRandom();
  }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
}

// Function to check if URL is allowed by robots.txt
async function isUrlAllowed(targetUrl) {
  if (!RESPECT_ROBOTS_TXT) {
    return true;
  }
  
  try {
    const parsedUrl = new URL(targetUrl);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
    const robotsUrl = `${baseUrl}/robots.txt`;
    
    // Check cache first
    if (!robotsCache[baseUrl]) {
      try {
        const response = await axios.get(robotsUrl, {
          timeout: 5000,
          headers: { 'User-Agent': getUserAgent() }
        });
        
        // Simple robots.txt parser
        const robotsTxt = response.data;
        const rules = {};
        
        let currentAgent = '*';
        robotsTxt.split('\n').forEach(line => {
          const trimmedLine = line.trim().toLowerCase();
          
          if (trimmedLine.startsWith('user-agent:')) {
            currentAgent = trimmedLine.split(':')[1].trim();
            if (!rules[currentAgent]) {
              rules[currentAgent] = { allow: [], disallow: [] };
            }
          } else if (trimmedLine.startsWith('disallow:')) {
            const path = trimmedLine.split(':')[1].trim();
            if (path) {
              rules[currentAgent].disallow.push(path);
            }
          } else if (trimmedLine.startsWith('allow:')) {
            const path = trimmedLine.split(':')[1].trim();
            if (path) {
              rules[currentAgent].allow.push(path);
            }
          }
        });
        
        robotsCache[baseUrl] = rules;
      } catch (error) {
        // If we can't fetch robots.txt, assume everything is allowed
        console.log(`Could not fetch robots.txt for ${baseUrl}: ${error.message}`);
        robotsCache[baseUrl] = { '*': { allow: [], disallow: [] } };
      }
    }
    
    const rules = robotsCache[baseUrl];
    const path = parsedUrl.pathname + parsedUrl.search;
    
    // Check if path is disallowed
    const userAgentRules = rules['*'] || { allow: [], disallow: [] };
    
    for (const disallowPath of userAgentRules.disallow) {
      if (path.startsWith(disallowPath)) {
        // Check if there's an allow rule that overrides this
        const isAllowed = userAgentRules.allow.some(allowPath => 
          path.startsWith(allowPath) && allowPath.length > disallowPath.length
        );
        
        if (!isAllowed) {
          return false;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error checking robots.txt for ${targetUrl}:`, error.message);
    return true; // In case of error, assume it's allowed
  }
}

// Function to add delay between requests
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to scrape article text from a URL
async function scrapeArticle(url) {
  try {
    // Check if URL is allowed by robots.txt
    if (RESPECT_ROBOTS_TXT) {
      const allowed = await isUrlAllowed(url);
      if (!allowed) {
        console.log(`URL not allowed by robots.txt: ${url}`);
        return { success: false, url, error: 'URL not allowed by robots.txt' };
      }
    }
    
    console.log(`Scraping: ${url}`);
    
    // Configure axios request
    const config = {
      headers: {
        'User-Agent': getUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/'
      },
      timeout: 30000 // 30 seconds timeout
    };
    
    // Add proxy if configured
    if (PROXY_TYPE === 'proxy_list') {
      if (proxyList.length > 0) {
        console.log(`Using proxy ${currentProxyIndex + 1}/${proxyList.length}`);
        const proxyConfig = getProxyConfig();
        if (proxyConfig) {
          config.proxy = proxyConfig;
        } else {
          const proxyAgent = getProxyAgent(url);
          if (proxyAgent) {
            config.httpsAgent = proxyAgent;
            config.proxy = false; // Disable axios's default proxy handling
          }
        }
      } else {
        console.warn('No proxies available in proxy list, proceeding without proxy');
      }
    } else if (PROXY_TYPE === 'smartproxy') {
      // For SmartProxy, use the proxy config directly
      config.proxy = getProxyConfig();
    } else {
      // For other proxy types, use the proxy agent
      const proxyAgent = getProxyAgent(url);
      if (proxyAgent) {
        config.httpsAgent = proxyAgent;
        config.proxy = false; // Disable axios's default proxy handling
      }
    }
    
    const response = await axios.get(url, config);
    const $ = cheerio.load(response.data);
    
    // Extract title
    const title = $('h1').first().text().trim() || 
                 $('title').text().trim() || 
                 new URL(url).hostname;
    
    // Common selectors for article content
    const contentSelectors = [
      'article', 
      '.article-content', 
      '.article-body',
      '.story-body',
      '.entry-content',
      '.post-content',
      '.content',
      '#content',
      'main'
    ];
    
    let articleText = '';
    let articleElement = null;
    
    // Try different selectors to find article content
    for (const selector of contentSelectors) {
      if ($(selector).length) {
        articleElement = $(selector).first();
        break;
      }
    }
    
    // If we found an article element, extract text
    if (articleElement) {
      // Remove unwanted elements
      articleElement.find('script, style, nav, header, footer, .ad, .advertisement, .social-share, .related-articles').remove();
      
      // Get all paragraphs
      articleElement.find('p').each((i, el) => {
        const text = $(el).text().trim();
        if (text) {
          articleText += text + '\n\n';
        }
      });
    } else {
      // Fallback: get all paragraphs from the body
      $('body p').each((i, el) => {
        const text = $(el).text().trim();
        if (text) {
          articleText += text + '\n\n';
        }
      });
    }
    
    // If we still don't have text, try to get all text from the body
    if (!articleText.trim()) {
      articleText = $('body').text().replace(/\\s+/g, ' ').trim();
    }
    
    // Create filename from title
    const sanitizedTitle = sanitize(title) || new Date().toISOString();
    const filename = `${sanitizedTitle}.txt`;
    const filePath = path.join(OUTPUT_DIR, filename);
    
    // Add URL and title to the beginning of the file
    const fileContent = `URL: ${url}\nTitle: ${title}\n\n${articleText}`;
    
    // Write to file
    await fs.writeFile(filePath, fileContent);
    console.log(`Saved: ${filename}`);
    
    return { success: true, filename };
  } catch (error) {
    console.error(`Error scraping ${url}:`, error.message);
    return { success: false, url, error: error.message };
  }
}

// Function to process a list of URLs
async function processUrls(urls) {
  const results = {
    successful: [],
    failed: []
  };
  
  for (const url of urls) {
    const result = await scrapeArticle(url);
    if (result.success) {
      results.successful.push(result.filename);
    } else {
      results.failed.push({ url, error: result.error });
    }
    
    // Add delay between requests to avoid rate limiting
    if (REQUEST_DELAY > 0) {
      console.log(`Waiting ${REQUEST_DELAY}ms before next request...`);
      await delay(REQUEST_DELAY);
    }
  }
  
  return results;
}

// Function to read URLs from a file
async function readUrlsFromFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.startsWith('http'));
  } catch (error) {
    console.error('Error reading URL file:', error.message);
    return [];
  }
}

// Function to get URLs from command line arguments or prompt user
async function getUrls() {
  // Check if URLs were provided as command line arguments
  const urlArgs = process.argv.slice(2);
  
  if (urlArgs.length > 0) {
    // If the first argument is a file path, try to read URLs from the file
    if (urlArgs[0].endsWith('.txt') && await fs.pathExists(urlArgs[0])) {
      return await readUrlsFromFile(urlArgs[0]);
    }
    // Otherwise, treat arguments as URLs
    return urlArgs.filter(arg => arg.startsWith('http'));
  }
  
  // If no URLs provided, prompt the user
  console.log('No URLs provided. Please enter URLs (one per line, enter an empty line to finish):');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const urls = [];
  
  return new Promise((resolve) => {
    rl.on('line', (line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        rl.close();
        return;
      }
      
      if (trimmedLine.startsWith('http')) {
        urls.push(trimmedLine);
      } else {
        console.log('Invalid URL, must start with http:// or https://');
      }
    });
    
    rl.on('close', () => {
      resolve(urls);
    });
  });
}

// Main function
async function main() {
  try {
    console.log('News Article Scraper');
    console.log('===================');
    
    // Log proxy configuration
    if (PROXY_TYPE === 'proxy_list') {
      console.log(`Using proxy list from ${PROXY_LIST_FILE} (${proxyList.length} proxies)`);
    } else if (PROXY_TYPE === 'smartproxy') {
      console.log(`Using SmartProxy: ${SMARTPROXY_HOST}:${SMARTPROXY_PORT}`);
    } else if (PROXY_TYPE !== 'none') {
      console.log(`Using ${PROXY_TYPE} proxy`);
    } else {
      console.log('Not using a proxy');
    }
    
    console.log(`Request delay: ${REQUEST_DELAY}ms`);
    console.log(`Random user agent: ${USE_RANDOM_USER_AGENT ? 'Enabled' : 'Disabled'}`);
    console.log(`Respect robots.txt: ${RESPECT_ROBOTS_TXT ? 'Enabled' : 'Disabled'}`);
    console.log('===================\n');
    
    const urls = await getUrls();
    
    if (urls.length === 0) {
      console.log('No valid URLs provided. Exiting.');
      return;
    }
    
    console.log(`\nFound ${urls.length} URLs to process.`);
    console.log(`Articles will be saved to: ${OUTPUT_DIR}\n`);
    
    const results = await processUrls(urls);
    
    console.log('\nScraping completed!');
    console.log(`Successfully scraped ${results.successful.length} articles.`);
    
    if (results.failed.length > 0) {
      console.log(`Failed to scrape ${results.failed.length} articles:`);
      results.failed.forEach(fail => {
        console.log(`- ${fail.url}: ${fail.error}`);
      });
    }
  } catch (error) {
    console.error('An unexpected error occurred:', error);
  }
}

// Run the main function
main();
