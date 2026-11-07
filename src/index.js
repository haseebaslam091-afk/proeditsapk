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
function articleSlug(s) { return safeSlug(s).replace(/^\d{4}-\d{2}-\d{2}-/,"").slice(0,90); }
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


async function deleteFile(path, message, env, sha) {
  return gh(path,env,{method:"DELETE",body:JSON.stringify({message,sha,branch:BRANCH})});
}

function b64bytes(bytes){let bin="";for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin)}
async function writeBinaryFile(path,bytes,message,env){const body={message,content:b64bytes(bytes),branch:BRANCH};return gh(path,env,{method:"PUT",body:JSON.stringify(body)})}
async function generateAiArtwork(title,description,slug,env){
 if(!env.AI||typeof env.AI.run!=="function")return null;
 const safeTitle=String(title||"App").slice(0,140),safeDescription=String(description||"").slice(0,240);
 const subject=(safeTitle+" "+safeDescription).toLowerCase();
 let effect="electric cyan and blue lightning arcs, energetic light trails and subtle glowing particles";
 if(/ice|snow|cold|frost|winter/.test(subject))effect="crystalline ice shards, frozen mist, frosted glass and cool blue refractions";
 else if(/fire|flame|burn|heat|hot/.test(subject))effect="controlled cinematic flames, glowing embers and warm orange-red energy";
 else if(/music|audio|song|sound|beat/.test(subject))effect="neon sound waves, luminous equalizer ribbons and pulsing violet-blue energy";
 else if(/photo|camera|image|design|art|edit|video/.test(subject))effect="iridescent glass ribbons, luminous lens flares and elegant holographic light trails";
 else if(/ai|artificial|chat|assistant|bot/.test(subject))effect="holographic neural light paths, floating data particles and violet-cyan energy";
 const prompt="Create a premium editorial blog thumbnail, landscape 16:9, about: "+safeTitle+". Context: "+safeDescription+". Build a cinematic 3D environment with "+effect+". Leave a clear central focal zone because the genuine official app icon will be placed over the center separately by the website. Put dramatic effects around the icon zone and outer edges. Never create or imitate any logo, app icon, trademark, letters, words, watermark or user interface. Premium midnight navy atmosphere, rich depth, dramatic studio lighting, polished editorial quality.";
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
 const assetPath="assets/generated-thumbnails/"+slug+".png";
 await writeBinaryFile(assetPath,bytes,"Generate themed AI background: "+safeTitle,env);
 return "/"+assetPath;
}
async function generateArticleThumbnail(title,description,slug,env){return generateAiArtwork(title,description,slug,env)}
async function resolveOfficialAppIcon(title,env){
 const raw=String(title||"").trim();
 // Exact, verified Android package IDs prevent a similarly named app's logo being used.
 const known=[
  [/\bcapcut\b/i,{name:"CapCut",packageId:"com.lemon.lvoverseas"}],
  [/\bvivacut\b/i,{name:"VivaCut",packageId:"com.videoeditorpro.android"}],
  [/\bpop\s*maker\b|\bpopmaker\b/i,{name:"PopMaker",packageId:"com.cuyikeji.popmaker"}]
 ];
 const matched=known.find(([pattern])=>pattern.test(raw));
 // "App Locker" is intentionally not guessed: many unrelated apps use that name.
 if(/\bapp\s*locker\b|\bapplock\b/i.test(raw)&&!matched)return null;
 const query=matched?matched[1].name:raw.split(/[:|–—-]/)[0].replace(/\b(latest version|download|free for android|apk|android|ios|pro|app|202[4-9]|guide|review|features|private|vault|cloner|photo|hider|video|generator|effects|templates)\b/gi," ").replace(/\s+/g," ").trim().split(/\s+/).slice(0,3).join(" ").slice(0,100);
 if(!query||query.split(/\s+/).length>4)return null;
 if(matched){
  try{
   const url="https://play.google.com/store/apps/details?id="+encodeURIComponent(matched[1].packageId)+"&hl=en&gl=US";
   const r=await fetch(url,{headers:{"accept":"text/html","user-agent":"Mozilla/5.0"}});
   if(r.ok){
    const html=await r.text();
    const titleMatch=html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const iconMatch=html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["'](https:\/\/[^"']+)["']/i)||html.match(/<meta[^>]+content=["'](https:\/\/[^"']+)["'][^>]+property=["']og:image["']/i);
    if(iconMatch&&iconMatch[1]&&(!titleMatch||titleMatch[1].toLowerCase().includes(matched[1].name.toLowerCase()))){
     const icon=iconMatch[1].replace(/&amp;/g,"&");
     if(icon.startsWith("https://"))return icon;
    }
   }
  }catch(e){}
 }
 // Apple lookup is accepted only for an exact app-name match, never a fuzzy prefix.
 try{
  const r=await fetch("https://itunes.apple.com/search?term="+encodeURIComponent(query)+"&entity=software&limit=25",{headers:{"accept":"application/json"}});
  if(r.ok){
   const data=await r.json();
   const wanted=query.toLowerCase().replace(/[^a-z0-9]+/g,"");
   const match=(data.results||[]).find(x=>String(x.trackName||"").toLowerCase().replace(/[^a-z0-9]+/g,"")===wanted);
   const url=String(match?.artworkUrl512||match?.artworkUrl100||"");
   if(url.startsWith("https://"))return url;
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
  for(const p of list) if(p.published!==false) urls.push(`  <url><loc>${SITE}/articles/${encodeURIComponent(articleSlug(p.slug||p.title))}</loc><lastmod>${p.date||new Date().toISOString().slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
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
    if(url.pathname==="/admin/api/update"&&request.method==="POST") {
      const data=await request.json();
      const path=String(data.path||"");
      if(!/^_posts\/[a-zA-Z0-9._-]+\.md$/.test(path))return json({error:"Invalid article path."},400);
      const title=String(data.title||"").trim(),content=String(data.content||"").trim(),description=String(data.description||"").trim();
      const slug=articleSlug(data.slug||title);
      if(title.length<4||title.length>160||content.length<80||description.length>320||slug.length<3)return json({error:"Check title, slug, description and article content (minimum 80 characters)."},400);
      const {list,sha}=await getPosts(env);const index=list.findIndex(p=>p.path===path);
      if(index<0)return json({error:"Article not found."},404);
      if(list.some((p,i)=>i!==index&&articleSlug(p.slug||p.title)===slug))return json({error:"That URL slug is already in use."},409);
      let officialIconUrl=list[index].officialIconUrl||list[index].iconUrl||null;
      const suppliedIcon=String(data.officialIconUrl||"").trim();
      if(suppliedIcon){
        if(/^\/assets\/app-icons\/[a-zA-Z0-9._-]+$/.test(suppliedIcon))officialIconUrl=suppliedIcon;
        else{try{const u=new URL(suppliedIcon);if(u.protocol!=="https:"||u.username||u.password)return json({error:"Official app icon must be a valid HTTPS URL or an uploaded app logo."},400);officialIconUrl=u.toString()}catch(e){return json({error:"Official app icon must be a valid HTTPS URL or an uploaded app logo."},400)}}
      }
      const uploadedIcon=data.uploadedIcon&&typeof data.uploadedIcon==="object"?data.uploadedIcon:null;
      if(uploadedIcon){
        const allowed={"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/avif":"avif"};
        const ext=allowed[String(uploadedIcon.mimeType||"").toLowerCase()];
        const encoded=String(uploadedIcon.data||"").replace(/^data:[^,]*;base64,/i,"");
        if(!ext||!encoded||encoded.length>2100000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return json({error:"Upload a PNG, JPG, WEBP or AVIF app logo smaller than 1.5 MB."},400);
        let bytes;try{const binary=atob(encoded);bytes=Uint8Array.from(binary,c=>c.charCodeAt(0))}catch(e){return json({error:"The uploaded app logo could not be read."},400)}
        if(!bytes.length||bytes.length>1572864)return json({error:"App logo must be smaller than 1.5 MB."},400);
        const iconPath="assets/app-icons/"+slug+"-"+Date.now()+"."+ext;
        await writeBinaryFile(iconPath,bytes,"Update official app logo: "+title,env);
        officialIconUrl="/"+iconPath;
      }
      let thumbnailUrl=null;const suppliedThumbnail=String(data.thumbnailUrl||"").trim();
      if(suppliedThumbnail){try{const u=new URL(suppliedThumbnail);if(u.protocol!=="https:"||u.username||u.password)return json({error:"Thumbnail URL must be a valid HTTPS image URL."},400);thumbnailUrl=u.toString()}catch(e){return json({error:"Thumbnail URL must be a valid HTTPS image URL."},400)}}
      const old=await readFile(path,env);const date=list[index].date||new Date().toISOString().slice(0,10);
      const markdown=`---
title: "${escYaml(title)}"
description: "${escYaml(description)}"
date: ${date}
draft: false
---

${content.replace(/\r/g,"")}
`;
      await writeFile(path,markdown,"Update article: "+title,env,old.sha);
      const post={...list[index],title,slug,description,date,thumbnailUrl,iconUrl:officialIconUrl,officialIconUrl};
      list[index]=post;await writeFile("posts.json",JSON.stringify(list,null,2)+"\n","Update article index: "+title,env,sha);
      await rebuildSitemap(list,env);
      return json({ok:true,article:post,url:SITE+"/articles/"+slug});
    }
    if(url.pathname==="/admin/api/delete"&&request.method==="POST") {
      const data=await request.json();const path=String(data.path||"");
      if(!/^_posts\/[a-zA-Z0-9._-]+\.md$/.test(path))return json({error:"Invalid article path."},400);
      const {list,sha}=await getPosts(env);const index=list.findIndex(p=>p.path===path);
      if(index<0)return json({error:"Article not found."},404);
      const post=list[index];const file=await readFile(path,env);
      await deleteFile(path,"Delete article: "+String(post.title||path),env,file.sha);
      const next=list.filter((_,i)=>i!==index);
      await writeFile("posts.json",JSON.stringify(next,null,2)+"\n","Remove article: "+String(post.title||path),env,sha);
      await rebuildSitemap(next,env);
      return json({ok:true,deleted:path});
    }
    if(url.pathname==="/admin/api/refresh-icons"&&request.method==="POST") {
      const {list,sha}=await getPosts(env);let generated=0,changed=false;const missing=[];const limit=10;
      for(const post of list){
        if(generated>=limit)break;
        if(post.generatedThumbnailUrl&&(post.officialIconUrl||post.iconUrl))continue;
        try{
          if(!post.generatedThumbnailUrl){const url=await generateArticleThumbnail(post.title,post.description||"",post.slug||safeSlug(post.title),env);if(url){post.generatedThumbnailUrl=url;changed=true}}
          if(!post.officialIconUrl&&!post.iconUrl){const icon=await resolveOfficialAppIcon(post.title,env);if(icon){post.officialIconUrl=icon;post.iconUrl=icon;changed=true}}
          if(post.generatedThumbnailUrl||post.officialIconUrl||post.iconUrl)generated++;
        }catch(e){missing.push(post.title+": "+(e.message||"AI generation failed"))}
      }
      if(changed)await writeFile("posts.json",JSON.stringify(list,null,2)+"\n","Save original AI app artwork and article thumbnails",env,sha);
      const remaining=list.filter(p=>!p.generatedThumbnailUrl||!(p.officialIconUrl||p.iconUrl)).length;
      return json({ok:true,generated,total:list.length,remaining,missing,message:generated?"Generated themed AI backgrounds and preserved official app icons for "+generated+" articles. Run again for the next batch.":(!env.AI?"Enable the Cloudflare Workers AI binding to generate artwork.":"No new artwork was generated; existing articles remain available.")});
    }
    if(url.pathname==="/admin/api/publish"&&request.method==="POST") {
      const data=await request.json();
      const title=String(data.title||"").trim();
      const content=String(data.content||"").trim();
      const description=String(data.description||"").trim();
      const suppliedIcon=String(data.officialIconUrl||"").trim();let officialIconUrl=null;if(suppliedIcon){if(/^\/assets\/app-icons\/[a-zA-Z0-9._-]+$/.test(suppliedIcon))officialIconUrl=suppliedIcon;else{try{const u=new URL(suppliedIcon);if(u.protocol!=="https:"||u.username||u.password)return json({error:"Official app icon must be a valid HTTPS URL or an uploaded app logo."},400);officialIconUrl=u.toString()}catch(e){return json({error:"Official app icon must be a valid HTTPS URL or an uploaded app logo."},400)}}}const uploadedIcon=data.uploadedIcon&&typeof data.uploadedIcon==="object"?data.uploadedIcon:null;const suppliedThumbnail=String(data.thumbnailUrl||"").trim();let thumbnailUrl=null;if(suppliedThumbnail){try{const u=new URL(suppliedThumbnail);if(u.protocol==="https:"&&!u.username&&!u.password)thumbnailUrl=u.toString()}catch(e){return json({error:"Thumbnail URL must be a valid HTTPS image URL."},400)}}
      let slug=articleSlug(data.slug||title);
      if(title.length<4||title.length>160||content.length<80||description.length>320||slug.length<3)
        return json({error:"Add a valid title, URL slug, description and at least 80 characters of article content."},400);
      const {list,sha}=await getPosts(env);
      if(list.some(p=>articleSlug(p.slug||p.title)===slug))return json({error:"That URL slug already exists. Choose a unique slug."},409);
      if(uploadedIcon){
        const allowed={"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/avif":"avif"};
        const ext=allowed[String(uploadedIcon.mimeType||"").toLowerCase()];
        const encoded=String(uploadedIcon.data||"").replace(/^data:[^,]*;base64,/i,"");
        if(!ext||!encoded||encoded.length>2100000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return json({error:"Upload a PNG, JPG, WEBP or AVIF app logo smaller than 1.5 MB."},400);
        let bytes;try{const binary=atob(encoded);bytes=Uint8Array.from(binary,c=>c.charCodeAt(0))}catch(e){return json({error:"The uploaded app logo could not be read."},400)}
        if(!bytes.length||bytes.length>1572864)return json({error:"App logo must be smaller than 1.5 MB."},400);
        const iconPath="assets/app-icons/"+slug+"."+ext;
        await writeBinaryFile(iconPath,bytes,"Upload official app logo: "+title,env);
        officialIconUrl="/"+iconPath;
      }else if(!officialIconUrl)officialIconUrl=await resolveOfficialAppIcon(title,env);
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
   // Permanently redirect legacy query-string article URLs to clean, date-free SEO routes.
   if((url.pathname==="/article"||url.pathname==="/article.html")&&request.method==="GET"){
     const legacyPath=String(url.searchParams.get("path")||"");
     if(/^_posts\/[a-zA-Z0-9._-]+\.md$/.test(legacyPath)){
       try{
         const posts=await getPublicPosts(env,request);
         const post=posts.find(p=>p.path===legacyPath&&p.published!==false);
         if(post){const clean=articleSlug(post.slug||post.title);if(clean)return Response.redirect(SITE+"/articles/"+encodeURIComponent(clean),301)}
       }catch(e){}
     }
     return new Response("Article not found",{status:404});
   }
   if(url.pathname==="/api/article"&&request.method==="GET"){
     const path=String(url.searchParams.get("path")||"");
     if(!/^_posts\/[a-zA-Z0-9._-]+\.md$/.test(path))return json({error:"Invalid article path."},400);
     try{const list=await getPublicPosts(env,request);const post=list.find(p=>p.path===path);if(!post||post.published===false)return json({error:"Article not found."},404);const raw="https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/"+BRANCH+"/"+path.split("/").map(encodeURIComponent).join("/");const res=await fetch(raw,{headers:{"accept":"text/plain"}});if(!res.ok)return json({error:"Article content is temporarily unavailable."},502);return json({content:await res.text(),title:post.title,description:post.description||"",iconUrl:post.iconUrl||post.officialIconUrl||null,officialIconUrl:post.officialIconUrl||post.iconUrl||null,thumbnailUrl:post.thumbnailUrl||null,generatedThumbnailUrl:post.generatedThumbnailUrl||null,date:post.date||""})}catch(e){return json({error:e.message||"Article lookup failed."},503)}
   }
   if(url.pathname.startsWith("/admin/api/"))return api(request,env);
   if(url.pathname==="/admin"||url.pathname==="/admin/") {
     const target=new URL("/admin/index.html",url);
     return env.ASSETS.fetch(new Request(target.toString(),request));
   }
   if(url.pathname.startsWith("/articles/")) {
     const requestedSlug=decodeURIComponent(url.pathname.slice("/articles/".length)).replace(/\/$/,"");
     if(!/^[a-z0-9-]{3,90}$/.test(requestedSlug))return new Response("Not found",{status:404});
     const slug=articleSlug(requestedSlug);
     try {
       const list=await getPublicPosts(env,request);
       const post=list.find(p=>articleSlug(p.slug||p.title)===slug);
       if(!post)return new Response("Article not found",{status:404});
       if(requestedSlug!==slug)return Response.redirect(SITE+"/articles/"+encodeURIComponent(slug),301);
       if(!/^_posts\/[a-zA-Z0-9._-]+\.md$/.test(String(post.path||"")))return new Response("Article content path is invalid.",{status:404,headers:{"content-type":"text/plain; charset=utf-8"}});
       const target=new URL("/article.html",url);
       target.searchParams.set("path",post.path);
       const asset=await env.ASSETS.fetch(new Request(target.toString(),{method:"GET",headers:request.headers}));
       if(!asset.ok)return new Response("Article page template could not be loaded. Please try again shortly.",{status:503,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
       const html=await asset.text();
       const canonical=SITE+"/articles/"+slug;
       let injected=html.replace('<meta name="article-path" content="">', '<meta name="article-path" content="'+post.path+'">');
       injected=injected.replace('href="https://proeditsapk.com/article.html"', 'href="'+canonical+'"');
       injected=injected.replace('<title>Article | ProEditsAPK</title>', '<title>'+String(post.title).replace(/[&<>"]/g,"")+' | ProEditsAPK</title>');
       if(post.description)injected=injected.replace('content="Explore Android apps, video editing tools and AI apps on ProEditsAPK."', 'content="'+String(post.description).replace(/[&<>"]/g,"")+'"');
       const headers=new Headers(asset.headers); headers.delete("content-length"); headers.delete("etag"); headers.set("content-type","text/html; charset=utf-8");
       return new Response(injected,{status:asset.status,headers});
     } catch(e) { return new Response("Article temporarily unavailable. Please refresh or return to the homepage.",{status:503,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}}); }
   }
   return env.ASSETS.fetch(request);
 }
};