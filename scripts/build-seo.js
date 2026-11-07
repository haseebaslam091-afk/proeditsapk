const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://proeditsapk.com';

// Keep the generated sitemap aligned with the public Worker article routes.
// Source Markdown filenames may contain dates; public SEO slugs never do.
function generateSitemap() {
    console.log('Generating ProEditsAPK sitemap...');
    const postsDir = path.join(__dirname, '../_posts');
    const urls = [
        `  <url><loc>${SITE_URL}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
    ];

    if (fs.existsSync(postsDir)) {
        for (const file of fs.readdirSync(postsDir).sort()) {
            if (!/\.md$/i.test(file)) continue;
            const slug = file
                .replace(/\.md$/i, '')
                .replace(/^\d{4}-\d{2}-\d{2}-/, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 90);
            if (!slug) continue;
            const fullPath = path.join(postsDir, file);
            const lastmod = fs.statSync(fullPath).mtime.toISOString().slice(0, 10);
            urls.push(`  <url><loc>${SITE_URL}/articles/${encodeURIComponent(slug)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
        }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    fs.writeFileSync(path.join(__dirname, '../sitemap.xml'), xml);
    console.log(`Sitemap generated with ${urls.length} URLs.`);
}

function generateRobotsTxt() {
    const robots = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /private/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
    fs.writeFileSync(path.join(__dirname, '../robots.txt'), robots);
    console.log('robots.txt generated.');
}

generateSitemap();
generateRobotsTxt();
