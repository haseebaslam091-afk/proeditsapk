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

function b64bytes(bytes){let bin="";for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin)}
async function writeBinaryFile(path,bytes,message,env){const body={message,content:b64bytes(bytes),branch:BRANCH};return gh(path,env,{method:"PUT",body:JSON.stringify(body)})}
async function generateAiArtwork(title,description,slug,env,kind="thumbnail"){
 if(!env.AI||typeof env.AI.run!=="function")return null;
 const safeTitle=String(title||"App").slice(0,140),safeDescription=String(description||"").slice(0,240);
 const isIcon=kind==="icon";
 const prompt=isIcon
 ? "Create an original premium 3D app-icon concept inspired by the function and subject of this app: "+safeTitle+". Context: "+safeDescription+". Design a distinctive simple symbolic object, polished glass and enamel materials, rounded-square app icon composition, centered focal object, dramatic soft studio lighting, midnight navy and electric cyan with tasteful violet highlights, elegant premium mobile app aesthetic. This is original conceptual artwork, NOT the official trademark or logo. No letters, no words, no copied logos, no watermarks, no screenshots."
 : "Create a premium editorial blog thumbnail, landscape 16:9, about: "+safeTitle+". Context: "+safeDescription+". Choose the best visual metaphor for this exact subject. Create a cinematic 3D environment with a clear central focal area reserved for the real official app icon, which will be layered separately on the webpage. Add topic-matched fire, ice, lightning, neon energy or glass effects around the outer edges only. Midnight navy, electric blue, cyan and violet highlights, rich depth, dramatic studio lighting. Do not draw any app logo, icon, letters, words, watermark or interface screenshot.";
 const result=await env.AI.run("@cf/black-forest-labs/flux-1-schnell",{prompt,steps:4});
 let bytes;
 if(result instanceof Uint8Array)bytes=result;
 else if(result instanceof ArrayBuffer)bytes=new Uint8Array(result);
 else if(result instanceof ReadableStream)bytes=new Uint8Array(await new Response(result).arrayBuffer());
 else if(result&&result.image instanceof Uint8Array)bytes=result.image;
 else if(result&&result.image instanceof ArrayBuffer)bytes=new Uint8Array(result.image);
 else if(result&&typeof result.image==="string"){const raw=atob(result.image);bytes=Uint8Array.from(raw,c=>c.charCodeAt(0))}
 else throw new Error("AI image model returned an unsupported image format.");
 if(!bytes.length||bytes.length>8*1024*1024)throw new Error("Generated artwork has an invalid file size.");
 const assetPath="assets/generated-thumbnails/"+slug+(isIcon?"-icon":"")+".png";
 await writeBinaryFile(assetPath,bytes,"Generate original AI "+kind+": "+safeTitle,env);
 return "/"+assetPath;
}
async function generateArticleThumbnail(title,description,slug,env){return generateAiArtwork(title,description,slug,env,"thumbnail")}
async function resolveOfficialAppIcon(title,env){
 const query=String(title||"").replace(/\b(latest version|download|free for android|apk)\b/gi," ").trim().slice(0,120);
 if(!query)return null;
 // Prefer a real App Store listing with an exact or very close app-name match.
 try{
  const r=await fetch("https://itunes.apple.com/search?term="+encodeURIComponent(query)+"&entity=software&limit=8",{headers:{"accept":"application/json"}});
  if(r.ok){
   const data=await r.json();const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"");
   const wanted=norm(query);
   const matches=(data.results||[]).map(x=>({x,n: norm(x.trackName)})).filter(v=>v.n&&(v.n===wanted||v.n.includes(wanted)||wanted.includes(v.n)));
   if(matches.length){const url=String(matches[0].x.artworkUrl512||matches[0].x.artworkUrl100||"");if(/^https:\/\//.test(url))return url}
  }
 }catch(e){}
 // Google Play fallback: only accept an image found close to the exact app title in its listing markup.
 try{
  const r=await fetch("https://play.google.com/store/search?q="+encodeURIComponent(query)+"&c=apps&hl=en&gl=US",{headers:{"accept":"text/html","user-agent":"Mozilla/5.0"}});
  if(r.ok){
   const html=await r.text(),needle=query.toLowerCase(),at=html.toLowerCase().indexOf(needle);
   if(at>=0){const part=html.slice(Math.max(0,at-5000),Math.min(html.length,at+5000));const urls=part.split("https://play-lh.googleusercontent.com/").slice(1).map(v=>"https://play-lh.googleusercontent.com/"+v.split(/[\s"<>]/)[0]);if(urls.length){const u=urls.sort((a,b)=>b.length-a.length)[0];if(/^https:\/\//.test(u))return u}}
  }
 }catch(e){}
 return null;
}
async function generateAppArtwork(title,description,slug,env){return generateAiArtwork(title,description,slug,env,"icon")}
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
      const {list,sha}=await getPosts(env);let generated=0,changed=false;const missing=[];const limit=3;
      for(const post of list){
        if(generated>=limit)break;
        if(post.generatedThumbnailUrl&&(post.officialIconUrl||post.iconUrl))continue;
        try{
          if(!post.generatedThumbnailUrl){const url=await generateArticleThumbnail(post.title,post.description||"",post.slug||safeSlug(post.title),env);if(url){post.generatedThumbnailUrl=url;changed=true}}
          if(!post.officialIconUrl&&!post.iconUrl){const icon=await resolveOfficialAppIcon(post.title,env);if(icon){post.officialIconUrl=icon;post.iconUrl=icon;changed=true}}\n          if(post.generatedThumbnailUrl&&(post.officialIconUrl||post.iconUrl))generated++;
        }catch(e){missing.push(post.title+": "+(e.message||"AI generation failed"))}
      }
      if(changed)await writeFile("posts.json",JSON.stringify(list,null,2)+"\n","Save original AI app artwork and article thumbnails",env,sha);
      const remaining=list.filter(p=>!p.generatedThumbnailUrl||!(p.officialIconUrl||p.iconUrl)).length;
      return json({ok:true,generated,total:list.length,remaining,missing,message:generated?"Generated original AI thumbnails and app-art concepts for "+generated+" articles. Run again for the next batch.":(!env.AI?"Enable the Cloudflare Workers AI binding to generate artwork.":"No new artwork was generated; existing articles remain available.")});
    }
    if(url.pathname==="/admin/api/publish"&&request.method==="POST") {
      const data=await request.json();
      const title=String(data.title||"").trim();
      const content=String(data.content||"").trim();
      const description=String(data.description||"").trim();
      const suppliedIcon=String(data.officialIconUrl||"").trim();let officialIconUrl=null;if(suppliedIcon){try{const u=new URL(suppliedIcon);if(u.protocol==="https:"&&!u.username&&!u.password)officialIconUrl=u.toString()}catch(e){return json({error:"Official app icon must be a valid HTTPS image URL."},400)}}if(!officialIconUrl)officialIconUrl=await resolveOfficialAppIcon(title,env);const suppliedThumbnail=String(data.thumbnailUrl||"").trim();let thumbnailUrl=null;if(suppliedThumbnail){try{const u=new URL(suppliedThumbnail);if(u.protocol==="https:"&&!u.username&&!u.password)thumbnailUrl=u.toString()}catch(e){return json({error:"Thumbnail URL must be a valid HTTPS image URL."},400)}}
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
      let generatedThumbnailUrl=null;if(env.AI){try{generatedThumbnailUrl=await generateArticleThumbnail(title,description,slug,env)}catch(e){/* Publishing remains available if AI image generation is temporarily unavailable. */}}
      const next=[{title,path,slug,iconUrl:officialIconUrl,officialIconUrl,thumbnailUrl:thumbnailUrl||null,generatedThumbnailUrl,rawUrl:"https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/"+BRANCH+"/"+path,date,description,published:true},...list];
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
   if(url.pathname==="/api/article"&&request.method==="GET"){
     const path=String(url.searchParams.get("path")||"");
     if(!/^_posts\/[a-zA-Z0-9._-]+\.md$/.test(path))return json({error:"Invalid article path."},400);
     try{const list=await getPublicPosts(env,request);const post=list.find(p=>p.path===path);if(!post||post.published===false)return json({error:"Article not found."},404);const raw="https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/"+BRANCH+"/"+path.split("/").map(encodeURIComponent).join("/");const res=await fetch(raw,{headers:{"accept":"text/plain"}});if(!res.ok)return json({error:"Article content is temporarily unavailable."},502);return json({content:await res.text(),title:post.title,description:post.description||"",iconUrl:post.iconUrl||post.officialIconUrl||null,officialIconUrl:post.officialIconUrl||post.iconUrl||null,thumbnailUrl:post.thumbnailUrl||null,generatedThumbnailUrl:post.generatedThumbnailUrl||null,generatedIconUrl:post.generatedIconUrl||null,date:post.date||""})}catch(e){return json({error:e.message||"Article lookup failed."},503)}
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