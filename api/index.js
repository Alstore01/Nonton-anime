const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,/;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Axios instance dengan timeout
const axiosInstance = axios.create({
  timeout: 10000, // 10 detik timeout
  headers
});

// --- KODE SCRAPER ANDA (Disesuaikan untuk API) ---

async function animeterbaru(page = 1) {
  try {
    console.log(`Fetching anime terbaru page ${page}...`);
    const res = await axiosInstance.get(`https://cors.caliph.my.id/https://v18.kuramanime.ing/anime/page/${page}/`);
    const $ = cheerio.load(res.data);
    const data = [];
    
    // Debug: cek jumlah element yang ditemukan
    const elements = $('.post-show ul li, .series-list li, .animelist li');
    console.log(`Found ${elements.length} elements`);
    
    elements.each((_, e) => {
      const a = $(e).find('a.link-title, a[title], a');
      const title = a.attr('title') || a.text().trim();
      const url = a.attr('href');
      const image = $(e).find('img').attr('src') || $(e).find('img').attr('data-src');
      
      if (title && url) {
        data.push({
          title: title,
          url: url,
          image: image || '',
          episode: $(e).find('.ep-label, .episode-label, .epsnum').text().trim() || 'N/A',
        });
      }
    });
    
    console.log(`Returning ${data.length} anime`);
    return data;
  } catch (error) {
    console.error('Error in animeterbaru:', error.message);
    throw new Error(`Failed to fetch anime: ${error.message}`);
  }
}

async function search(query) {
  try {
    console.log(`Searching for: ${query}`);
    const res = await axiosInstance.get(`https://cors.caliph.my.id/https://v18.kuramanime.ing/?s=${encodeURIComponent(query)}`);
    const $ = cheerio.load(res.data);
    const data = [];
    
    $('.animpost, .post-item, .anime-item').each((_, e) => {
      const a = $(e).find('a[title], a');
      const title = a.attr('title') || $(e).find('.data .title h2, h2, .anime-title').text().trim();
      const url = a.attr('href');
      
      if (title && url) {
        data.push({
          title: title,
          image: $(e).find('img').attr('src') || $(e).find('img').attr('data-src') || '',
          type: $(e).find('.type, .anime-type').text().trim() || 'N/A',
          score: $(e).find('.score, .rating').text().trim() || 'N/A',
          url: url
        });
      }
    });
    
    console.log(`Found ${data.length} results`);
    return data;
  } catch (error) {
    console.error('Error in search:', error.message);
    throw new Error(`Search failed: ${error.message}`);
  }
}

async function detail(link) {
  try {
    console.log(`Getting detail for: ${link}`);
    // Pastikan link memiliki prefix proxy jika belum ada
    const targetUrl = link.startsWith('http') ? link : `https://v18.kuramanime.ing${link}`;
    const res = await axiosInstance.get(`https://cors.caliph.my.id/${targetUrl}`);
    const $ = cheerio.load(res.data);

    const episodes = [];
    $('.lstepsiode ul li, .episodes-list li, .ep-item').each((_, e) => {
      const a = $(e).find('a');
      const title = a.text().trim();
      const url = a.attr('href');
      
      if (title && url) {
        episodes.push({
          title: title,
          url: url,
          date: $(e).find('.date, .ep-date').text().trim() || 'N/A'
        });
      }
    });

    const info = {};
    $('.anim-senct .right-senc .spe span, .anime-info span').each((_, e) => {
      const t = $(e).text();
      if (t.includes(':')) {
        const [k, v] = t.split(':');
        info[k.trim().toLowerCase().replace(/\s+/g, '_')] = v.trim();
      }
    });

    const detail_data = {
      title: $('title').text().replace(' - Kuramanime', '').replace(' - ', '').trim(),
      image: $('meta[property="og:image"]').attr('content') || '',
      description: $('.entry-content').text().trim() || $('meta[name="description"]').attr('content') || '',
      episodes: episodes,
      info: info
    };
    
    console.log(`Detail retrieved: ${detail_data.title}`);
    return detail_data;
  } catch (error) {
    console.error('Error in detail:', error.message);
    throw new Error(`Failed to get detail: ${error.message}`);
  }
}

async function download(link) {
  try {
    console.log(`Getting download links for: ${link}`);
    const targetUrl = link.startsWith('http') ? link : `https://v18.kuramanime.ing${link}`;
    const res = await axiosInstance.get(`https://cors.caliph.my.id/${targetUrl}`);
    const cookies = res.headers['set-cookie']?.map(v => v.split(';')[0]).join('; ') || '';
    const $ = cheerio.load(res.data);
    const data = [];

    for (const li of $('div#server > ul > li, .server-list li').toArray()) {
      const div = $(li).find('div');
      const post = div.attr('data-post');
      const nume = div.attr('data-nume');
      const type = div.attr('data-type');
      const name = $(li).find('span').text().trim();
      
      if (!post) continue;

      const body = new URLSearchParams({ action: 'player_ajax', post, nume, type }).toString();
      
      try {
          const r = await axiosInstance.post('https://cors.caliph.my.id/https://v18.kuramanime.ing/wp-admin/admin-ajax.php', body, {
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
          console.log("Error fetching server:", name, e.message);
      }
    }

    console.log(`Found ${data.length} streams`);
    return {
      title: $('h1[itemprop="name"]').text().trim(),
      streams: data
    };
  } catch (error) {
    console.error('Error in download:', error.message);
    throw new Error(`Failed to get download links: ${error.message}`);
  }
}

// --- ROUTES API ---

app.get('/api/latest', async (req, res) => {
  try {
    const data = await animeterbaru(req.query.page || 1);
    res.json(data);
  } catch (e) { 
    console.error('API Error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const data = await search(req.query.q);
    res.json(data);
  } catch (e) { 
    console.error('API Error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

app.get('/api/detail', async (req, res) => {
  try {
    const data = await detail(req.query.url);
    res.json(data);
  } catch (e) { 
    console.error('API Error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

app.get('/api/watch', async (req, res) => {
  try {
    const data = await download(req.query.url);
    res.json(data);
  } catch (e) { 
    console.error('API Error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

const serverless = require('serverless-http');

if (process.env.VERCEL) {
  module.exports = serverless(app);
} else {
  // Untuk Local Development
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  module.exports = app;
}
