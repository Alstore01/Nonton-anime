const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

// Cache untuk mengurangi request yang sama
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 menit

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,/;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://v18.kuramanime.ing/'
};

// Axios instance dengan timeout
const axiosInstance = axios.create({
  timeout: 12000,
  headers
});

function getCached(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Cache HIT for: ${key}`);
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// --- KODE SCRAPER ANDA (Disesuaikan untuk API) ---

async function animeterbaru(page = 1) {
  try {
    console.log(`Fetching anime terbaru page ${page}...`);
    const cacheKey = `latest_${page}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const res = await axiosInstance.get(`https://v18.kuramanime.ing/anime/page/${page}/`);
    const $ = cheerio.load(res.data);
    const data = [];
    
    const elements = $('div.post-item, div.anime-item, div.series-item, li.post-show');
    console.log(`Found ${elements.length} elements`);
    
    elements.each((_, e) => {
      try {
        const a = $(e).find('a').first();
        const title = a.attr('title') || a.text().trim();
        const url = a.attr('href');
        const img = $(e).find('img');
        const image = img.attr('src') || img.attr('data-src');
        
        if (title && url && image) {
          data.push({
            title: title,
            url: url,
            image: image,
            episode: $(e).find('.ep-last, .ep-label, .epsnum').text().trim() || 'N/A',
          });
        }
      } catch (itemError) {
        // Skip problematic items
      }
    });
    
    console.log(`Returning ${data.length} anime`);
    setCached(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error in animeterbaru:', error.message);
    return [];
  }
}

