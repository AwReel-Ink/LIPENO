/* ===== IndexedDB ===== */
const DB=(()=>{let db;const open=()=>new Promise((r,j)=>{const q=indexedDB.open('lipeno',1);
 q.onupgradeneeded=e=>{const d=e.target.result;d.createObjectStore('children',{keyPath:'id'});
 d.createObjectStore('toys',{keyPath:'id'}).createIndex('child','childId')};
 q.onsuccess=e=>{db=e.target.result;r()};q.onerror=()=>j(q.error)});
 const tx=(s,m,f)=>new Promise((r,j)=>{const t=db.transaction(s,m),o=t.objectStore(s),q=f(o);t.oncomplete=()=>r(q&&q.result);t.onerror=()=>j(t.error)});
 return{open,all:s=>tx(s,'readonly',o=>o.getAll()),put:(s,v)=>tx(s,'readwrite',o=>o.put(v)),del:(s,k)=>tx(s,'readwrite',o=>o.delete(k)),
  byChild:id=>tx('toys','readonly',o=>o.index('child').getAll(id))}})();

/* ===== Utils ===== */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const show=el=>el.classList.remove('hidden'),hide=el=>el.classList.add('hidden');
let toastT;const toast=m=>{const t=$('#toast');t.textContent=m;show(t);clearTimeout(toastT);toastT=setTimeout(()=>hide(t),2500)};
const confirmBox=(title,text)=>new Promise(r=>{$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;const m=$('#modal-confirm');show(m);
 const done=v=>{hide(m);$('#confirm-yes').onclick=$('#confirm-no').onclick=null;r(v)};$('#confirm-yes').onclick=()=>done(true);$('#confirm-no').onclick=()=>done(false)});
const loader={show(t){$('#loader-text').textContent=t;this.set(0,'');show($('#loader'))},set(p,s){$('#progress-bar').style.width=p+'%';$('#loader-sub').textContent=s||''},hide(){hide($('#loader'))}};
const nextFrame=()=>new Promise(r=>setTimeout(r,30));
const pickFile=(input)=>new Promise(r=>{input.value='';input.onchange=()=>r([...input.files]);input.click()});
const blobToURL=b=>URL.createObjectURL(b);

/* ===== Conversion image -> webp 800px q0.8 ===== */
async function toWebp(file){
 let blob=file;
 if(/hei[cf]/i.test(file.type)||/\.hei[cf]$/i.test(file.name)){try{blob=await heic2any({blob:file,toType:'image/jpeg',quality:.9});if(Array.isArray(blob))blob=blob[0]}catch(e){}}
 let bmp;try{bmp=await createImageBitmap(blob,{imageOrientation:'from-image'})}catch(e){
  bmp=await new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=blobToURL(blob)})}
 const w=bmp.width,h=bmp.height,s=Math.min(1,800/Math.max(w,h));
 const c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);
 c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
 return new Promise(r=>c.toBlob(b=>r(b||file),'image/webp',.8));
}
async function convertMany(files,label){loader.show(label);const out=[];
 for(let i=0;i<files.length;i++){loader.set(Math.round(i/files.length*100),`${i+1} / ${files.length}`);await nextFrame();
  try{out.push(await toWebp(files[i]))}catch(e){console.error(e)}}
 loader.set(100);await nextFrame();loader.hide();return out}

/* ===== État ===== */
let children=[],toys=[],cur=null,selMode=false,sel=new Set();
const urls=new Map();const imgURL=(id,blob)=>{if(!urls.has(id))urls.set(id,blobToURL(blob));return urls.get(id)};

