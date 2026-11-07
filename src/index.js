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
  const method=String(options.method||"GET").toUpperCase();
  const url="https://api.github.com/repos/"+OWNER+"/"+REPO+"/contents/"+path;
  const headers={
    "accept":"application/vnd.github+json",
    "x-github-api-version":"2022-11-28",
    "content-type":"application/json",
    ...(options.headers||{})
  };
  if(env.GITHUB_TOKEN)headers.authorization="Bearer "+env.GITHUB_TOKEN;
  let res=await fetch(url,{...options,headers});
  let readFallbackTried=false;
  // This repository is public: allow unauthenticated reads if the configured PAT is rejected.
  // Writes still require a valid token with Contents: Read and write.
  if(method==="GET"&&(res.status===401||res.status===403)){
    readFallbackTried=true;
    const publicHeaders={...headers};
    delete publicHeaders.authorization;
    res=await fetch(url,{...options,headers:publicHeaders});
  }
  const body=await res.json().catch(()=>({}));
  if(!res.ok) {
    const detail=String(body.message||res.statusText||"Unknown GitHub API error");
    const requestId=res.headers.get("x-github-request-id");
    const rate=res.headers.get("x-ratelimit-remaining");
    const accepted=res.headers.get("x-accepted-github-permissions");
    const sso=res.headers.get("x-github-sso");
    const scopes=res.headers.get("x-oauth-scopes");
    const tokenState=env.GITHUB_TOKEN?"GITHUB_TOKEN configured":"GITHUB_TOKEN MISSING";
    const diagnostics=[tokenState,accepted?"accepted permissions: "+accepted:null,sso?"SSO: "+sso:null,scopes?"token scopes: "+scopes:null,rate!==null?"rate limit remaining: "+rate:null,requestId?"request ID: "+requestId:null].filter(Boolean).join("; ");
    const permissionHint=method!=="GET"&&res.status===403?" Check GitHub token/repository write access.":"";
    throw new Error("GitHub API "+res.status+" during "+method+" /contents/"+path+": "+detail+permissionHint+(diagnostics?" ["+diagnostics+"]":""));
  }
  return body;
}
async function readFile(path, env) {
  // Read public repository files from raw.githubusercontent.com instead of the
  // GitHub Contents API, which can return 403 on shared Cloudflare egress IPs.
  const url="https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/"+BRANCH+"/"+path.split("/").map(encodeURIComponent).join("/");
  const response=await fetch(url,{headers:{"accept":"text/plain","cache-control":"no-cache"}});
  if(!response.ok)throw new Error("GitHub raw read "+response.status+" for "+path+": "+(response.statusText||"Request failed"));
  const text=await response.text();
  // Contents API PUT requires the Git blob SHA. Recompute it from the raw file.
  const bytes=new TextEncoder().encode(text);
  // Git computes blob IDs as SHA-1("blob "+byteLength+NUL+content).
  const header=new TextEncoder().encode("blob "+bytes.length+"\0");
  const payload=new Uint8Array(header.length+bytes.length);
  payload.set(header,0);payload.set(bytes,header.length);
  const digest=await crypto.subtle.digest("SHA-1",payload);
  const sha=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  return {text,sha};
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
   // Keep the official Google Play artwork URL in posts.json instead of uploading
   // binary image files through the GitHub Contents API. This avoids a separate
   // binary PUT request and lets the browser load Google's official app icon.
   const screenshots=[];const shotRe=/https:\/\/play-lh\.googleusercontent\.com\/[^"\s<>]+/g;let sm;while((sm=shotRe.exec(html))&&screenshots.length<12){const candidate=sm[0].replace(/\\u003d/g,"=").replace(/&amp;/g,"&");const dims=candidate.match(/[=]w(\d+)-h(\d+)/);if(!dims)continue;const width=Number(dims[1]),height=Number(dims[2]);if(width>=300&&height>=150&&width/height>=1.25&&!screenshots.includes(candidate))screenshots.push(candidate)}return {iconUrl:imageUrl,packageName:id,storeTitle,screenshots};
  }
 }catch(e){
  // Do not hide repository permission/authentication failures behind a missing-icon result.
  if(String(e&&e.message||e).startsWith("GitHub API ")) throw e;
 }
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
async function githubDiagnostic(env) {
  const headers={"accept":"application/vnd.github+json","x-github-api-version":"2022-11-28"};
  if(env.GITHUB_TOKEN)headers.authorization="Bearer "+env.GITHUB_TOKEN;
  async function check(url){
    const r=await fetch(url,{headers});
    const body=await r.json().catch(()=>({}));
    return {status:r.status,ok:r.ok,message:r.ok?undefined:String(body.message||r.statusText||"Request failed"),
      acceptedPermissions:r.headers.get("x-accepted-github-permissions"),tokenScopes:r.headers.get("x-oauth-scopes"),
      sso:r.headers.get("x-github-sso"),rateLimitRemaining:r.headers.get("x-ratelimit-remaining"),body};
  }
  const [user,repo]=await Promise.all([check("https://api.github.com/user"),check("https://api.github.com/repos/"+OWNER+"/"+REPO)]);
  return {tokenConfigured:!!env.GITHUB_TOKEN,
    identity:{status:user.status,ok:user.ok,login:user.body?.login||null,message:user.message,acceptedPermissions:user.acceptedPermissions,tokenScopes:user.tokenScopes,sso:user.sso},
    repository:{status:repo.status,ok:repo.ok,fullName:repo.body?.full_name||null,permissions:repo.body?.permissions||null,message:repo.message,acceptedPermissions:repo.acceptedPermissions,sso:repo.sso},
    rateLimitRemaining:user.rateLimitRemaining||repo.rateLimitRemaining||null};
}
async function api(request, env) {
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type","access-control-max-age":"86400"}});
  if(!request.headers.get("cf-access-jwt-assertion"))return json({error:"Cloudflare Access authentication required."},401);
  const url=new URL(request.url);
  try {
    if(url.pathname==="/admin/api/github-status"&&request.method==="GET") return json(await githubDiagnostic(env));
    if(url.pathname==="/admin/api/posts"&&request.method==="GET") {
      const {list}=await getPosts(env);
      return json({posts:list});
    }
    if(url.pathname==="/admin/api/refresh-icons"&&request.method==="POST") {
      const {list,sha}=await getPosts(env);let found=0,changed=false;const missing=[];
      for(const post of list){const media=await findPlayIcon(post.title,post.appPackage||"","",env);if(!media?.iconUrl){missing.push(post.title);continue}found++;if(post.iconUrl!==media.iconUrl){post.iconUrl=media.iconUrl;changed=true}if(media.packageName&&post.appPackage!==media.packageName){post.appPackage=media.packageName;changed=true}if(!post.thumbnailUrl&&media.screenshots?.length){post.thumbnailUrl=media.screenshots[0];changed=true}}
      if(changed)await writeFile("posts.json",JSON.stringify(list,null,2)+"\n","Save verified app icons and thumbnails",env,sha);
      return json({ok:true,updated:found,total:list.length,missing,message:changed?"Verified Google Play icons and available screenshots have been saved to posts.json.":"No new verified media was found; existing article artwork was preserved."});
    }
    if(url.pathname==="/admin/api/publish"&&request.method==="POST") {
      const data=await request.json();
      const title=String(data.title||"").trim();
      const content=String(data.content||"").trim();
      const description=String(data.description||"").trim();
      const packageName=String(data.packageName||"").trim();const suppliedThumbnail=String(data.thumbnailUrl||"").trim();let thumbnailUrl=null;if(suppliedThumbnail){try{const u=new URL(suppliedThumbnail);if(u.protocol==="https:"&&!u.username&&!u.password)thumbnailUrl=u.toString()}catch(e){return json({error:"Thumbnail URL must be a valid HTTPS image URL."},400)}}
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
      const next=[{title,path,slug,iconUrl:icon?.iconUrl||null,thumbnailUrl:thumbnailUrl||icon?.screenshots?.[0]||null,appPackage:icon?.packageName||null,rawUrl:"https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/"+BRANCH+"/"+path,date,description,published:true},...list];
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
   // Public, read-only icon lookup: fetches official Play Store artwork on demand
   // without writing posts.json or requiring a GitHub token.
   if(url.pathname==="/api/app-media"&&request.method==="GET"){const title=String(url.searchParams.get("title")||"").trim().slice(0,160),packageName=String(url.searchParams.get("package")||"").trim().slice(0,160);if(title.length<2)return json({error:"A valid app title is required."},400);try{const media=await findPlayIcon(title,packageName,"",env);if(!media)return json({iconUrl:null,screenshots:[]},404);return json({iconUrl:media.iconUrl,storeTitle:media.storeTitle,packageName:media.packageName,screenshots:media.screenshots||[]})}catch(e){return json({error:e.message||"App media lookup failed."},502)}}
    if(url.pathname==="/api/app-icon"&&request.method==="GET") {
     const title=String(url.searchParams.get("title")||"").trim().slice(0,160);
     const packageName=String(url.searchParams.get("package")||"").trim().slice(0,160);
     if(title.length<2)return json({error:"A valid app title is required."},400);
     try {
       const icon=await findPlayIcon(title,packageName,"",env);
       if(!icon)return json({iconUrl:null,error:"No matching Google Play listing found."},404);
       return json({iconUrl:icon.iconUrl,storeTitle:icon.storeTitle,packageName:icon.packageName},200);
     } catch(e) { return json({error:e.message||"Icon lookup failed."},502); }
   }
   if(url.pathname.startsWith("/admin/api/"))return api(request,env);
   if(url.pathname==="/admin"||url.pathname==="/admin/") {
     const target=new URL("/admin/index.html",url);
     return env.ASSETS.fetch(new Request(target.toString(),request));
   }
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