async function search(query) {
  try {
    if (!query || query.trim().length === 0) return [];
    
    console.log(`Searching for: ${query}`);
    const cacheKey = `search_${query.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const res = await axiosInstance.get(`https://v18.kuramanime.ing/?s=${encodeURIComponent(query)}`);
    const $ = cheerio.load(res.data);
    const data = [];
    
    const elements = $('.animpost, div.post-item, div.anime-item, li.anime-search');
    console.log(`Found ${elements.length} search results for "${query}"`);
    
    elements.each((_, e) => {
      try {
        const a = $(e).find('a').first();
        const title = a.attr('title') || $(e).find('.data .title h2, h2, .anime-title').text().trim() || a.text().trim();
        const url = a.attr('href');
        const img = $(e).find('img');
        const image = img.attr('src') || img.attr('data-src');
        
        if (title && url && image) {
          data.push({
            title: title,
            image: image,
            type: $(e).find('.type, .anime-type').text().trim() || 'Anime',
            score: $(e).find('.score, .rating').text().trim() || 'N/A',
            url: url
          });
        }
      } catch (itemError) {
        // Skip problematic items
      }
    });
    
    console.log(`Found ${data.length} results`);
    setCached(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error in search:', error.message);
    return [];
  }
}

async function detail(link) {
  try {
    console.log(`Getting detail for: ${link}`);
    const cacheKey = `detail_${link}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const targetUrl = link.startsWith('http') ? link : `https://v18.kuramanime.ing${link}`;
    const res = await axiosInstance.get(targetUrl);
    const $ = cheerio.load(res.data);

    const episodes = [];
    const episodeElements = $('.lstepsiode ul li, .episodes-list li, .ep-item, ol li');
    console.log(`Found ${episodeElements.length} episodes`);
    
    episodeElements.each((_, e) => {
      try {
        const a = $(e).find('a').first();
        const title = a.text().trim();
        const url = a.attr('href');
        
        if (title && url) {
          episodes.push({
            title: title,
            url: url,
            date: $(e).find('.date, .ep-date').text().trim() || 'N/A'
          });
        }
      } catch (epError) {
        // Skip problematic episodes
      }
    });

    const info = {};
    $('.anim-senct .right-senc .spe span, .anime-info span, .anime-detail span').each((_, e) => {
      try {
        const t = $(e).text();
        if (t.includes(':')) {
          const [k, v] = t.split(':');
          if (k && v) {
            info[k.trim().toLowerCase().replace(/\s+/g, '_')] = v.trim();
          }
        }
      } catch (infoError) {
        // Skip problematic info
      }
    });

    const detail_data = {
      title: $('title').text().replace(' - Kuramanime', '').replace(' - ', '').trim() || 'N/A',
      image: $('meta[property="og:image"]').attr('content') || '',
      description: $('.entry-content').text().trim() || $('meta[name="description"]').attr('content') || '',
      episodes: episodes,
      info: info
    };
    
    console.log(`Detail retrieved: ${detail_data.title} (${episodes.length} episodes)`);
    setCached(cacheKey, detail_data);
    return detail_data;
  } catch (error) {
    console.error('Error in detail:', error.message);
    return {
      title: 'Error Loading',
      image: '',
      description: 'Gagal memuat detail anime.',
      episodes: [],
      info: {}
    };
  }
}

async function download(link) {
  try {
    console.log(`Getting download links for: ${link}`);
    const targetUrl = link.startsWith('http') ? link : `https://v18.kuramanime.ing${link}`;
    const res = await axiosInstance.get(targetUrl);
    const cookies = res.headers['set-cookie']?.map(v => v.split(';')[0]).join('; ') || '';
    const $ = cheerio.load(res.data);
    const data = [];

    const serverElements = $('div#server > ul > li, .server-list li, .servers li');
    console.log(`Found ${serverElements.length} servers`);

    for (const li of serverElements.toArray()) {
      try {
        const div = $(li).find('div');
        const post = div.attr('data-post');
        const nume = div.attr('data-nume');
        const type = div.attr('data-type');
        const name = $(li).find('span').text().trim();
        
        if (!post) continue;

        const body = new URLSearchParams({ action: 'player_ajax', post, nume, type }).toString();
        
        try {
            const r = await axiosInstance.post('https://v18.kuramanime.ing/wp-admin/admin-ajax.php', body, {
            headers: {
                ...headers,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookies,
                'Referer': targetUrl
            }
            });
            const $$ = cheerio.load(r.data);
            const iframe = $$('iframe').attr('src');
            if (iframe) data.push({ server: name, url: iframe });
        } catch (e) {
            console.log("Error fetching server:", name);
        }
      } catch (serverError) {
        // Skip problematic servers
      }
    }

    console.log(`Found ${data.length} streams`);
    return {
      title: $('h1[itemprop="name"]').text().trim() || 'Unknown Episode',
      streams: data
    };
  } catch (error) {
    console.error('Error in download:', error.message);
    return {
      title: 'Error',
      streams: []
    };
  }
}

// --- ROUTES API ---

app.get('/api/latest', async (req, res) => {
  try {
    const data = await animeterbaru(req.query.page || 1);
    res.json(data.slice(0, 20)); // Limit to 20 items
  } catch (e) { 
    console.error('API Error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

app.get('/api/search', async (req, res) => {
  try {
    if (!req.query.q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const data = await search(req.query.q);
    res.json(data.slice(0, 30)); // Limit to 30 items
  } catch (e) { 
    console.error('API Error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

app.get('/api/detail', async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({ error: 'Query parameter "url" is required' });
    }
    const data = await detail(req.query.url);
    res.json(data);
  } catch (e) { 
    console.error('API Error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

app.get('/api/watch', async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({ error: 'Query parameter "url" is required' });
    }
    const data = await download(req.query.url);
    res.json(data);
  } catch (e) { 
    console.error('API Error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), cacheSize: cache.size });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Nonton Anime API (Kuramanime v18)',
    version: '2.0',
    features: ['Caching (5min TTL)', 'Limited results', 'Error handling'],
    endpoints: {
      health: '/health',
      latest: '/api/latest?page=1',
      search: '/api/search?q=naruto',
      detail: '/api/detail?url=/anime/naruto-shippuden/',
      watch: '/api/watch?url=/episode/naruto-shippuden-episode-1/'
    }
  });
});

const serverless = require('serverless-http');

if (process.env.VERCEL) {
  module.exports = serverless(app);
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  module.exports = app;
}