/* ===== Profils ===== */
async function renderChildren(){children=await DB.all('children');const all=await DB.all('toys');const L=$('#children-list');L.innerHTML='';
 children.length?hide($('#children-empty')):show($('#children-empty'));
 for(const c of children){const n=all.filter(t=>t.childId===c.id).length;const d=document.createElement('div');d.className='child-card';
  d.innerHTML=`<div class="child-avatar">${c.photo?`<img src="${imgURL('c'+c.id,c.photo)}">`:c.avatar||'🧒'}</div>
  <div class="name">${esc(c.name)}</div><div class="age">${c.age?c.age+' an'+(c.age>1?'s':''):''}</div><div class="count">🎁 ${n} jouet${n>1?'s':''}</div>
  <button class="edit-btn">✏️</button>`;
  d.onclick=()=>openList(c);d.querySelector('.edit-btn').onclick=e=>{e.stopPropagation();openChildModal(c)};L.appendChild(d)}}
const esc=s=>(s||'').replace(/[&<>"]/g,c=>({'&':'&','<':'<','>':'>','"':'"'}[c]));
let editChild=null,childPhoto=null,childAvatar='🧒';
function ageStr(c){if(!c.birth)return '';const [y,m]=c.birth.split('-').map(Number),n=new Date();
 const mo=(n.getFullYear()-y)*12+(n.getMonth()+1-m);if(mo<0)return '';if(mo<12)return mo+' mois';
 const a=Math.floor(mo/12);return a+' an'+(a>1?'s':'')+(mo%12>=6?' et demi':'')}
function openChildModal(c){editChild=c;childPhoto=c?.photo||null;childAvatar=c?.avatar||'🧒';
 $('#modal-child-title').textContent=c?'Modifier le profil':'Nouvel enfant';$('#child-name').value=c?.name||'';$('#child-birth').value=c?.birth||'';
 c?show($('#btn-delete-child')):hide($('#btn-delete-child'));prevAvatar();show($('#modal-child'))}
function prevAvatar(){$('#child-avatar-preview').innerHTML=childPhoto?`<img src="${blobToURL(childPhoto)}">`:childAvatar}
$$('.avatar-emojis button').forEach(b=>b.onclick=()=>{childAvatar=b.dataset.av;childPhoto=null;prevAvatar()});
$('#btn-child-photo').onclick=async()=>{const f=await pickFile($('#file-child'));if(!f[0])return;childPhoto=(await convertMany(f,'Préparation de la photo…'))[0];prevAvatar()};
$('#btn-save-child').onclick=async()=>{const name=$('#child-name').value.trim();if(!name)return toast('Le prénom est obligatoire');
 const c=editChild||{id:uid(),created:Date.now()};Object.assign(c,{name,birth:$('#child-birth').value||null,photo:childPhoto,avatar:childAvatar});
 urls.delete('c'+c.id);await DB.put('children',c);hide($('#modal-child'));renderChildren();if(cur&&cur.id===c.id){cur=c;headerList()}};
$('#btn-delete-child').onclick=async()=>{if(!await confirmBox('Supprimer le profil',`Supprimer ${editChild.name} et toute sa liste ?`))return;
 for(const t of await DB.byChild(editChild.id))await DB.del('toys',t.id);await DB.del('children',editChild.id);hide($('#modal-child'));renderChildren()};
$('#btn-add-child').onclick=()=>openChildModal(null);
$('#btn-info').onclick=()=>show($('#modal-info'));
$$('.modal-close').forEach(b=>b.onclick=()=>hide(b.closest('.modal')));

/* ===== Liste ===== */
const SAG=[['😈','Pas sage du tout'],['😕','Pas très sage'],['🙂','Plutôt sage'],['😊','Très sage'],['😇','Un vrai ange !']];
function headerList(){$('#list-child-name').textContent=cur.name;$('#list-child-age').textContent=cur.age?cur.age+' an'+(cur.age>1?'s':''):'';
 $('#list-avatar').innerHTML=cur.photo?`<img src="${imgURL('c'+cur.id,cur.photo)}">`:cur.avatar||'🧒';
 const d=$('#sent-date');if(cur.sentAt){d.textContent='✅ Lettre envoyée le '+new Date(cur.sentAt).toLocaleString('fr-FR',{dateStyle:'long',timeStyle:'short'});show(d)}else hide(d);
 $('#sagesse-range').value=cur.sagesse??50;updSag()}
function updSag(){const v=+$('#sagesse-range').value,i=Math.min(4,Math.floor(v/20.01));$('#sagesse-emoji').textContent=SAG[i][0];$('#sagesse-label').textContent=SAG[i][1]}
$('#sagesse-range').oninput=updSag;$('#sagesse-range').onchange=()=>{cur.sagesse=+$('#sagesse-range').value;DB.put('children',cur)};
async function openList(c){cur=c;exitSel();headerList();await renderToys();$('#screen-profiles').classList.remove('active');$('#screen-list').classList.add('active')}
$('#btn-back').onclick=()=>{exitSel();$('#screen-list').classList.remove('active');$('#screen-profiles').classList.add('active');renderChildren()};
async function renderToys(){toys=(await DB.byChild(cur.id)).sort((a,b)=>a.created-b.created);const G=$('#toys-grid');G.innerHTML='';
 toys.length?hide($('#toys-empty')):show($('#toys-empty'));
 for(const t of toys){const d=document.createElement('div');d.className='toy-card'+(sel.has(t.id)?' selected':'');
  d.innerHTML=`<div class="checkbox"></div><div class="toy-img"><img src="${imgURL(t.id,t.photo)}"></div>
  <div class="toy-info">${t.name?`<div class="toy-name">${esc(t.name)}</div>`:''}${t.store?`<div class="toy-store">${esc(t.store)}</div>`:''}</div>`;
  attachPress(d,t);G.appendChild(d)}}
function attachPress(el,t){let timer,long=false;
 const start=()=>{long=false;timer=setTimeout(()=>{long=true;if(!selMode){enterSel();navigator.vibrate?.(50)}toggleSel(t.id,el)},3000)};
 const end=()=>clearTimeout(timer);
 el.addEventListener('touchstart',start,{passive:true});el.addEventListener('touchend',end);el.addEventListener('touchmove',end,{passive:true});el.addEventListener('touchcancel',end);
 el.addEventListener('mousedown',start);el.addEventListener('mouseup',end);el.addEventListener('mouseleave',end);
 el.addEventListener('contextmenu',e=>e.preventDefault());
 el.onclick=()=>{if(long){long=false;return}selMode?toggleSel(t.id,el):openToyModal(t)}}
function toggleSel(id,el){sel.has(id)?sel.delete(id):sel.add(id);el.classList.toggle('selected',sel.has(id));$('#sel-count-top').textContent=sel.size}
function enterSel(){selMode=true;sel.clear();$('#sel-count-top').textContent=0;$('#screen-list').classList.add('selection-mode');show($('#selbar-top'));show($('#selbar-bottom'))}
function exitSel(){selMode=false;sel.clear();$('#screen-list').classList.remove('selection-mode');hide($('#selbar-top'));hide($('#selbar-bottom'));$$('.toy-card.selected').forEach(e=>e.classList.remove('selected'))}
$$('.btn-cancel-sel').forEach(b=>b.onclick=exitSel);
$$('.btn-validate-sel').forEach(b=>b.onclick=async()=>{if(!sel.size)return toast('Sélectionne au moins un jouet');const list=toys.filter(t=>sel.has(t.id));exitSel();await shareJPG(list)});

/* ===== Jouet unique ===== */
let editToy=null,toyPhoto=null;
function openToyModal(t){editToy=t;toyPhoto=t?.photo||null;$('#modal-toy-title').textContent=t?'Modifier le jouet':'Nouveau jouet';
 $('#toy-name').value=t?.name||'';$('#toy-store').value=t?.store||'';$('#toy-preview-img').src=toyPhoto?blobToURL(toyPhoto):'';
 t?show($('#btn-delete-toy')):hide($('#btn-delete-toy'));show($('#modal-toy'))}
$('#toy-photo-preview').onclick=async()=>{const f=await pickFile($('#file-toy-edit'));if(!f[0])return;toyPhoto=(await convertMany(f,'Préparation de la photo…'))[0];$('#toy-preview-img').src=blobToURL(toyPhoto)};
$('#btn-save-toy').onclick=async()=>{if(!toyPhoto)return toast('Ajoute une photo');const t=editToy||{id:uid(),childId:cur.id,created:Date.now()};
 Object.assign(t,{name:$('#toy-name').value.trim(),store:$('#toy-store').value.trim(),photo:toyPhoto});urls.delete(t.id);await DB.put('toys',t);hide($('#modal-toy'));renderToys()};
$('#btn-delete-toy').onclick=async()=>{if(!await confirmBox('Supprimer le jouet','Retirer ce jouet de la liste ?'))return;await DB.del('toys',editToy.id);hide($('#modal-toy'));renderToys()};
$('#btn-add-toy').onclick=()=>show($('#modal-source'));
$('#src-camera').onclick=()=>addSingle($('#file-camera'));$('#src-gallery').onclick=()=>addSingle($('#file-gallery'));
async function addSingle(input){hide($('#modal-source'));const f=await pickFile(input);if(!f[0])return;const b=(await convertMany(f,'Préparation de la photo…'))[0];if(!b)return toast('Photo illisible');openToyModal(null);toyPhoto=b;$('#toy-preview-img').src=blobToURL(b)}

/* ===== Import multiple ===== */
$('#btn-add-multi').onclick=async()=>{const files=await pickFile($('#file-multi'));if(!files.length)return;
 const blobs=await convertMany(files,'Préparation des photos…');if(!blobs.length)return toast('Aucune photo lisible');
 let i=0,store='';$('#multi-total').textContent=blobs.length;$('#multi-store').value='';
 const showOne=()=>{$('#multi-index').textContent=i+1;$('#multi-preview-img').src=blobToURL(blobs[i]);$('#multi-name').value='';$('#multi-store').value=store};
 const save=async()=>{store=$('#multi-store').value.trim();await DB.put('toys',{id:uid(),childId:cur.id,created:Date.now()+i,name:$('#multi-name').value.trim(),store,photo:blobs[i]})};
 $('#btn-multi-next').onclick=async()=>{await save();i++;if(i>=blobs.length){hide($('#modal-multi'));renderToys();toast(`${blobs.length} jouets ajoutés 🎁`)}else showOne()};
 $('#btn-multi-stop').onclick=async()=>{if(await confirmBox('Arrêter l\'import',`Enregistrer cette photo et ignorer les ${blobs.length-i-1} suivantes ?`)){await save();hide($('#modal-multi'));renderToys()}};
 showOne();show($('#modal-multi'))};

/* ===== Vider la liste ===== */
$('#btn-clear-list').onclick=async()=>{if(!toys.length)return toast('La liste est déjà vide');if(!await confirmBox('Vider la liste',`Supprimer les ${toys.length} jouets de ${cur.name} ?`))return;
 for(const t of toys)await DB.del('toys',t.id);cur.sentAt=null;await DB.put('children',cur);headerList();renderToys()};

/* ===== Lettre ===== */
$('#btn-send-letter').onclick=async()=>{if(!toys.length)return toast('Ajoute d\'abord des jouets 🎁');const a=$('#letter-anim');$('#letter-sign').textContent='🎁 '+cur.name;
 a.classList.remove('hidden');void a.offsetWidth;cur.sentAt=Date.now();await DB.put('children',cur);
 setTimeout(()=>{hide(a);headerList();toast('Date d\'envoi enregistrée 🎅')},7000)};

/* ===== Export A4 ===== */
const A4W=1240,A4H=1754;
async function loadImg(blob){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=blobToURL(blob)})}
async function renderPages(list){const title=`Liste de ${cur.name}${cur.age?' – '+cur.age+' an'+(cur.age>1?'s':''):''}`;
 const n=list.length,cols=n<=4?2:n<=12?3:4,perPage=cols*(cols<=2?2:cols===3?4:5),pages=[];
 for(let p=0;p<n;p+=perPage){const c=document.createElement('canvas');c.width=A4W;c.height=A4H;const x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,A4W,A4H);x.fillStyle='#C41E3A';x.fillRect(0,0,A4W,120);x.fillStyle='#D4AF37';x.fillRect(0,120,A4W,8);
  x.fillStyle='#fff';x.font='bold 54px sans-serif';x.textAlign='center';x.fillText('🎅 '+title,A4W/2,80);
  const chunk=list.slice(p,p+perPage),rows=Math.ceil(perPage/cols),m=40,gw=(A4W-m*2-(cols-1)*20)/cols,gh=(A4H-190-m-(rows-1)*20)/rows,textH=chunk.some(t=>t.name||t.store)?90:20;
  for(let i=0;i<chunk.length;i++){const t=chunk[i],cx=m+(i%cols)*(gw+20),cy=170+Math.floor(i/cols)*(gh+20);
   x.fillStyle='#fbf7f2';x.strokeStyle='#D4AF37';x.lineWidth=3;x.beginPath();x.roundRect(cx,cy,gw,gh,18);x.fill();x.stroke();
   const im=await loadImg(t.photo),bw=gw-24,bh=gh-textH-24,s=Math.min(bw/im.width,bh/im.height),w=im.width*s,h=im.height*s;
   x.drawImage(im,cx+12+(bw-w)/2,cy+12+(bh-h)/2,w,h);
   x.textAlign='center';x.fillStyle='#1a1a1a';x.font=`bold ${cols>=4?24:30}px sans-serif`;if(t.name)x.fillText(clip(x,t.name,gw-30),cx+gw/2,cy+gh-textH+30);
   x.fillStyle='#0B6623';x.font=`${cols>=4?20:26}px sans-serif`;if(t.store)x.fillText(clip(x,'🏬 '+t.store,gw-30),cx+gw/2,cy+gh-textH+65)}
  x.fillStyle='#777';x.font='22px sans-serif';x.textAlign='center';x.fillText(`LIPENO • page ${pages.length+1}/${Math.ceil(n/perPage)}`,A4W/2,A4H-14);pages.push(c)}
 return pages}
