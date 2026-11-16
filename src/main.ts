import { auditFaces, coverage, css, csv, escapeHtml, extensions, formatBytes, MAX_BYTES, MAX_FILES, MAX_TOTAL_BYTES, sha256, unicodeBlock } from "./audit";
import "./style.css";

type Axis = { min: number; default: number; max: number; name?: string };
type Face = { id:string; fileId:string; fileName:string; fileSize:number; family:string; subfamily:string; fullName:string; postscriptName:string; version:string; weight:number; glyphCount:number; unitsPerEm:number|null; characterSet:number[]; issues:{severity:string;title:string;detail:string}[]; previewFamily:string; sha256:string; axes:Record<string,Axis>; isVariable:boolean; isCollection:boolean };
type Stored = { file:File; buffer:ArrayBuffer; sha256:string };
type LocalFont = { family:string; fullName:string; postscriptName:string; style:string };
const app = document.querySelector<HTMLDivElement>("#app")!;
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type:"module" });
const stored = new Map<string,Stored>();
let faces:Face[] = [], selected = "", compare = "", sample = "The quick brown fox jumps over the lazy dog. 0123456789";
let custom = "", search = "", size = 42, lineHeight = 1.35, letterSpacing = 0, textColor = "#e8e8df", bgColor = "#11120f";
let notice = "", pending = 0, axesValues:Record<string,number> = {}, activeTab = "overview";
let localFonts:LocalFont[] = [], localFontsLoaded = false, localFontsBusy = false, localFontsNotice = "", localFontSearch = "", selectedLocalFont = "";
const presets:Record<string,string> = { latin:"The quick brown fox jumps over the lazy dog. 0123456789", telugu:"తెలుగు భాష మన సంస్కృతి. అ ఆ ఇ ఈ ఉ ఊ ఋ ఎ ఏ ఐ ఒ ఓ ఔ", devanagari:"देवनागरी लिपि परीक्षण। अ आ इ ई उ ऊ ऋ ए ऐ ओ औ", tamil:"தமிழ் மொழி அழகானது. அ ஆ இ ஈ உ ஊ எ ஏ ஐ ஒ ஓ", kannada:"ಕನ್ನಡ ಭಾಷೆ ನಮ್ಮ ಹೆಮ್ಮೆ. ಅ ಆ ಇ ಈ ಉ ಊ ಋ ಎ ಏ", malayalam:"മലയാളം ഭാഷാ പരിശോധന. അ ആ ഇ ഈ ഉ ഊ എ ഏ ഐ" };
const current = () => faces.find((f) => f.id === selected) || faces[0];
const esc = escapeHtml;
function save(name:string, data:BlobPart|Blob, type="text/plain") {
  const blob = data instanceof Blob ? data : new Blob([data], {type});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function reportData() {
  return { generatedAt:new Date().toISOString(), application:"FontScope", processing:"local browser session", findings:auditFaces(faces), faces:faces.map(({characterSet,...f})=>({...f,characterCount:characterSet.length})) };
}
function htmlReport() {
  const rows = faces.map((f) => "<tr><td>"+esc(f.family)+"</td><td>"+esc(f.subfamily)+"</td><td>"+esc(f.fileName)+"</td><td>"+f.weight+"</td><td>"+f.glyphCount+"</td><td>"+f.issues.length+"</td></tr>").join("");
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FontScope audit</title><style>body{font:15px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;color:#20231d}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #ddd}th{background:#f2f4ed}</style><h1>FontScope audit report</h1><p>'+new Date().toLocaleString()+" · "+faces.length+' faces</p><table><thead><tr><th>Family</th><th>Style</th><th>File</th><th>Weight</th><th>Glyphs</th><th>Findings</th></tr></thead><tbody>'+rows+"</tbody></table></html>";
}
function crc32(data:Uint8Array) {
  let crc = -1;
  for (const byte of data) { crc ^= byte; for (let j=0;j<8;j++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320); }
  return (crc ^ -1) >>> 0;
}
function zipStore(entries:{name:string;data:Uint8Array}[]) {
  const enc = new TextEncoder(), local:Uint8Array[] = [], central:Uint8Array[] = []; let offset = 0;
  const put16=(v:DataView,p:number,n:number)=>v.setUint16(p,n,true), put32=(v:DataView,p:number,n:number)=>v.setUint32(p,n,true);
  for (const entry of entries) {
    const name=enc.encode(entry.name), data=entry.data, crc=crc32(data), head=new Uint8Array(30+name.length), hv=new DataView(head.buffer);
    put32(hv,0,0x04034b50);put16(hv,4,20);put16(hv,6,0x800);put16(hv,8,0);put16(hv,10,0);put16(hv,12,0);put32(hv,14,crc);put32(hv,18,data.length);put32(hv,22,data.length);put16(hv,26,name.length);put16(hv,28,0);head.set(name,30);
    local.push(head,data);
    const ch=new Uint8Array(46+name.length),cv=new DataView(ch.buffer);
    put32(cv,0,0x02014b50);put16(cv,4,20);put16(cv,6,20);put16(cv,8,0x800);put16(cv,10,0);put16(cv,12,0);put16(cv,14,0);put32(cv,16,crc);put32(cv,20,data.length);put32(cv,24,data.length);put16(cv,28,name.length);put16(cv,30,0);put16(cv,32,0);put16(cv,34,0);put16(cv,36,0);put32(cv,38,0);put32(cv,42,offset);ch.set(name,46);central.push(ch);
    offset += head.length + data.length;
  }
  const centralSize=central.reduce((n,a)=>n+a.length,0), end=new Uint8Array(22), ev=new DataView(end.buffer);
  put32(ev,0,0x06054b50);put16(ev,4,0);put16(ev,6,0);put16(ev,8,entries.length);put16(ev,10,entries.length);put32(ev,12,centralSize);put32(ev,16,offset);put16(ev,20,0);
  return new Blob([...local,...central,end],{type:"application/zip"});
}

function localFontResultsMarkup() {
  if (!localFontsLoaded) return '<p class="local-font-empty">Your installed fonts stay on this device. Select Scan to ask your browser for permission.</p>';
  const filtered = localFonts.filter((font) => (font.family+" "+font.fullName+" "+font.style+" "+font.postscriptName).toLowerCase().includes(localFontSearch.toLowerCase()));
  const shown = filtered.slice(0, 250);
  return '<div class="local-font-toolbar"><input class="search" id="local-font-search" aria-label="Search installed fonts" placeholder="Search installed fonts…" value="'+esc(localFontSearch)+'"><span>'+filtered.length+' MATCHING</span></div>'+
    (shown.length ? '<div class="local-font-grid">'+shown.map((font) => {
      const index=localFonts.indexOf(font);
      return '<button class="local-font-card '+(selectedLocalFont===font.postscriptName?"active":"")+'" data-local-font="'+index+'"><span class="local-font-card-meta"><b>'+esc(font.family)+'</b><small>'+esc(font.style||"Style not reported")+'</small></span><span class="local-font-sample" data-local-font-preview="'+index+'">Aa Bb Gg 0123</span><small class="local-font-full">'+esc(font.fullName||font.postscriptName||"")+'</small></button>';
    }).join("")+'</div>' : '<p class="local-font-empty">No installed fonts match that search.</p>')+
    (filtered.length>250?'<p class="local-font-footnote">Showing the first 250 matches. Refine your search to find more.</p>':"");
}
function bindLocalFontPreviews() {
  document.querySelectorAll<HTMLElement>("[data-local-font-preview]").forEach((el) => {
    const font=localFonts[Number(el.dataset.localFont)];
    if(font) el.style.fontFamily=JSON.stringify(font.family)+", sans-serif";
  });
}
async function scanLocalFonts() {
  const api=window as Window & { queryLocalFonts?: () => Promise<LocalFont[]> };
  if(!api.queryLocalFonts) {
    localFontsNotice="Local font access is not available in this browser. Try the latest Chrome or Edge on desktop, or import font files below.";
    render();
    return;
  }
  let request:Promise<LocalFont[]>;
  try { request=api.queryLocalFonts(); }
  catch { localFontsNotice="Your browser could not start local font access. Check browser support and site permissions."; render(); return; }
  localFontsBusy=true; localFontsNotice="Waiting for browser permission…"; render();
  try {
    const result=await request;
    const unique=new Map<string,LocalFont>();
    for(const font of result) {
      const key=font.postscriptName||[font.family,font.style].join("|");
      if(!unique.has(key)) unique.set(key,{family:font.family,fullName:font.fullName,postscriptName:font.postscriptName,style:font.style});
    }
    localFonts=[...unique.values()].sort((a,b)=>a.family.localeCompare(b.family)||a.style.localeCompare(b.style));
    localFontsLoaded=true; localFontSearch=""; selectedLocalFont="";
    localFontsNotice="Found "+localFonts.length+" installed font faces. Font information stays in this browser session.";
  } catch(error) {
    const name=error instanceof DOMException?error.name:"";
    localFontsNotice=name==="NotAllowedError"?"Permission was not granted. Allow local font access in your browser's site permissions and try again.":"Could not read installed fonts. Check browser support and site permissions, then try again.";
  } finally { localFontsBusy=false; render(); }
}

function render() {
  const face=current(), findings=auditFaces(faces), cov=face?coverage(face.characterSet,custom||sample):null;
  const duplicateCount=findings.filter((f)=>f.title==="Repeated PostScript name"||f.title==="Identical font file content").length;
  const list=faces.filter((f)=>(f.family+" "+f.subfamily+" "+f.fileName+" "+f.postscriptName).toLowerCase().includes(search.toLowerCase()));
  const compareFace=faces.find((f)=>f.id===compare);
  const blocks=new Map<string,{total:number;missing:number}>();
  if(face&&cov) for(const cp of cov.missing){const name=unicodeBlock(cp),v=blocks.get(name)||{total:0,missing:0};v.missing++;blocks.set(name,v);}
  const axisMarkup=face&&face.isVariable?Object.entries(face.axes).map(([tag,a])=>'<label class="axis"><span>'+esc(a.name||tag)+' <code>'+esc(tag)+'</code></span><input data-axis="'+esc(tag)+'" type="range" min="'+a.min+'" max="'+a.max+'" step="'+((a.max-a.min)/100||1)+'" value="'+(axesValues[tag]??a.default)+'"><b>'+(axesValues[tag]??a.default)+'</b></label>').join(""):'<p class="muted small">No variable-axis metadata exposed for this face by the parser.</p>';
  app.innerHTML = '<header class="top"><a class="brand" href="#"><b>ƒ</b> fontscope<span>.</span></a><div><span class="privacy">◉ LOCAL PROCESSING</span><a href="https://github.com/akhilalladi-code/fontscope-studio" target="_blank" rel="noreferrer">GITHUB ↗</a></div></header><main>'+
  '<section class="hero"><div class="eyebrow">TYPE ENGINEERING / STUDIO</div><div class="hero-grid"><div><h1>Know your<br><i>type.</i></h1><p>Inspect, compare and prepare font packages with a more reliable engineering workflow. Your font files stay in this browser session.</p></div><aside><small>THE WORKFLOW</small><p>Inspect every face.<br>Test real text.<br>Ship with confidence.</p><small class="local">● NO FONT UPLOADS · NO ACCOUNT</small></aside></div></section>'+
  '<section class="workspace"><div class="section-title"><div><small>WORKSPACE / 01</small><h2>Package overview</h2></div><small>'+stored.size+' FILES · '+faces.length+' FACES</small></div>'+
  '<div class="stats"><article><small>FONT FILES</small><strong>'+String(stored.size).padStart(2,"0")+'</strong><label>Imported this session</label></article><article><small>FONT FACES</small><strong>'+String(faces.length).padStart(2,"0")+'</strong><label>Including collection faces</label></article><article><small>FINDINGS</small><strong class="'+(findings.length?"warn":"")+'">'+String(findings.length).padStart(2,"0")+'</strong><label>Advisory audit results</label></article><article><small>DUPLICATES</small><strong>'+String(duplicateCount).padStart(2,"0")+'</strong><label>Names or identical content</label></article></div>'+
  '<section class="panel local-font-library"><div class="panel-title"><div><small>LOCAL DEVICE / PERMISSION-BASED ACCESS</small><h3>Local Font Library</h3></div><span class="local-font-count">'+(localFontsLoaded?localFonts.length+" FACES":"NOT SCANNED")+'</span></div><p class="local-font-description">Discover font families already installed on this computer and preview them instantly. Font files are not uploaded or copied. Your browser will ask for permission before sharing font metadata with this page.</p><div class="local-font-actions"><button id="scan-local-fonts" '+(localFontsBusy?"disabled":"")+'>'+(localFontsBusy?"Scanning…":localFontsLoaded?"↻ Scan again":"⌕ Scan my installed fonts")+'</button>'+(localFontsLoaded?'<button id="clear-local-fonts" class="secondary-action">Clear results</button>':"")+'</div>'+(localFontsNotice?'<p class="local-font-notice" role="status">'+esc(localFontsNotice)+'</p>':"")+'<div id="local-font-results">'+localFontResultsMarkup()+'</div><p class="local-font-footnote">Requires a supported desktop browser and your approval. FontScope receives font metadata for previews; it does not upload local font files. If unavailable, use the font-file importer below.</p></section>'+
  '<label class="drop" id="drop"><b>↑</b><span><strong>Drop font files here</strong><small>or <u>browse your device</u><br><em>TTF · OTF · WOFF · WOFF2 · TTC / 50 MB EACH · 200 MB TOTAL · 100 FILES</em></small></span><input id="files" type="file" multiple accept=".ttf,.otf,.woff,.woff2,.ttc" hidden></label>'+
  (notice?'<div class="notice" role="status">'+esc(notice)+'<button id="dismiss" aria-label="Dismiss">×</button></div>':"")+(pending?'<p class="processing" role="status">◌ Parsing font files locally… '+pending+' pending</p>':"")+
  '<nav class="tabs" aria-label="Workspace sections">'+[["overview","Inventory"],["specimen","Specimen"],["coverage","Glyph QA"],["audit","Audit"],["handoff","Handoff"]].map(([id,label])=>'<button data-tab="'+id+'" class="'+(activeTab===id?"selected":"")+'">'+label+'</button>').join("")+'</nav>'+
  '<div class="columns"><section class="panel"><div class="panel-title"><div><small>01 / INVENTORY</small><h3>Font faces</h3></div><b class="count">'+list.length+'</b></div><input class="search" id="search" aria-label="Search font faces" placeholder="Search family, style, filename…" value="'+esc(search)+'"><div class="face-list">'+(list.length?list.map((f)=>'<button class="face '+(face?.id===f.id?"active":"")+'" data-face="'+esc(f.id)+'"><span class="aa">Aa</span><span><b>'+esc(f.family)+'</b><small>'+esc(f.subfamily)+' · '+esc(f.fileName)+'</small></span><code>'+f.weight+'</code></button>').join(""):'<p class="empty">Your inventory is empty. Add a font file to begin.</p>')+'</div><div class="file-list"><small>IMPORTED FILES</small>'+[...stored.entries()].map(([id,x])=>'<div class="file"><span>'+esc(x.file.name)+'</span><small>'+formatBytes(x.file.size)+'</small><button data-remove="'+id+'" aria-label="Remove '+esc(x.file.name)+'">×</button></div>').join("")+'</div></section>'+
  '<section class="panel"><div class="panel-title"><div><small>02 / SELECTED FACE</small><h3>Font properties</h3></div><small class="live">'+(face?.isVariable?"VARIABLE":face?"READY":"WAITING")+'</small></div>'+(face?'<div class="metadata">'+[["FAMILY",face.family],["STYLE",face.subfamily],["WEIGHT",face.weight],["GLYPHS",face.glyphCount],["UNITS / EM",face.unitsPerEm||"—"],["VERSION",face.version||"Not reported"],["POSTSCRIPT",face.postscriptName||"Not reported"],["SHA-256",face.sha256.slice(0,18)+"…"]].map((x)=>'<div><small>'+x[0]+'</small><b title="'+esc(x[1])+'">'+esc(x[1])+'</b></div>').join("")+'</div><div class="axis-list"><small class="sub">VARIABLE AXES</small>'+axisMarkup+'</div>':'<div class="empty detail-empty">Import a font package and select a face to inspect its metadata.</div>')+'</section></div>'+
  '<div class="columns"><section class="panel"><div class="panel-title"><div><small>03 / SPECIMEN STUDIO</small><h3>Live type preview</h3></div><small class="live">LIVE</small></div>'+(face?'<div class="controls"><label>SIZE <input id="font-size" type="range" min="12" max="120" value="'+size+'"><b>'+size+'px</b></label><label>LINE HEIGHT <input id="line-height" type="range" min="1" max="2" step=".05" value="'+lineHeight+'"></label><label>LETTER SPACE <input id="letter-spacing" type="range" min="-2" max="12" step=".25" value="'+letterSpacing+'"></label></div><div class="color-controls"><label>TEXT <input id="text-color" type="color" value="'+textColor+'"></label><label>BACKGROUND <input id="bg-color" type="color" value="'+bgColor+'"></label></div><div class="specimen" id="specimen" style="font-family:\''+esc(face.previewFamily)+'\',sans-serif;font-size:'+size+'px;line-height:'+lineHeight+';letter-spacing:'+letterSpacing+'px;color:'+textColor+';background:'+bgColor+'">'+esc(custom||sample)+'</div><textarea id="custom" aria-label="Custom specimen text" placeholder="Type your own specimen text…">'+esc(custom)+'</textarea><div class="chips">'+Object.keys(presets).map((k)=>'<button data-sample="'+k+'">'+k[0].toUpperCase()+k.slice(1)+'</button>').join("")+'</div>':'<p class="empty">Select a font face to begin the specimen preview.</p>')+'</section>'+
  '<section class="panel"><div class="panel-title"><div><small>04 / SIDE-BY-SIDE</small><h3>Font comparison</h3></div></div>'+(face?'<label class="compare-select">COMPARE WITH <select id="compare"><option value="">Choose another face</option>'+faces.filter((f)=>f.id!==face.id).map((f)=>'<option value="'+esc(f.id)+'" '+(compare===f.id?"selected":"")+'>'+esc(f.family+" · "+f.subfamily)+'</option>').join("")+'</select></label><div class="compare-grid"><div><small>'+esc(face.family)+'</small><p style="font-family:\''+esc(face.previewFamily)+'\';font-size:30px">Aa Bb Gg 123</p><span>'+esc(face.subfamily)+'</span></div><div><small>'+(compareFace?esc(compareFace.family):"SECOND FONT")+'</small><p style="font-family:\''+esc(compareFace?.previewFamily||"sans-serif")+'\';font-size:30px">'+(compareFace?"Aa Bb Gg 123":"Choose a second face")+'</p><span>'+(compareFace?esc(compareFace.subfamily):"Comparison preview")+'</span></div></div>':'<p class="empty">Import at least one face to compare type.</p>')+'</section></div>'+
  '<div class="columns"><section class="panel"><div class="panel-title"><div><small>05 / MULTILINGUAL QA</small><h3>Unicode coverage</h3></div></div>'+(face&&cov?'<textarea id="coverage-text" aria-label="Text to check for glyph coverage" placeholder="Enter the exact text to test…">'+esc(custom||sample)+'</textarea><div class="score"><b>'+cov.percent+'%</b><span>'+cov.present+' of '+cov.total+' unique non-space code points present</span></div><div class="progress"><i style="width:'+cov.percent+'%"></i></div><small class="sub">MISSING CHARACTERS · '+cov.missing.length+'</small><div class="missing">'+(cov.missing.length?cov.missing.slice(0,80).map((cp)=>'<span title="U+'+cp.toString(16).toUpperCase()+' · '+unicodeBlock(cp)+'">'+esc(String.fromCodePoint(cp))+'</span>').join(""):'<p class="ok">✓ All tested code points are present.</p>')+'</div><div class="block-list">'+[...blocks.entries()].map(([name,v])=>'<div><span>'+esc(name)+'</span><b>'+v.missing+' missing</b></div>').join("")+'</div><p class="disclaimer">Presence checks do not validate shaping, ligatures, mark positioning, kerning or visual correctness.</p>':'<p class="empty">Select a face to test character presence.</p>')+'</section>'+
  '<section class="panel"><div class="panel-title"><div><small>06 / PACKAGE HEALTH</small><h3>Audit findings</h3></div><b class="count">'+findings.length+'</b></div><div class="findings">'+(findings.length?findings.map((f)=>'<article class="finding '+f.severity+'"><b>'+esc(f.title)+'</b><p>'+esc(f.detail)+'</p></article>').join(""):'<p class="ok">'+(faces.length?"✓ No issues found by the current checks.":"Audit findings appear after importing fonts.")+'</p>')+'</div><p class="disclaimer">Automated checks are advisory. Verify licensing and final rendering independently.</p></section></div>'+
  '<section class="panel exports"><div class="panel-title"><div><small>07 / HANDOFF</small><h3>Export your font package</h3></div><small>SESSION DATA</small></div><p>Generate an inventory, implementation snippet, review report or portable handoff archive.</p><div class="buttons"><button data-export="json" '+(!faces.length?"disabled":"")+'>JSON inventory ↓</button><button data-export="csv" '+(!faces.length?"disabled":"")+'>CSV inventory ↓</button><button data-export="css" '+(!faces.length?"disabled":"")+'>CSS @font-face ↓</button><button data-export="html" '+(!faces.length?"disabled":"")+'>HTML report ↓</button><button data-export="tokens" '+(!faces.length?"disabled":"")+'>Design tokens ↓</button><button data-export="tailwind" '+(!faces.length?"disabled":"")+'>Tailwind config ↓</button><button data-export="regression" '+(!faces.length||!compareFace?"disabled":"")+'>Compare report ↓</button><button data-export="zip" '+(!faces.length?"disabled":"")+'>Complete ZIP handoff ↓</button></div><p class="disclaimer">ZIP includes your original imported files plus generated reports. It does not convert or subset fonts. TTC files are included as originals but excluded from CSS output.</p></section>'+
  '</section></main><footer><span>FONTSCOPE / TYPE ENGINEERING TOOLKIT</span><span>LOCAL-FIRST · SESSION ONLY</span><span>© 2026 AKHIL ALLADI</span></footer>';
  bind();
}
function bind() {
  document.querySelector<HTMLButtonElement>("#scan-local-fonts")?.addEventListener("click",()=>void scanLocalFonts());
  document.querySelector<HTMLButtonElement>("#clear-local-fonts")?.addEventListener("click",()=>{localFonts=[];localFontsLoaded=false;localFontsNotice="";localFontSearch="";selectedLocalFont="";render();});
  const localSearch=document.querySelector<HTMLInputElement>("#local-font-search");
  if(localSearch) localSearch.oninput=()=>{localFontSearch=localSearch.value;const results=document.querySelector<HTMLElement>("#local-font-results");if(results){results.innerHTML=localFontResultsMarkup();bindLocalFontResults();}};
  bindLocalFontResults();
  const input=document.querySelector<HTMLInputElement>("#files");
  if(input) input.onchange=()=>{if(input.files)void addFiles([...input.files]);input.value="";};
  const drop=document.querySelector<HTMLElement>("#drop");
  if(drop){drop.ondragover=(e)=>{e.preventDefault();drop.classList.add("dragging");};drop.ondragleave=()=>drop.classList.remove("dragging");drop.ondrop=(e)=>{e.preventDefault();drop.classList.remove("dragging");if(e.dataTransfer)void addFiles([...e.dataTransfer.files]);};}
  document.querySelectorAll<HTMLElement>("[data-face]").forEach((el)=>el.onclick=()=>{selected=el.dataset.face||"";axesValues={};void preview();});
  document.querySelectorAll<HTMLElement>("[data-remove]").forEach((el)=>el.onclick=()=>{const id=el.dataset.remove!;stored.delete(id);faces=faces.filter((f)=>f.fileId!==id);if(!faces.some((f)=>f.id===selected))selected=faces[0]?.id||"";if(!faces.some((f)=>f.id===compare))compare="";render();});
  const searchInput=document.querySelector<HTMLInputElement>("#search");
  if(searchInput) searchInput.oninput=()=>{search=searchInput.value;const pos=searchInput.selectionStart;render();const next=document.querySelector<HTMLInputElement>("#search");next?.focus();next?.setSelectionRange(pos,pos);};
  const customInput=document.querySelector<HTMLTextAreaElement>("#custom");
  if(customInput) customInput.oninput=()=>{custom=customInput.value;const specimen=document.querySelector<HTMLElement>("#specimen");if(specimen)specimen.textContent=custom||sample;const ct=document.querySelector<HTMLTextAreaElement>("#coverage-text");if(ct)ct.value=custom||sample;updateCoverage();};
  const coverageInput=document.querySelector<HTMLTextAreaElement>("#coverage-text");
  if(coverageInput) coverageInput.oninput=()=>{custom=coverageInput.value;const t=document.querySelector<HTMLTextAreaElement>("#custom");if(t)t.value=custom;const s=document.querySelector<HTMLElement>("#specimen");if(s)s.textContent=custom||sample;updateCoverage();};
  const range=(id:string,fn:(v:number)=>void)=>{const el=document.querySelector<HTMLInputElement>("#"+id);if(el)el.oninput=()=>fn(Number(el.value));};
  range("font-size",(v)=>{size=v;const s=document.querySelector<HTMLElement>("#specimen");if(s)s.style.fontSize=v+"px";});
  range("line-height",(v)=>{lineHeight=v;const s=document.querySelector<HTMLElement>("#specimen");if(s)s.style.lineHeight=String(v);});
  range("letter-spacing",(v)=>{letterSpacing=v;const s=document.querySelector<HTMLElement>("#specimen");if(s)s.style.letterSpacing=v+"px";});
  const color=(id:string,fn:(v:string)=>void,prop:"color"|"backgroundColor")=>{const el=document.querySelector<HTMLInputElement>("#"+id);if(el)el.oninput=()=>{fn(el.value);const s=document.querySelector<HTMLElement>("#specimen");if(s)s.style[prop]=el.value;};};
  color("text-color",(v)=>textColor=v,"color");color("bg-color",(v)=>bgColor=v,"backgroundColor");
  document.querySelectorAll<HTMLElement>("[data-sample]").forEach((el)=>el.onclick=()=>{sample=presets[el.dataset.sample||"latin"]||presets.latin;custom="";render();});
  const compareSelect=document.querySelector<HTMLSelectElement>("#compare");if(compareSelect)compareSelect.onchange=()=>{compare=compareSelect.value;void previewCompare();};
  document.querySelectorAll<HTMLInputElement>("[data-axis]").forEach((el)=>el.oninput=()=>{axesValues[el.dataset.axis!]=Number(el.value);const face=current();if(!face)return;const specimen=document.querySelector<HTMLElement>("#specimen");if(specimen){specimen.style.fontVariationSettings=Object.entries(axesValues).map(([tag,value])=>'"'+tag+'" '+value).join(", ");}const label=el.parentElement?.querySelector("b");if(label)label.textContent=el.value;});
  document.querySelectorAll<HTMLButtonElement>("[data-export]").forEach((el)=>el.onclick=()=>void exportFile(el.dataset.export!));
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((el)=>el.onclick=()=>{activeTab=el.dataset.tab||"overview";const target=activeTab==="overview"?"drop":activeTab==="specimen"?"specimen":activeTab==="coverage"?"coverage-text":activeTab==="audit"?"":"exports";document.querySelector(target?"#"+target:".findings")?.scrollIntoView({behavior:"smooth",block:"center"});document.querySelectorAll("[data-tab]").forEach((b)=>b.classList.toggle("selected",b===el));});
  document.querySelector("#dismiss")?.addEventListener("click",()=>{notice="";render();});
}
function bindLocalFontResults() {
  bindLocalFontPreviews();
  document.querySelectorAll<HTMLButtonElement>("[data-local-font]").forEach((el)=>el.onclick=()=>{const font=localFonts[Number(el.dataset.localFont)];if(!font)return;selectedLocalFont=font.postscriptName;document.querySelectorAll("[data-local-font]").forEach((item)=>item.classList.toggle("active",item===el));});
}
async function addFiles(list:File[]) {
  const valid=list.filter((f)=>extensions.includes(f.name.split(".").pop()?.toLowerCase()||""));
  if(!valid.length){notice="Choose TTF, OTF, WOFF, WOFF2 or TTC files.";render();return;}
  if(stored.size+valid.length>MAX_FILES){notice="This session is limited to "+MAX_FILES+" files.";render();return;}
  let total=[...stored.values()].reduce((n,x)=>n+x.file.size,0);
  for(const file of valid){
    if(file.size>MAX_BYTES){notice=file.name+" exceeds the 50 MB per-file limit.";continue;}
    if(total+file.size>MAX_TOTAL_BYTES){notice="The 200 MB total session limit would be exceeded.";break;}
    const id=crypto.randomUUID();
    try{const buffer=await file.arrayBuffer();const hash=await sha256(buffer);stored.set(id,{file,buffer,sha256:hash});total+=file.size;pending++;worker.postMessage({id,name:file.name,size:file.size,buffer:buffer.slice(0),sha256:hash});}
    catch{notice="Could not read or fingerprint "+file.name+".";}
  }
  render();
}
worker.onmessage=(event:MessageEvent<{id:string;faces?:Face[];error?:string}>)=>{
  pending=Math.max(0,pending-1);
  if(event.data.faces){faces.push(...event.data.faces);if(!selected)selected=event.data.faces[0]?.id||"";notice="Font metadata and file fingerprint processed locally.";}
  else{stored.delete(event.data.id);notice="Could not parse font: "+(event.data.error||"Unsupported or damaged file.");}
  render();if(event.data.faces)void preview();
};
async function preview() {
  const face=current();if(!face)return;const item=stored.get(face.fileId);if(!item)return;
  try{const loaded=new FontFace(face.previewFamily,item.buffer.slice(0),{weight:String(face.weight||400),style:/italic|oblique/i.test(face.subfamily)?"italic":"normal"});await loaded.load();document.fonts.add(loaded);notice=face.fullName+" loaded for preview.";}
  catch{notice="Browser preview unavailable for this face; metadata can still be inspected.";}
  render();
}
async function previewCompare() {
  const face=faces.find((f)=>f.id===compare);if(!face)return;const item=stored.get(face.fileId);if(!item)return;
  try{const loaded=new FontFace(face.previewFamily,item.buffer.slice(0),{weight:String(face.weight||400),style:/italic|oblique/i.test(face.subfamily)?"italic":"normal"});await loaded.load();document.fonts.add(loaded);}catch{notice="The comparison face could not be previewed in this browser.";}
  render();
}
function updateCoverage() {
  const f=current();if(!f)return;const c=coverage(f.characterSet,custom||sample);
  const score=document.querySelector<HTMLElement>(".score");if(score)score.innerHTML="<b>"+c.percent+"%</b><span>"+c.present+" of "+c.total+" unique non-space code points present</span>";
  const bar=document.querySelector<HTMLElement>(".progress i");if(bar)bar.style.width=c.percent+"%";
  const missing=document.querySelector<HTMLElement>(".missing");if(missing)missing.innerHTML=c.missing.length?c.missing.slice(0,80).map((cp)=>'<span title="U+'+cp.toString(16).toUpperCase()+' · '+unicodeBlock(cp)+'">'+esc(String.fromCodePoint(cp))+"</span>").join(""):'<p class="ok">✓ All tested code points are present.</p>';
}
async function exportFile(kind:string) {
  const data=reportData();
  if(kind==="json")save("fontscope-inventory.json",JSON.stringify(data,null,2),"application/json");
  if(kind==="csv")save("fontscope-inventory.csv",csv(faces),"text/csv");
  if(kind==="css")save("fontscope-font-face.css",css(faces),"text/css");
  if(kind==="html")save("fontscope-report.html",htmlReport(),"text/html");
  if(kind==="tokens"){
    const families=[...new Set(faces.map((f)=>f.family))];
    const tokens={fontFamilies:Object.fromEntries(families.map((family)=>[family,family])),fontFaces:faces.map((f)=>({family:f.family,style:f.subfamily,weight:f.weight,source:f.fileName,variableAxes:f.axes}))};
    save("fontscope-design-tokens.json",JSON.stringify(tokens,null,2),"application/json");
  }
  if(kind==="tailwind"){
    const families=[...new Set(faces.map((f)=>f.family))];
    const config={theme:{extend:{fontFamily:Object.fromEntries(families.map((family)=>[family.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),[family,"sans-serif"]]))}}};
    save("fontscope-tailwind.config.json",JSON.stringify(config,null,2),"application/json");
  }
  if(kind==="regression"){
    const base=faces.find((f)=>f.id===compare), next=current();
    if(base&&next){
      const fields=["family","subfamily","postscriptName","version","weight","glyphCount","unitsPerEm","sha256"];
      const changes=fields.filter((key)=>String((base as any)[key]??"")!==String((next as any)[key]??"")).map((key)=>({field:key,before:(base as any)[key]??null,after:(next as any)[key]??null}));
      const oldCoverage=coverage(base.characterSet,custom||sample),newCoverage=coverage(next.characterSet,custom||sample);
      save("fontscope-regression-report.json",JSON.stringify({generatedAt:new Date().toISOString(),baseline:{file:base.fileName,face:base.fullName},candidate:{file:next.fileName,face:next.fullName},metadataChanges:changes,coverage:{baseline:oldCoverage,candidate:newCoverage,percentagePointDelta:newCoverage.percent-oldCoverage.percent},note:"This is a metadata and Unicode-presence comparison, not a visual or shaping regression test."},null,2),"application/json");
    }
  }
  if(kind==="zip"){
    const encoder=new TextEncoder(),entries:{name:string;data:Uint8Array}[]=[];
    for(const item of stored.values())entries.push({name:"fonts/"+item.file.name.replace(/[\\/]/g,"_"),data:new Uint8Array(item.buffer)});
    entries.push({name:"reports/fontscope-inventory.json",data:encoder.encode(JSON.stringify(data,null,2))});
    entries.push({name:"reports/fontscope-inventory.csv",data:encoder.encode(csv(faces))});
    entries.push({name:"reports/fontscope-font-face.css",data:encoder.encode(css(faces))});
    entries.push({name:"reports/fontscope-report.html",data:encoder.encode(htmlReport())});
    entries.push({name:"README-HANDOFF.txt",data:encoder.encode("FontScope local font handoff\nGenerated: "+new Date().toISOString()+"\nOriginal font files are in /fonts. Reports are in /reports.\nTTC collections are excluded from CSS output. Verify licensing and shaping independently.\n")});
    save("fontscope-handoff.zip",zipStore(entries));
  }
}
render();
