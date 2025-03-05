# News Article Scraper

A Node.js bot that scrapes text from news articles and saves them as individual text files.

## Features

- Scrape text content from news article URLs
- Save each article as a separate .txt file
- Handles various news site layouts
- Preserves article title and URL in the saved file
- Sanitizes filenames for compatibility
- **Anti-ban measures:**
  - Proxy support (HTTP, HTTPS, SOCKS5, SmartProxy)
  - Rotating proxy list support
  - User-agent rotation
  - Request delays
  - Robots.txt compliance

## Installation

1. Make sure you have Node.js installed (v12 or higher recommended)
2. Clone or download this repository
3. Install dependencies:

```bash
cd news-scraper
npm install
```

4. Configure settings in the `.env` file (see Configuration section below)

## Usage

There are multiple ways to use this scraper:

### Method 1: Provide URLs as command line arguments

```bash
node src/index.js https://example.com/article1 https://example.com/article2
```

### Method 2: Provide a text file containing URLs (one per line)

```bash
node src/index.js urls.txt
```

### Method 3: Interactive mode

```bash
node src/index.js
```

When run without arguments, the program will prompt you to enter URLs one by one. Press Enter on an empty line to start scraping.

## Configuration

The scraper can be configured using the `.env` file. Copy `.env.example` to `.env` and modify the settings:

### Proxy Settings

To use a proxy, set the `PROXY_TYPE` to one of: `http`, `https`, `socks5`, `smartproxy`, `proxy_list` and configure the corresponding proxy settings:

#### Standard Proxy

```
# Proxy type
PROXY_TYPE=http

# HTTP proxy (format: http://username:password@host:port)
HTTP_PROXY=http://user:pass@proxy.example.com:8080
```

#### SmartProxy

```
# Proxy type
PROXY_TYPE=smartproxy

# SmartProxy settings
SMARTPROXY_USER=your_username
SMARTPROXY_PASS=your_password
SMARTPROXY_HOST=gate.smartproxy.com
SMARTPROXY_PORT=7000
```

#### Proxy List

```
# Proxy type
PROXY_TYPE=proxy_list

# Path to a file containing a list of proxies (one per line)
PROXY_LIST_FILE=proxies.txt
```

The `proxies.txt` file should contain one proxy per line in the format:
```
http://user1:pass1@proxy1.example.com:8080
http://user2:pass2@proxy2.example.com:8080
socks5://user3:pass3@proxy3.example.com:1080
```

The scraper will rotate through these proxies for each request, helping to distribute the load and avoid IP bans.

### Anti-Ban Measures

```
# Delay between requests in milliseconds (to avoid rate limiting)
REQUEST_DELAY=2000

# Whether to rotate user agents for each request
USE_RANDOM_USER_AGENT=true

# Whether to respect robots.txt
RESPECT_ROBOTS_TXT=true
```

## Proxy Recommendations

If you're scraping a large number of articles, especially from the same domain, using a proxy is recommended to avoid IP bans. Options include:

1. **Proxy List**: The most flexible option. Create a `proxies.txt` file with your proxy list and set `PROXY_TYPE=proxy_list` in your `.env` file. The scraper will rotate through these proxies automatically.

2. **SmartProxy**: This scraper has built-in support for SmartProxy, which provides rotating residential IPs. Simply set your credentials in the `.env` file and set `PROXY_TYPE=smartproxy`.

3. **Other Rotating Residential Proxies**: Services like Bright Data, Oxylabs, or SmartProxy provide residential IPs that are less likely to be detected as proxies.

4. **Datacenter Proxies**: More affordable but may be detected more easily. Providers include ProxyMesh, IPRoyal, or Webshare.

5. **Free Proxies**: Not recommended for serious scraping as they are often unreliable, slow, and may be already banned.

## Output

Scraped articles are saved to the `articles` directory in the project root. Each file is named based on the article title.

## Troubleshooting

If the scraper fails to extract content from a particular site, it may be due to:

1. The site using JavaScript to load content (this scraper only handles static HTML)
2. The site having an unusual structure
3. The site blocking automated requests

In such cases, you might need to modify the content selectors in the code to match the specific site structure or use a proxy if you're being blocked.