const clip=(x,s,w)=>{while(x.measureText(s).width>w&&s.length>3)s=s.slice(0,-2)+'…';return s};
async function shareJPG(list){if(!list.length)return toast('Rien à partager');loader.show('Création de l\'image…');await nextFrame();
 try{const pages=await renderPages(list);const files=await Promise.all(pages.map((c,i)=>new Promise(r=>c.toBlob(b=>r(new File([b],`liste-${cur.name}-${i+1}.jpg`,{type:'image/jpeg'})),'image/jpeg',.75))));
  loader.hide();
  if(navigator.canShare?.({files})){await navigator.share({files,title:'Liste au Père Noël de '+cur.name})}
  else{files.forEach(f=>{const a=document.createElement('a');a.href=blobToURL(f);a.download=f.name;a.click()});toast('Image(s) téléchargée(s)')}
 }catch(e){loader.hide();if(e.name!=='AbortError'){console.error(e);toast('Partage impossible, essaie le PDF')}}}
$('#btn-share-jpg').onclick=()=>shareJPG(toys);
$('#btn-share-pdf').onclick=async()=>{if(!toys.length)return toast('Rien à exporter');loader.show('Création du PDF…');await nextFrame();
 try{const pages=await renderPages(toys);const pdf=new jspdf.jsPDF({unit:'mm',format:'a4'});
  pages.forEach((c,i)=>{if(i)pdf.addPage();pdf.addImage(c.toDataURL('image/jpeg',.75),'JPEG',0,0,210,297)});
  const blob=pdf.output('blob'),f=new File([blob],`liste-${cur.name}.pdf`,{type:'application/pdf'});loader.hide();
  if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:'Liste au Père Noël'});else pdf.save(f.name)}
 catch(e){loader.hide();if(e.name!=='AbortError')toast('Erreur PDF')}};

/* ===== Init ===== */
(async()=>{await DB.open();await renderChildren();
 if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{})})();
