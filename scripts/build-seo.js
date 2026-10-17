const fs = require('fs');
const path = require('path');
const https = require('https');

const SITE_URL = 'https://proeditsapk.com';
const INDEXNOW_KEY = 'proeditsapk-seo-indexnow-key';

// 1. Generate Dynamic Sitemap.xml
function generateSitemap() {
    console.log('⚡ Generating Dynamic Sitemap.xml...');
    const postsDir = path.join(__dirname, '../_posts');
    let urls = [
        `  <url>\n    <loc>${SITE_URL}/</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`
    ];

    if (fs.existsSync(postsDir)) {
        const files = fs.readdirSync(postsDir);
        files.forEach(file => {
            if (file.endsWith('.md') || file.endsWith('.html')) {
                const cleanSlug = file.replace(/\.md$/, '').replace(/\.html$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
                urls.push(`  <url>\n    <loc>${SITE_URL}/${cleanSlug}</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
            }
        });
    }

    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
    
    fs.writeFileSync(path.join(__dirname, '../sitemap.xml'), sitemapContent);
    console.log('✅ Sitemap.xml generated successfully!');
}

// 2. Generate Optimized Robots.txt
function generateRobotsTxt() {
    console.log('⚡ Generating Robots.txt...');
    const robotsContent = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /private/\n\nSitemap: ${SITE_URL}/sitemap.xml`;
    fs.writeFileSync(path.join(__dirname, '../robots.txt'), robotsContent);
    console.log('✅ Robots.txt generated successfully!');
}

// 3. Instant IndexNow Ping Engine
function pingIndexNow() {
    console.log('🚀 Triggering IndexNow API for Fast Indexing...');
    
    const data = JSON.stringify({
        host: 'proeditsapk.com',
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: [`${SITE_URL}/`, `${SITE_URL}/sitemap.xml`]
    });

    const options = {
        hostname: 'api.indexnow.org',
        port: 443,
        path: '/indexnow',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = https.request(options, (res) => {
        console.log(`📡 IndexNow Ping Response Status: ${res.statusCode}`);
    });

    req.on('error', (error) => {
        console.error('❌ IndexNow Ping Error:', error.message);
    });

    req.write(data);
    req.end();
}

// Run All Actions
generateSitemap();
generateRobotsTxt();
pingIndexNow();

