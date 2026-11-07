const OWNER = "haseebaslam091-afk";
const REPO = "proeditsapk";
const BRANCH = "main";
const SITE = "https://proeditsapk.com";

function json(data, status=200) {
  return new Response(JSON.stringify(data), {status, headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff"
  }});
}
function safeSlug(s) {
  return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90);
}
function escYaml(s) { return String(s||"").replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\r?\n/g," "); }
function b64utf8(s) { const bytes=new TextEncoder().encode(s); let bin=""; for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(bin); }
async function gh(path, env, options={}) {
  if(!env.GITHUB_TOKEN) throw new Error("GitHub publishing token is not configured.");
  const res=await fetch("https://api.github.com/repos/"+OWNER+"/"+REPO+"/contents/"+path,{
    ...options, headers:{
      "authorization":"Bearer "+env.GITHUB_TOKEN,
      "accept":"application/vnd.github+json",
      "x-github-api-version":"2022-11-28",
      "content-type":"application/json",
      ...(options.headers||{})
    }
  });
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(body.message||("GitHub API error "+res.status));
  return body;
}
async function readFile(path, env) {
  const r=await gh(path+"?ref="+BRANCH,env);
  const binary=atob(r.content.replace(/\n/g,"")); const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)); return {text:new TextDecoder().decode(bytes),sha:r.sha};
}
async function writeFile(path, content, message, env, sha) {
  const body={message,content:b64utf8(content),branch:BRANCH};
  if(sha)body.sha=sha;
  return gh(path,env,{method:"PUT",body:JSON.stringify(body)});
}

