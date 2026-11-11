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
async function getPublicPosts(env, request) {
  if(env.DB)return d1List(env,false);
  const u=new URL("/posts.json",request.url);
  const r=await env.ASSETS.fetch(new Request(u.toString()));
  if(!r.ok)throw new Error("Article index unavailable.");
  const list=await r.json();
  if(!Array.isArray(list))throw new Error("Article index is invalid.");
  return list;
}
let d1SchemaReady=false;
let d1SchemaPromise=null;
async function ensureD1Schema(env){
  if(d1SchemaReady)return;
  if(!d1SchemaPromise)d1SchemaPromise=(async()=>{
    // Bootstrap base tables and indexes in one D1 batch. Previously a cold Worker
    // performed a table lookup, six separate PRAGMA calls, and two table creates.
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        published INTEGER NOT NULL DEFAULT 1,
        app_name TEXT,
        icon_blob BLOB,
        icon_mime TEXT,
        official_icon_url TEXT,
        thumbnail_url TEXT,
        generated_thumbnail_url TEXT,
        raw_url TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_published_date ON posts(published, date DESC)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        alt_text TEXT NOT NULL DEFAULT '',
        data BLOB NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS post_media (
        slug TEXT PRIMARY KEY,
        icon_blob BLOB NOT NULL,
        icon_mime TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (slug) REFERENCES posts(slug) ON DELETE CASCADE
      )`)
    ]);

    // Read the column catalog once instead of once for every migration.
    const migrations=[
      ["download_url","ALTER TABLE posts ADD COLUMN download_url TEXT"],
      ["seo_title","ALTER TABLE posts ADD COLUMN seo_title TEXT"],
      ["focus_keyword","ALTER TABLE posts ADD COLUMN focus_keyword TEXT"],
      ["category","ALTER TABLE posts ADD COLUMN category TEXT"],
      ["tags","ALTER TABLE posts ADD COLUMN tags TEXT"],
      ["excerpt","ALTER TABLE posts ADD COLUMN excerpt TEXT"]
    ];
    const initial=await env.DB.prepare("PRAGMA table_info(posts)").all();
    const known=new Set((initial.results||[]).map(column=>column.name));
    for(const [name,sql] of migrations){
      if(known.has(name))continue;
      try{
        await env.DB.prepare(sql).run();
        known.add(name);
      }catch(error){
        // Multiple Worker isolates may add the same column concurrently. Recheck only
        // after an ALTER error and suppress it only when the column now exists.
        const refreshed=await env.DB.prepare("PRAGMA table_info(posts)").all();
        if(!(refreshed.results||[]).some(column=>column.name===name))throw error;
        known.add(name);
      }
    }
    d1SchemaReady=true;
  })();
  try{await d1SchemaPromise}catch(e){d1SchemaPromise=null;throw e}
}
function d1Post(row){
  const hasIcon=!!(row.has_icon||row.icon_blob);
  // Version D1-hosted icon URLs so replacing a logo cannot be hidden by Safari/CDN immutable caching.
  const iconVersion=row.updated_at?"?v="+encodeURIComponent(String(row.updated_at)):"";
  return {title:row.title,path:row.path,slug:row.slug,description:row.description||"",date:row.date,
    published:row.published!==0,appName:row.app_name||"",iconUrl:hasIcon?"/media/icons/"+encodeURIComponent(row.slug)+iconVersion:(row.official_icon_url||null),
    officialIconUrl:hasIcon?"/media/icons/"+encodeURIComponent(row.slug)+iconVersion:(row.official_icon_url||null),
    thumbnailUrl:row.thumbnail_url||null,generatedThumbnailUrl:row.generated_thumbnail_url||null,downloadUrl:row.download_url||null,seoTitle:row.seo_title||null,focusKeyword:row.focus_keyword||null,category:row.category||null,tags:row.tags||null,excerpt:row.excerpt||null,rawUrl:row.raw_url||null};
}
async function d1List(env, includeDrafts=false){
  const columns="id,title,slug,path,description,date,published,app_name,official_icon_url,CASE WHEN icon_blob IS NOT NULL OR EXISTS (SELECT 1 FROM post_media m WHERE m.slug=posts.slug) THEN 1 ELSE 0 END AS has_icon,thumbnail_url,generated_thumbnail_url,download_url,seo_title,focus_keyword,category,tags,excerpt,raw_url,updated_at";
  const q=includeDrafts?"SELECT "+columns+" FROM posts ORDER BY date DESC, id DESC":"SELECT "+columns+" FROM posts WHERE published=1 ORDER BY date DESC, id DESC";
  const r=await env.DB.prepare(q).all(); return (r.results||[]).map(d1Post);
}
async function d1Api(request,env,url){
  if(url.pathname==="/admin/api/github-status"&&request.method==="GET"){
    const result=await env.DB.prepare("SELECT COUNT(*) AS count FROM posts").first();
    return json({ok:true,tokenRequired:false,repository:{status:200,ok:true,fullName:"Cloudflare D1"},database:{connected:true,articleCount:Number(result?.count||0)}});
  }
  if(url.pathname==="/admin/api/migrate-d1"&&request.method==="POST"){
    const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM posts").first();
    if(Number(count?.n||0)>0)return json({ok:true,alreadyMigrated:true,count:Number(count.n)});
    const asset=await env.ASSETS.fetch(new Request(new URL("/posts.json",request.url)));
    if(!asset.ok)return json({error:"Existing posts.json could not be read for migration."},502);
    const posts=await asset.json();const statements=[];
    for(const p of posts){
      const rawUrl=String(p.rawUrl||("https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/"+BRANCH+"/"+String(p.path||"").split("/").map(encodeURIComponent).join("/")));
      const response=await fetch(rawUrl,{headers:{"accept":"text/plain","cache-control":"no-cache"}});
      if(!response.ok)throw new Error("Could not import article: "+String(p.title||p.path)+" (HTTP "+response.status+").");
      const markdown=await response.text();
      const content=markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/,"").trim();
      const slug=articleSlug(p.slug||p.title);
      if(!slug||!content)throw new Error("Article source is empty; migration stopped before reporting success: "+String(p.title||p.path));
      const contentBytes=new TextEncoder().encode(content).byteLength;
      if(contentBytes>1900000)throw new Error("Article exceeds D1's 2 MB row limit and needs R2 content storage: "+String(p.title||p.path));
      const descriptionMatch=markdown.match(/^description:\s*["']([\s\S]*?)["']\s*$/m);
      const description=String(p.description||(descriptionMatch?descriptionMatch[1].replace(/\\(["'])/g,"$1"):""));
      const appName=/capcut/i.test(p.title)?"CapCut":/vivacut/i.test(p.title)?"VivaCut":/pop\s*maker/i.test(p.title)?"PopMaker":/app locker/i.test(p.title)?"App Locker":"";
      statements.push(env.DB.prepare("INSERT OR IGNORE INTO posts (title,slug,path,description,content,date,published,app_name,official_icon_url,thumbnail_url,generated_thumbnail_url,raw_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(String(p.title||slug),slug,String(p.path||("_posts/"+slug+".md")),description,content,String(p.date||new Date().toISOString().slice(0,10)),p.published===false?0:1,appName,p.officialIconUrl||p.iconUrl||null,p.thumbnailUrl||null,p.generatedThumbnailUrl||null,rawUrl));
    }
    if(statements.length)await env.DB.batch(statements);
    const finalCount=await env.DB.prepare("SELECT COUNT(*) AS n FROM posts").first();
    return json({ok:true,migrated:statements.length,count:Number(finalCount?.n||0)});
  }
  if(url.pathname==="/admin/api/media"&&request.method==="GET"){
    const rows=await env.DB.prepare("SELECT id,filename,mime_type,alt_text,size,created_at FROM media_assets ORDER BY created_at DESC LIMIT 100").all();
    return json({media:(rows.results||[]).map(row=>({id:row.id,filename:row.filename,mimeType:row.mime_type,alt:row.alt_text,size:row.size,createdAt:row.created_at,url:"/media/library/"+row.id}))});
  }
  if(url.pathname==="/admin/api/media-upload"&&request.method==="POST"){
    const data=await request.json(),mime=String(data.mimeType||"").toLowerCase(),filename=String(data.filename||"image").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,120)||"image",alt=String(data.alt||"").trim().slice(0,250);
    const encoded=String(data.data||"").replace(/^data:[^,]*;base64,/i,"");
    const allowed=["image/png","image/jpeg","image/webp","image/avif","image/gif"];
    if(!allowed.includes(mime)||!encoded||encoded.length>2100000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return json({error:"Upload a PNG, JPG, WEBP or AVIF image smaller than 1.5 MB."},400);
    const binary=atob(encoded),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    if(bytes.length>1572864)return json({error:"Image must be smaller than 1.5 MB."},400);
    const signatureOk=mime==="image/png"?bytes.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)
      :mime==="image/jpeg"?bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255
      :mime==="image/webp"?bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP"
      :mime==="image/avif"?bytes.length>12&&String.fromCharCode(...bytes.slice(4,8))==="ftyp"&&/^(avif|avis)$/.test(String.fromCharCode(...bytes.slice(8,12))):mime==="image/gif"?bytes.length>10&&/^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0,6))):false;
    if(!signatureOk)return json({error:"The uploaded file does not match its declared image type."},400);
    const id=String(data.uploadId||"").trim()||crypto.randomUUID();
    if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Invalid upload ID."},400);
    // Stable upload IDs make safe client retries possible after transient 503 responses.
    await env.DB.prepare("INSERT OR IGNORE INTO media_assets (id,filename,mime_type,alt_text,data,size) VALUES (?,?,?,?,?,?)").bind(id,filename,mime,alt,bytes,bytes.length).run();
    const saved=await env.DB.prepare("SELECT filename,mime_type,alt_text,size FROM media_assets WHERE id=?").bind(id).first();
    if(!saved)return json({error:"The image could not be confirmed in the media library. Please retry."},503);
    return json({ok:true,media:{id,filename:saved.filename,mimeType:saved.mime_type,alt:saved.alt_text,size:saved.size,url:"/media/library/"+id}});
  }
  if(url.pathname==="/admin/api/media-delete"&&request.method==="POST"){
    const data=await request.json(),id=String(data.id||"");
    if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Invalid media ID."},400);
    const result=await env.DB.prepare("DELETE FROM media_assets WHERE id=?").bind(id).run();
    if(!result.meta?.changes)return json({error:"Media item not found."},404);
    return json({ok:true,deleted:id});
  }
  if(url.pathname==="/admin/api/article"&&request.method==="GET"){
    const path=String(url.searchParams.get("path")||"");
    if(!/^_posts\/[a-zA-Z0-9._-]+\.md$/.test(path))return json({error:"Invalid article path."},400);
    const row=await env.DB.prepare("SELECT *,CASE WHEN EXISTS (SELECT 1 FROM post_media m WHERE m.slug=posts.slug) THEN 1 ELSE 0 END AS has_icon FROM posts WHERE path=?").bind(path).first();
    if(!row)return json({error:"Article not found."},404);
    const post=d1Post(row);
    return json({...post,content:row.content,date:row.date||""});
  }
  if(url.pathname==="/admin/api/posts"&&request.method==="GET")return json({posts:await d1List(env,true)});
  if(url.pathname==="/admin/api/publish"&&request.method==="POST"){
    const data=await request.json();const title=String(data.title||"").trim(),content=String(data.content||"").trim(),description=String(data.description||"").trim();
    const slug=articleSlug(data.slug||title),appName=String(data.appName||"").trim();
    if(title.length<4||title.length>160||content.length<80||description.length>320||slug.length<3)return json({error:"Add a valid title, slug, description and at least 80 characters of article content."},400);
    const exists=await env.DB.prepare("SELECT id FROM posts WHERE slug=?").bind(slug).first();if(exists)return json({error:"That URL slug already exists. Choose a unique slug."},409);
    const date=new Date().toISOString().slice(0,10),path="_posts/"+date+"-"+slug+".md",published=data.published===false?0:1;
    let icon=String(data.officialIconUrl||"").trim()||null,iconBlob=null,iconMime=null;
    if(data.uploadedIcon&&typeof data.uploadedIcon==="object"){
      const allowed={"image/png":1,"image/jpeg":1,"image/webp":1,"image/avif":1};iconMime=String(data.uploadedIcon.mimeType||"").toLowerCase();
      const encoded=String(data.uploadedIcon.data||"").replace(/^data:[^,]*;base64,/i,"");
      if(!allowed[iconMime]||!encoded||encoded.length>2100000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return json({error:"Upload a PNG, JPG, WEBP or AVIF logo smaller than 1.5 MB."},400);
      const binary=atob(encoded);if(binary.length>1572864)return json({error:"App logo must be smaller than 1.5 MB."},400);
      iconBlob=Uint8Array.from(binary,c=>c.charCodeAt(0));icon=null;
    }
    if(icon){try{const u=new URL(icon);if(u.protocol!=="https:"||u.username||u.password)return json({error:"Logo URL must be HTTPS."},400);icon=u.toString()}catch(e){return json({error:"Logo URL must be HTTPS."},400)}}
    const thumb=String(data.thumbnailUrl||"").trim()||null,downloadUrl=String(data.downloadUrl||"").trim()||null;
    if(downloadUrl){try{const u=new URL(downloadUrl);if(u.protocol!=="https:"||u.username||u.password)return json({error:"Download link must be a valid HTTPS URL."},400)}catch(e){return json({error:"Download link must be a valid HTTPS URL."},400)}}
    const seoTitle=String(data.seoTitle||"").trim().slice(0,180),focusKeyword=String(data.focusKeyword||"").trim().slice(0,120),category=String(data.category||"").trim().slice(0,80),tags=String(data.tags||"").trim().slice(0,500),excerpt=String(data.excerpt||"").trim().slice(0,500);
    await env.DB.prepare("INSERT INTO posts (title,slug,path,description,content,date,published,app_name,icon_blob,icon_mime,official_icon_url,thumbnail_url,download_url,seo_title,focus_keyword,category,tags,excerpt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(title,slug,path,description,content,date,published,appName,null,null,icon,thumb,downloadUrl,seoTitle,focusKeyword,category,tags,excerpt).run();
    if(iconBlob)await env.DB.prepare("INSERT INTO post_media (slug,icon_blob,icon_mime) VALUES (?,?,?) ON CONFLICT(slug) DO UPDATE SET icon_blob=excluded.icon_blob,icon_mime=excluded.icon_mime,updated_at=CURRENT_TIMESTAMP")
      .bind(slug,iconBlob,iconMime).run();
    const row=await env.DB.prepare("SELECT *,CASE WHEN EXISTS (SELECT 1 FROM post_media m WHERE m.slug=posts.slug) THEN 1 ELSE 0 END AS has_icon FROM posts WHERE slug=?").bind(slug).first();
    return json({ok:true,article:d1Post(row),url:SITE+"/articles/"+slug});
  }
  if(url.pathname==="/admin/api/update"&&request.method==="POST"){
    const data=await request.json(),path=String(data.path||"");
    const old=await env.DB.prepare("SELECT * FROM posts WHERE path=?").bind(path).first();if(!old)return json({error:"Article not found."},404);
    const title=String(data.title||"").trim(),content=String(data.content||"").trim(),description=String(data.description||"").trim(),slug=articleSlug(data.slug||title),published=data.published===false?0:1,seoTitle=String(data.seoTitle||"").trim().slice(0,180),focusKeyword=String(data.focusKeyword||"").trim().slice(0,120),category=String(data.category||"").trim().slice(0,80),tags=String(data.tags||"").trim().slice(0,500),excerpt=String(data.excerpt||"").trim().slice(0,500);
    if(title.length<4||title.length>160||content.length<80||description.length>320||slug.length<3)return json({error:"Check title, slug, description and article content."},400);
    const duplicate=await env.DB.prepare("SELECT id FROM posts WHERE slug=? AND id<>?").bind(slug,old.id).first();if(duplicate)return json({error:"That URL slug is already in use."},409);
    let icon=old.official_icon_url||null,blob=null,mime=null,replaceMedia=false,removeMedia=false,preserveMedia=false;
    const downloadUrl=String(data.downloadUrl||"").trim()||null;
    if(downloadUrl){try{const u=new URL(downloadUrl);if(u.protocol!=="https:"||u.username||u.password)return json({error:"Download link must be a valid HTTPS URL."},400)}catch(e){return json({error:"Download link must be a valid HTTPS URL."},400)}}
    const iconInput=String(data.officialIconUrl||"").trim();
    if(data.uploadedIcon&&typeof data.uploadedIcon==="object"){
      mime=String(data.uploadedIcon.mimeType||"").toLowerCase();const encoded=String(data.uploadedIcon.data||"").replace(/^data:[^,]*;base64,/i,"");
      if(!["image/png","image/jpeg","image/webp","image/avif"].includes(mime)||!encoded||encoded.length>2100000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return json({error:"Invalid logo upload."},400);
      const binary=atob(encoded);if(binary.length>1572864)return json({error:"App logo must be smaller than 1.5 MB."},400);blob=Uint8Array.from(binary,c=>c.charCodeAt(0));icon=null;replaceMedia=true;
    }else if(iconInput.startsWith("/media/icons/")){
      // The form echoes the existing D1-hosted logo URL. Keep the separate media row unchanged.
      icon=null;preserveMedia=true;if(old.icon_blob){blob=old.icon_blob;mime=old.icon_mime;replaceMedia=true}
    }else if(iconInput.startsWith("/assets/app-icons/")&&/^\/assets\/app-icons\/[a-zA-Z0-9._-]+$/.test(iconInput)){
      icon=iconInput;removeMedia=true;
    }else if(iconInput){
      try{const u=new URL(iconInput);if(u.protocol!=="https:"||u.username||u.password)return json({error:"Logo URL must be HTTPS."},400);icon=u.toString();removeMedia=true}catch(e){return json({error:"Logo URL must be HTTPS."},400)}
    }else{
      icon=null;removeMedia=true;
    }
    let movedMedia=null;
    if(slug!==old.slug){
      if(preserveMedia){
        movedMedia=await env.DB.prepare("SELECT icon_blob,icon_mime FROM post_media WHERE slug=?").bind(old.slug).first();
        if(!movedMedia&&old.icon_blob)movedMedia={icon_blob:old.icon_blob,icon_mime:old.icon_mime};
      }
      // Remove the old foreign-key child row before changing the post slug.
      await env.DB.prepare("DELETE FROM post_media WHERE slug=?").bind(old.slug).run();
    }else if(removeMedia){
      await env.DB.prepare("DELETE FROM post_media WHERE slug=?").bind(old.slug).run();
    }
    await env.DB.prepare("UPDATE posts SET title=?,slug=?,description=?,content=?,app_name=?,icon_blob=?,icon_mime=?,official_icon_url=?,thumbnail_url=?,download_url=?,published=?,seo_title=?,focus_keyword=?,category=?,tags=?,excerpt=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(title,slug,description,content,String(data.appName||old.app_name||""),null,null,icon,String(data.thumbnailUrl||"").trim()||null,downloadUrl,published,seoTitle,focusKeyword,category,tags,excerpt,old.id).run();
    if(replaceMedia)await env.DB.prepare("INSERT INTO post_media (slug,icon_blob,icon_mime) VALUES (?,?,?) ON CONFLICT(slug) DO UPDATE SET icon_blob=excluded.icon_blob,icon_mime=excluded.icon_mime,updated_at=CURRENT_TIMESTAMP").bind(slug,blob,mime).run();
    else if(movedMedia)await env.DB.prepare("INSERT INTO post_media (slug,icon_blob,icon_mime) VALUES (?,?,?) ON CONFLICT(slug) DO UPDATE SET icon_blob=excluded.icon_blob,icon_mime=excluded.icon_mime,updated_at=CURRENT_TIMESTAMP").bind(slug,movedMedia.icon_blob,movedMedia.icon_mime).run();
    const row=await env.DB.prepare("SELECT *,CASE WHEN EXISTS (SELECT 1 FROM post_media m WHERE m.slug=posts.slug) THEN 1 ELSE 0 END AS has_icon FROM posts WHERE id=?").bind(old.id).first();
    return json({ok:true,article:d1Post(row),url:SITE+"/articles/"+slug});
  }
  if(url.pathname==="/admin/api/delete"&&request.method==="POST"){
    const data=await request.json();const target=await env.DB.prepare("SELECT slug FROM posts WHERE path=?").bind(String(data.path||"")).first();if(!target)return json({error:"Article not found."},404);
    await env.DB.prepare("DELETE FROM post_media WHERE slug=?").bind(target.slug).run();
    await env.DB.prepare("DELETE FROM posts WHERE path=?").bind(String(data.path||"")).run();return json({ok:true,deleted:data.path});
  }
  return json({error:"D1 API endpoint not found."},404);
}

async function api(request, env) {
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type","access-control-max-age":"86400"}});
  // TEMPORARY: Cloudflare Access application was removed at the owner's request.
  // This leaves all Admin API read/write endpoints publicly reachable. Restore Access JWT validation before considering the site production-secure.
  const url=new URL(request.url);
  if(!env.DB)return json({error:"Cloudflare D1 binding is missing. Configure the DB binding before using the Admin Panel; GitHub tokens are not used for publishing."},503);
  try{return await d1Api(request,env,url)}catch(e){return json({error:e.message||"D1 request failed."},500)}
}
export default {
 async fetch(request,env) {
   const url=new URL(request.url);
   if(env.DB){try{await ensureD1Schema(env)}catch(e){return json({error:"Cloudflare D1 schema initialization failed: "+(e.message||"Database unavailable.")},503)}}
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
     if(env.DB){
       const path=String(url.searchParams.get("path")||"");
       if(!/^_posts\/[a-zA-Z0-9._-]+\.md$/.test(path))return json({error:"Invalid article path."},400);
       const row=await env.DB.prepare("SELECT *,CASE WHEN EXISTS (SELECT 1 FROM post_media m WHERE m.slug=posts.slug) THEN 1 ELSE 0 END AS has_icon FROM posts WHERE path=? AND published=1").bind(path).first();
       if(!row)return json({error:"Article not found."},404);
       const post=d1Post(row);
       return json({content:row.content,title:row.title,description:row.description||"",seoTitle:post.seoTitle,focusKeyword:post.focusKeyword,category:post.category,tags:post.tags,excerpt:post.excerpt,iconUrl:post.iconUrl,officialIconUrl:post.officialIconUrl,thumbnailUrl:post.thumbnailUrl,generatedThumbnailUrl:post.generatedThumbnailUrl,downloadUrl:post.downloadUrl,date:row.date||""});
     }
     const path=String(url.searchParams.get("path")||"");
     if(!/^_posts\/[a-zA-Z0-9._-]+\.md$/.test(path))return json({error:"Invalid article path."},400);
     try{const list=await getPublicPosts(env,request);const post=list.find(p=>p.path===path);if(!post||post.published===false)return json({error:"Article not found."},404);const raw="https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/"+BRANCH+"/"+path.split("/").map(encodeURIComponent).join("/");const res=await fetch(raw,{headers:{"accept":"text/plain"}});if(!res.ok)return json({error:"Article content is temporarily unavailable."},502);return json({content:await res.text(),title:post.title,description:post.description||"",seoTitle:post.seoTitle||null,focusKeyword:post.focusKeyword||null,category:post.category||null,tags:post.tags||null,excerpt:post.excerpt||null,iconUrl:post.iconUrl||post.officialIconUrl||null,officialIconUrl:post.officialIconUrl||post.iconUrl||null,thumbnailUrl:post.thumbnailUrl||null,generatedThumbnailUrl:post.generatedThumbnailUrl||null,downloadUrl:post.downloadUrl||null,date:post.date||""})}catch(e){return json({error:e.message||"Article lookup failed."},503)}
   }

   if(url.pathname==="/posts.json"&&env.DB&&request.method==="GET")return json(await d1List(env,false));
   if(url.pathname.startsWith("/media/library/")&&env.DB&&request.method==="GET"){
     const id=url.pathname.slice("/media/library/".length);
     if(!/^[0-9a-f-]{36}$/i.test(id))return new Response("Not found",{status:404});
     const row=await env.DB.prepare("SELECT filename,mime_type,data FROM media_assets WHERE id=?").bind(id).first();
     if(!row?.data)return new Response("Not found",{status:404});
     return new Response(row.data,{headers:{"content-type":row.mime_type,"content-disposition":"inline; filename*=UTF-8''"+encodeURIComponent(row.filename),"cache-control":"public, max-age=300, must-revalidate","x-content-type-options":"nosniff""}});
   }
   if(url.pathname.startsWith("/media/icons/")&&env.DB&&request.method==="GET"){
     const slug=decodeURIComponent(url.pathname.slice("/media/icons/".length));
     const row=await env.DB.prepare("SELECT icon_blob,icon_mime FROM post_media WHERE slug=?").bind(slug).first()||await env.DB.prepare("SELECT icon_blob,icon_mime FROM posts WHERE slug=?").bind(slug).first();
     if(!row?.icon_blob)return new Response("Not found",{status:404});
     return new Response(row.icon_blob,{headers:{"content-type":row.icon_mime||"application/octet-stream","cache-control":"public, max-age=300, must-revalidate","x-content-type-options":"nosniff"}});
   }
   if(url.pathname==="/sitemap.xml"&&env.DB&&request.method==="GET"){
     const posts=await d1List(env,false);
     const urls=[`<url><loc>${SITE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,...posts.map(p=>`<url><loc>${SITE}/articles/${encodeURIComponent(p.slug)}</loc><lastmod>${p.date||new Date().toISOString().slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`)];
     return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.join("\n")+'\n</urlset>',{headers:{"content-type":"application/xml; charset=utf-8","cache-control":"public, max-age=300"}});
   }
   if(url.pathname.startsWith("/admin/api/"))return api(request,env);
   if(url.pathname==="/admin"||url.pathname==="/admin/"||url.pathname==="/admin/index.html") {
     // Admin HTML must not be cached: Access sessions and newly deployed UI fixes
     // should be evaluated on every visit, especially on mobile Safari.
     const target=new URL("/admin/index.html",url);
     const asset=await env.ASSETS.fetch(new Request(target.toString(),request));
     const headers=new Headers(asset.headers);
     headers.set("cache-control","no-store, no-cache, must-revalidate");
     headers.set("pragma","no-cache");
     headers.delete("etag");
     headers.delete("last-modified");
     return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
   }
   if(url.pathname==="/articles"||url.pathname==="/articles/") {
     const target=new URL("/articles.html",url);
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