function cleanPlayText(v){return String(v||"").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();}
function normPlayTitle(v){return String(v||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g," ").trim();}
function playTitleMatches(expected,actual){const a=normPlayTitle(expected),b=normPlayTitle(actual);if(!a||!b)return false;if(a===b||a.startsWith(b)||b.startsWith(a))return true;const stop=new Set(["the","app","android","latest","version","pro","apk","official","free","video","editor","features","effects","templates","download","for","with","ai","private","vault","photo","hider","cloner"]);const words=a.split(" ").filter(x=>x.length>2&&!stop.has(x));return words.length>0&&words.filter(w=>b.includes(w)).length/words.length>=0.7;}
async function findPlayIcon(title,packageName,slug,env){
 try{
  let ids=[];
  if(packageName&&/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(packageName))ids=[packageName];
  else{
   const sr=await fetch("https://play.google.com/store/search?q="+encodeURIComponent(title)+"&c=apps&hl=en&gl=US",{headers:{"user-agent":"Mozilla/5.0"}});
   if(!sr.ok)return null;
   const html=await sr.text();const re=/(?:\?|&amp;)id=([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)/g;let m;
   while((m=re.exec(html))&&ids.length<8)if(!ids.includes(m[1]))ids.push(m[1]);
  }
  for(const id of ids){
   const page=await fetch("https://play.google.com/store/apps/details?id="+encodeURIComponent(id)+"&hl=en&gl=US",{headers:{"user-agent":"Mozilla/5.0"}});
   if(!page.ok)continue;const html=await page.text();
   const tm=html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
   const im=html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
   const storeTitle=cleanPlayText(tm&&tm[1]);const imageUrl=String(im&&im[1]||"").replace(/&amp;/g,"&");
   if(!playTitleMatches(title,storeTitle)||!imageUrl.startsWith("https://"))continue;
   const ir=await fetch(imageUrl);if(!ir.ok)continue;
   const type=(ir.headers.get("content-type")||"").split(";")[0].toLowerCase();
   const ext=type==="image/png"?"png":type==="image/webp"?"webp":type==="image/jpeg"?"jpg":null;if(!ext)continue;
   const bytes=new Uint8Array(await ir.arrayBuffer());if(bytes.length<1000||bytes.length>1048576)continue;
   let bin="";for(let n=0;n<bytes.length;n+=0x8000)bin+=String.fromCharCode(...bytes.subarray(n,n+0x8000));
   const iconPath="assets/app-icons/"+slug+"."+ext;
   await gh(iconPath,env,{method:"PUT",body:JSON.stringify({message:"Add verified Google Play icon for "+title,content:btoa(bin),branch:BRANCH})});
   return {iconPath,packageName:id,storeTitle};
  }
 }catch(e){}
 return null;
}

async function getPublicPosts(env, request) {
  const u=new URL("/posts.json",request.url);
  const r=await env.ASSETS.fetch(new Request(u.toString()));
  if(!r.ok)throw new Error("Article index unavailable.");
  const list=await r.json();
  if(!Array.isArray(list))throw new Error("Article index is invalid.");
  return list;
}
async function getPosts(env) {
  const f=await readFile("posts.json",env);
  const list=JSON.parse(f.text);
  if(!Array.isArray(list))throw new Error("posts.json is invalid.");
  return {list,sha:f.sha};
}
async function rebuildSitemap(list, env) {
  const urls=[`  <url><loc>${SITE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`];
  for(const p of list) if(p.published!==false) urls.push(`  <url><loc>${SITE}/articles/${encodeURIComponent(p.slug||safeSlug(p.title))}</loc><lastmod>${p.date||new Date().toISOString().slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.join("\n")+'\n</urlset>\n';
  const old=await readFile("sitemap.xml",env).catch(()=>null);
  await writeFile("sitemap.xml",xml,"Update sitemap after publishing",env,old?.sha);
}
async function api(request, env) {
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type","access-control-max-age":"86400"}});
  if(!request.headers.get("cf-access-jwt-assertion"))return json({error:"Cloudflare Access authentication required."},401);
  const url=new URL(request.url);
  try {
    if(url.pathname==="/admin/api/posts"&&request.method==="GET") {
      const {list}=await getPosts(env);
      return json({posts:list});
    }
    if(url.pathname==="/admin/api/refresh-icons"&&request.method==="POST") {
      const {list,sha}=await getPosts(env);
      const next=[];
      for(const post of list) {
        if(post.iconPath) { next.push(post); continue; }
        const slug=post.slug||safeSlug(post.title);
        const icon=await findPlayIcon(post.title,post.appPackage||"",slug,env);
        next.push({...post,iconPath:icon?.iconPath||null,appPackage:icon?.packageName||post.appPackage||null});
      }
      await writeFile("posts.json",JSON.stringify(next,null,2)+"\n","Fetch official app icons for existing articles",env,sha);
      return json({ok:true,updated:next.filter(p=>p.iconPath).length,total:next.length,missing:next.filter(p=>!p.iconPath).map(p=>p.title)});
    }
    if(url.pathname==="/admin/api/publish"&&request.method==="POST") {
      const data=await request.json();
      const title=String(data.title||"").trim();
      const content=String(data.content||"").trim();
      const description=String(data.description||"").trim();
      const packageName=String(data.packageName||"").trim();
      let slug=safeSlug(data.slug||title);
      if(title.length<4||title.length>160||content.length<80||description.length>320||slug.length<3)
        return json({error:"Add a valid title, URL slug, description and at least 80 characters of article content."},400);
      const {list,sha}=await getPosts(env);
      if(list.some(p=>(p.slug||safeSlug(p.title))===slug))return json({error:"That URL slug already exists. Choose a unique slug."},409);
      const date=new Date().toISOString().slice(0,10);
      const filename=date+"-"+slug+".md";
      const path="_posts/"+filename;
      const markdown=`---
title: "${escYaml(title)}"
description: "${escYaml(description)}"
date: ${date}
draft: false
---

${content.replace(/\r/g,"")}
`;
      await writeFile(path,markdown,"Publish article: "+title,env);
      const icon=await findPlayIcon(title,packageName,slug,env);
      const next=[{title,path,slug,iconPath:icon?.iconPath||null,appPackage:icon?.packageName||null,rawUrl:"https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/"+BRANCH+"/"+path,date,description,published:true},...list];
      await writeFile("posts.json",JSON.stringify(next,null,2)+"\n","Add published article: "+title,env,sha);
      await rebuildSitemap(next,env);
      return json({ok:true,article:next[0],url:SITE+"/articles/"+slug});
    }
    return json({error:"API endpoint not found."},404);
  } catch(e) { return json({error:e.message||"Publishing failed."},500); }
}
export default {
 async fetch(request,env) {
   const url=new URL(request.url);
   if(url.pathname.startsWith("/admin/api/"))return api(request,env);
   if(url.pathname.startsWith("/articles/")) {
     const slug=decodeURIComponent(url.pathname.slice("/articles/".length)).replace(/\/$/,"");
     if(!/^[a-z0-9-]{3,90}$/.test(slug))return new Response("Not found",{status:404});
     try {
       const list=await getPublicPosts(env,request);
       const post=list.find(p=>(p.slug||safeSlug(p.title))===slug);
       if(!post)return new Response("Article not found",{status:404});
       const target=new URL("/article.html",url);
       target.searchParams.set("path",post.path);
       const asset=await env.ASSETS.fetch(new Request(target.toString(),request));
       const html=await asset.text();
       const canonical=SITE+"/articles/"+slug;
       let injected=html.replace('<meta name="article-path" content="">', '<meta name="article-path" content="'+post.path+'">');
       injected=injected.replace('href="https://proeditsapk.com/article.html"', 'href="'+canonical+'"');
       injected=injected.replace('<title>Article | ProEditsAPK</title>', '<title>'+String(post.title).replace(/[&<>"]/g,"")+' | ProEditsAPK</title>');
       if(post.description)injected=injected.replace('content="Explore Android apps, video editing tools and AI apps on ProEditsAPK."', 'content="'+String(post.description).replace(/[&<>"]/g,"")+'"');
       const headers=new Headers(asset.headers); headers.delete("content-length"); headers.delete("etag"); headers.set("content-type","text/html; charset=utf-8");
       return new Response(injected,{status:asset.status,headers});
     } catch(e) { return new Response("Article temporarily unavailable",{status:503}); }
   }
   return env.ASSETS.fetch(request);
 }
};