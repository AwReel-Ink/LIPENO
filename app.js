const  $ =s=>document.querySelector(s),app= $ ('#app');
const AV=['🧒','👧','👦','👶','🧑','🦄','🐻','🐱','🦊','🐼','🦖','🚀','⭐','🎀'];
const EMO=['😈','😕','🙂','😊','😇'];
let D,cur=null,sel=null,urls=[];
const esc=s=>(s||'').replace(/[&<>"]/g,c=>({'&':'&','<':'<','>':'>','"':'"'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const src=b=>{if(!b)return'';const u=URL.createObjectURL(b);urls.push(u);return u};
const clearU=()=>{urls.forEach(URL.revokeObjectURL);urls=[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const age=d=>{if(!d)return null;const b=new Date(d),n=new Date();let a=n.getFullYear()-b.getFullYear();if(n<new Date(n.getFullYear(),b.getMonth(),b.getDate()))a--;return a};

/* ---------- IndexedDB ---------- */
const open=()=>new Promise((r,j)=>{const q=indexedDB.open('lipeno',1);q.onupgradeneeded=()=>{const d=q.result;d.createObjectStore('p',{keyPath:'id'});d.createObjectStore('t',{keyPath:'id'}).createIndex('pid','pid')};q.onsuccess=()=>r(q.result);q.onerror=j});
const tx=(s,m,f)=>new Promise((r,j)=>{const t=D.transaction(s,m),q=f(t.objectStore(s));t.oncomplete=()=>r(q&&q.result);t.onerror=j});
const all=s=>tx(s,'readonly',o=>o.getAll());
const get=(s,k)=>tx(s,'readonly',o=>o.get(k));
const put=(s,v)=>tx(s,'readwrite',o=>o.put(v));
const del=(s,k)=>tx(s,'readwrite',o=>o.delete(k));
const toysOf=async pid=>(await tx('t','readonly',o=>o.index('pid').getAll(pid))).sort((a,b)=>a.c-b.c);

/* ---------- Progress ---------- */
function prog(t,p){const e= $ ('#prog');if(t==null){e.hidden=true;return}e.hidden=false; $ ('#progT').textContent=t;$('#progB').style.width=Math.round((p||0)*100)+'%'}

/* ---------- Images (HEIC/HEIF/JPG/PNG/…) -> WebP 0.8, 800px ---------- */
const loadJS=u=>new Promise((r,j)=>{const s=document.createElement('script');s.src=u;s.onload=r;s.onerror=j;document.head.append(s)});
const imgEl=b=>new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=URL.createObjectURL(b)});
async function decode(f){
    try{return await createImageBitmap(f)}catch(e){}
    try{return await imgEl(f)}catch(e){}
    if(!window.heic2any)await loadJS('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js');
        let b=await heic2any({blob:f,toType:'image/jpeg',quality:.92});return imgEl(Array.isArray(b)?b[0]:b)}
        async function compress(f){
            const b=await decode(f),w=b.naturalWidth||b.width,h=b.naturalHeight||b.height,k=Math.min(1,800/Math.max(w,h));
            const c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);
            c.getContext('2d').drawImage(b,0,0,c.width,c.height);
            let o=await new Promise(r=>c.toBlob(r,'image/webp',.8));
            if(!o||o.type!=='image/webp')o=await new Promise(r=>c.toBlob(r,'image/jpeg',.8)); // vieux iOS
            return o}
            function pick(multi,cam){return new Promise(r=>{const i=document.createElement('input');i.type='file';i.accept='image/*,.heic,.heif';if(multi)i.multiple=true;if(cam)i.capture='environment';i.onchange=()=>r([...i.files]);i.click()})}
            async function compressAll(files){const out=[];for(let i=0;i<files.length;i++){prog(`Conversion photo ${i+1}/${files.length}…`,i/files.length);await sleep(30);try{out.push(await compress(files[i]))}catch(e){alert('Format non supporté : '+files[i].name)}}prog('Terminé',1);await sleep(150);prog(null);return out}

            /* ---------- Modales ---------- */
            function modal(h,bind){return new Promise(r=>{const m=document.createElement('div');m.className='ov';m.innerHTML=`<div class=md>${h}</div>`;document.body.append(m);bind&&bind(m);
            m.addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(!b)return;const f={};m.querySelectorAll('[name]').forEach(i=>f[i.name]=i.value.trim());m.remove();r({v:b.dataset.r,f})})})}
            const confirmBox=async t=>(await modal(`<p>${t}</p><div class=row><button data-r=0>Annuler</button><button class=red data-r=1>Confirmer</button></div>`)).v==='1';
            const photoBtns=`<div class=row><button class=gold data-a=cam>📷 Appareil</button><button class=gold data-a=gal>🖼️ Galerie</button></div>`;

            /* ---------- Accueil / profils ---------- */
            async function home(){cur=null;sel=null;clearU();const ps=(await all('p')).sort((a,b)=>a.c-b.c);
                app.innerHTML=`<header><span style="width:40px"></span><h1>🎅 LIPENO 🎄</h1><button class=ico id=inf>i</button></header>
                <div class=grid>${ps.map(p=>`<div class=prof data-id=${p.id}><div class=av>${p.photo?`<img src="${src(p.photo)}">`:(p.avatar||'🧒')}</div><b>${esc(p.name)}</b><small>${p.birth?age(p.birth)+' an(s)':''}</small><button class=pen data-e=${p.id}>✏️</button></div>`).join('')}
                <div class="prof add" id=addp>+</div></div>`;
                $ ('#inf').onclick=help; $ ('#addp').onclick=()=>profForm();
                app.querySelectorAll('.prof[data-id]').forEach(e=>e.onclick=ev=>{const id=e.dataset.id;ev.target.closest('.pen')?profForm(id):openList(id)})}

                async function profForm(id){const p=id?await get('p',id):{id:uid(),c:Date.now(),name:'',birth:'',avatar:'🧒',photo:null,sage:2};
                let photo=p.photo,avatar=p.avatar;
                const r=await modal(`<h3>${id?'Modifier':'Nouveau'} profil</h3>
                <input name=name placeholder="Prénom *" value="${esc(p.name)}">
                <label>Date de naissance (facultatif)<input type=date name=birth value="${p.birth||''}"></label>
                <p style="margin:0">Avatar (facultatif)</p><div class=avs>${AV.map(a=>`<span class="${a===avatar?'on':''}">${a}</span>`).join('')}</div>
                <p style="margin:0">ou photo :</p><img class=pv id=pp ${photo?`src="${src(photo)}"`:'hidden'}>${photoBtns}
                <div class=row><button data-r=0>Annuler</button><button class=green data-r=1>Enregistrer</button></div>
                ${id?'<button class=red data-r=del>🗑️ Supprimer le profil</button>':''}`,m=>{
                    m.querySelectorAll('.avs span').forEach(s=>s.onclick=()=>{m.querySelectorAll('.avs span').forEach(x=>x.classList.remove('on'));s.classList.add('on');avatar=s.textContent;photo=null;m.querySelector('#pp').hidden=true});
                    m.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{const f=await pick(false,b.dataset.a==='cam');if(!f.length)return;const [c]=await compressAll(f);if(c){photo=c;const i=m.querySelector('#pp');i.src=src(c);i.hidden=false}})});
                if(r.v==='del'){if(await confirmBox(`Supprimer le profil de ${esc(p.name)} et toute sa liste ?`)){for(const t of await toysOf(p.id))await del('t',t.id);await del('p',p.id)}}
                else if(r.v==='1'){if(!r.f.name)return alert('Le prénom est obligatoire'),profForm(id);Object.assign(p,{name:r.f.name,birth:r.f.birth,avatar,photo});await put('p',p)}
                cur?openList(p.id):home()}

                function help(){modal(`<h3>🎅 Mode d'emploi</h3>
                    <p><b>+</b> : créer un profil enfant. <b>✏️</b> : modifier / supprimer.</p>
                    <p>Dans la liste : <b>+</b> ajoute une photo (appareil ou galerie), <b>+++</b> ajoute une série de photos avec le même magasin pré-rempli.</p>
                    <p><b>Appui simple</b> sur un jouet : modifier / supprimer.</p>
                    <p><b>Appui long (3 s)</b> sur un jouet : <b>mode sélection</b>. Cochez les jouets à envoyer à la famille puis <b>Valider</b> : seuls ceux-ci seront partagés.</p>
                    <p>✉️ « Envoyer la lettre » : animation magique pour l'enfant (la liste reste modifiable).</p>
                    <p>📤 Partage en JPG (A4), 📄 PDF en secours. 🗑️ « Vider la liste » après Noël.</p>
                    <p>Fonctionne hors-ligne une fois installée (menu du navigateur › « Ajouter à l'écran d'accueil »).</p>
                    <button class=green data-r=0>Compris !</button>`)}

                    /* ---------- Liste ---------- */
                    async function openList(id){cur=id;clearU();const p=await get('p',id),toys=await toysOf(id),a=age(p.birth);
                        const sb=sel?`<div class=row><button class=red data-s=0>Annuler</button><button class=green data-s=1>✔ Valider (${sel.size})</button></div>`:'';
                        app.innerHTML=`<header><button class=ico id=back>‹</button><h1>${esc(p.name)}${a!=null?` · ${a} an(s)`:''}</h1><button class=ico id=ep>✏️</button></header>
                        <div class=wrap>
                        <button class=blue id=send>✉️ Envoyer la lettre au Père Noël</button>
                        ${p.sent?`<p class=sent>📬 Lettre envoyée le ${new Date(p.sent).toLocaleString('fr-FR',{dateStyle:'long',timeStyle:'short'})}</p>`:''}
                        <div class=sage><div class=emo>${EMO.map((e,i)=>`<span class="${i==p.sage?'on':''}">${e}</span>`).join('')}</div>
                        <input type=range min=0 max=4 step=1 value=${p.sage??2} id=sg><div class=lbl><span>Pas sage</span><span>Très sage</span></div></div>
                        <div class=row><button class=gold id=sh>📤 Partager</button><button id=pdf>📄 PDF</button></div>
                        ${sb}</div>
                        <div class=toys>${toys.length?toys.map(t=>`<div class="card ${sel&&sel.has(t.id)?'on':''}" data-id=${t.id}>${sel?'<span class=chk>✓</span>':''}<img src="${src(t.img)}"><b>${esc(t.name)}</b><small>${t.store?'🏬 '+esc(t.store):''}</small></div>`).join(''):'<p class=empty>Aucun jouet… appuie sur + 🎁</p>'}</div>
                        <div class=wrap>${sb}<button class=red id=clr>🗑️ Vider la liste</button></div>
                        <div class=fab><button id=a1>+</button><button id=a3>+++</button></div>`;
                        $ ('#back').onclick=home; $ ('#ep').onclick=()=>profForm(id);
                        $('#sg').oninput=e=>{p.sage=+e.target.value;app.querySelectorAll('.emo span').forEach((s,i)=>s.classList.toggle('on',i==p.sage))};
                        $('#sg').onchange=()=>put('p',p);
                        $('#send').onclick=async()=>{await letterAnim();p.sent=Date.now();await put('p',p);openList(id)};
                        $('#sh').onclick=()=>share(p,toys);
                        $ ('#pdf').onclick=async()=>{if(!toys.length)return alert('Liste vide');const b=await render(p,toys);dl(await pdf(b),`liste- $ {p.name}.pdf`)};
                        $('#clr').onclick=async()=>{if(toys.length&&await confirmBox('Vider toute la liste de '+esc(p.name)+' ?')){for(const t of toys)await del('t',t.id);openList(id)}};
                        $ ('#a1').onclick=addOne; $ ('#a3').onclick=addMany;
                        app.querySelectorAll('[data-s]').forEach(b=>b.onclick=async()=>{if(b.dataset.s==='1'){const s=toys.filter(t=>sel.has(t.id));if(!s.length)return alert('Aucun jouet coché');await share(p,s)}sel=null;openList(id)});
                        bindCards(app.querySelector('.toys'))}

                        function bindCards(el){let t,fired=false,sx,sy;const stop=()=>{clearTimeout(t);el.querySelectorAll('.press').forEach(c=>c.classList.remove('press'))};
                        el.oncontextmenu=e=>e.preventDefault();
                        el.onpointerdown=e=>{const c=e.target.closest('.card');if(!c)return;fired=false;sx=e.clientX;sy=e.clientY;if(!sel)c.classList.add('press');
                            t=setTimeout(()=>{fired=true;stop();if(!sel){navigator.vibrate?.(80);sel=new Set([c.dataset.id]);openList(cur)}},3000)};
                            el.onpointermove=e=>{if(Math.hypot(e.clientX-sx,e.clientY-sy)>12)stop()};
                            el.onpointerup=el.onpointercancel=stop;
                            el.onclick=e=>{const c=e.target.closest('.card');if(!c)return;if(fired){fired=false;return}const id=c.dataset.id;
                            if(sel){sel.has(id)?sel.delete(id):sel.add(id);c.classList.toggle('on');app.querySelectorAll('[data-s="1"]').forEach(b=>b.textContent=`✔ Valider (${sel.size})`)}else editToy(id)}}

                            /* ---------- Jouets ---------- */
                            async function toyModal(t,title,btns){let img=t.img;
                                const r=await modal(`<h3>${title}</h3><img class=pv id=tp src="${src(img)}">${photoBtns}
                                <input name=name placeholder="Nom du jouet (facultatif)" value="${esc(t.name)}">
                                <input name=store placeholder="Magasin (facultatif)" value="${esc(t.store)}">${btns}`,m=>{
                                    m.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{const f=await pick(false,b.dataset.a==='cam');if(!f.length)return;const [c]=await compressAll(f);if(c){img=c;m.querySelector('#tp').src=src(c)}})});
                                t.img=img;return r}
                                const newToy=(img,store='')=>({id:uid(),pid:cur,c:Date.now(),img,name:'',store});
                                async function addOne(){const src_=await modal(`<h3>Ajouter un jouet</h3>${photoBtns.replace(/data-a/g,'data-r')}<button data-r=0>Annuler</button>`);
                                if(src_.v==='0')return;const f=await pick(false,src_.v==='cam');if(!f.length)return;const [img]=await compressAll(f);if(!img)return;
                                const t=newToy(img),r=await toyModal(t,'Nouveau jouet 🎁',`<div class=row><button data-r=0>Annuler</button><button class=green data-r=1>Ajouter</button></div>`);
                                    if(r.v==='1'){t.name=r.f.name;t.store=r.f.store;await put('t',t)}openList(cur)}
                                    async function addMany(){const f=await pick(true);if(!f.length)return;const imgs=await compressAll(f);let store='';
                                        for(let i=0;i<imgs.length;i++){const t=newToy(imgs[i],store),last=i===imgs.length-1;
                                            const r=await toyModal(t,`Jouet ${i+1}/${imgs.length}`,`<div class=row><button data-r=skip>Ignorer</button><button class=green data-r=1>${last?'Terminer':'Suivant ›'}</button></div><button data-r=stop>Arrêter l'import</button>`);
                                            if(r.v==='stop')break;if(r.v==='skip')continue;t.name=r.f.name;t.store=store=r.f.store;t.c=Date.now()+i;await put('t',t)}
                                            openList(cur)}
                                            async function editToy(id){const t=await get('t',id),r=await toyModal(t,'Modifier le jouet',`<div class=row><button data-r=0>Annuler</button><button class=green data-r=1>Enregistrer</button></div><button class=red data-r=del>🗑️ Supprimer</button>`);
                                                if(r.v==='1'){t.name=r.f.name;t.store=r.f.store;await put('t',t)}
                                                if(r.v==='del'&&await confirmBox('Supprimer ce jouet ?'))await del('t',id);openList(cur)}

                                                /* ---------- Animation lettre (7 s) ---------- */
                                                function letterAnim(){return new Promise(r=>{const a=document.createElement('div');a.className='anim';
                                                    a.innerHTML=Array.from({length:30},()=>`<span class=snow style="left:${Math.random()*100}%;animation-duration:${3+Math.random()*4}s;animation-delay:-${Math.random()*5}s">❄</span>`).join('')+
                                                    `<div class=pole>🎅🏠<small>Pôle Nord</small></div><div class=paper>Cher Père Noël,<br><br>voici ma liste…<br><br>🎁🧸🚂</div><div class=env>✉️</div><p class=msg>🎄 Le Père Noël a reçu ta lettre ! 🎄</p>`;
                                                    document.body.append(a);setTimeout(()=>{a.remove();r()},8500)})}

                                                    /* ---------- Export A4 JPG (0.75) ---------- */
                                                    function fit(x,s,w){if(x.measureText(s).width<=w)return s;while(s&&x.measureText(s+'…').width>w)s=s.slice(0,-1);return s+'…'}
                                                    async function render(p,toys){const W=1240,H=1754,C=3,R=4,per=C*R,n=Math.ceil(toys.length/per),out=[],a=age(p.birth);
                                                        const title=`Liste de ${p.name}${a!=null?` – ${a} an${a>1?'s':''}`:''}`;
                                                        for(let pg=0;pg<n;pg++){const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
                                                            x.fillStyle='#fff';x.fillRect(0,0,W,H);x.fillStyle='#c8102e';x.fillRect(0,0,W,170);x.fillStyle='#d4af37';x.fillRect(0,170,W,8);
                                                            x.fillStyle='#fff';x.textAlign='center';x.font='bold 64px Georgia';x.fillText('🎅 '+fit(x,title,W-160),W/2,110);
                                                            x.font='28px sans-serif';x.fillStyle='#fff8';if(n>1)x.fillText(`Page ${pg+1}/${n}`,W/2,155);
                                                            const M=50,G=20,top=200,cw=(W-2*M-(C-1)*G)/C,ch=(H-top-70-(R-1)*G)/R;
                                                            const items=toys.slice(pg*per,pg*per+per);
                                                            for(let i=0;i<items.length;i++){prog(`Création de l'image ${pg+1}/${n}…`,(pg*per+i)/toys.length);await sleep(10);
                                                            const t=items[i],cx=M+(i%C)*(cw+G),cy=top+Math.floor(i/C)*(ch+G);
                                                            x.strokeStyle='#d4af37';x.lineWidth=4;x.strokeRect(cx,cy,cw,ch);
                                                            let im;try{im=await createImageBitmap(t.img)}catch(e){im=await imgEl(t.img)}
                                                            const iw=im.width,ih=im.height,bw=cw-20,bh=ch-90,k=Math.min(bw/iw,bh/ih),dw=iw*k,dh=ih*k;
                                                            x.drawImage(im,cx+10+(bw-dw)/2,cy+10+(bh-dh)/2,dw,dh); // image jamais coupée
                                                            x.fillStyle='#111';x.font='bold 30px sans-serif';x.fillText(fit(x,t.name||'',cw-20),cx+cw/2,cy+ch-45);
                                                            x.fillStyle='#0b6623';x.font='24px sans-serif';if(t.store)x.fillText(fit(x,'🏬 '+t.store,cw-20),cx+cw/2,cy+ch-14)}
                                                            x.fillStyle='#0b6623';x.fillRect(0,H-40,W,40);x.fillStyle='#d4af37';x.font='22px sans-serif';x.fillText('LIPENO – Liste du Père Noël 🎄',W/2,H-12);
                                                            out.push(await new Promise(r=>c.toBlob(r,'image/jpeg',.75)))}
                                                            prog(null);return out}

                                                            /* ---------- PDF (sans librairie) ---------- */
                                                            async function pdf(blobs){const enc=new TextEncoder(),parts=[],offs=[];let len=0;
                                                                const add=d=>{const u=typeof d==='string'?enc.encode(d):d;parts.push(u);len+=u.length};
                                                                const obj=(id,f)=>{offs[id]=len;add(`${id} 0 obj\n`);f();add('\nendobj\n')};
                                                                const n=blobs.length;add('%PDF-1.4\n');
                                                                obj(1,()=>add('<</Type/Catalog/Pages 2 0 R>>'));
                                                                obj(2,()=>add(`<</Type/Pages/Count ${n}/Kids[${blobs.map((_,i)=>`${3+3*i} 0 R`).join(' ')}]>>`));
                                                                for(let i=0;i<n;i++){const d=new Uint8Array(await blobs[i].arrayBuffer()),p=3+3*i,cs=`q 595 0 0 842 0 0 cm /Im${i} Do Q`;
                                                                obj(p,()=>add(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</XObject<</Im${i} ${p+1} 0 R>>>>/Contents ${p+2} 0 R>>`));
                                                                obj(p+1,()=>{add(`<</Type/XObject/Subtype/Image/Width 1240/Height 1754/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${d.length}>>\nstream\n`);add(d);add('\nendstream')});
                                                                obj(p+2,()=>add(`<</Length ${cs.length}>>\nstream\n${cs}\nendstream`))}
                                                                const xr=len,tot=3+3*n;add(`xref\n0 ${tot}\n0000000000 65535 f \n`);
                                                                for(let k=1;k<tot;k++)add(String(offs[k]).padStart(10,'0')+' 00000 n \n');
                                                                add(`trailer\n<</Size ${tot}/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF`);
                                                                return new Blob(parts,{type:'application/pdf'})}

                                                                /* ---------- Partage ---------- */
                                                                function dl(b,name){const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
                                                                async function share(p,toys){if(!toys.length)return alert('Liste vide');
                                                                    const blobs=await render(p,toys),files=blobs.map((b,i)=>new File([b],`liste-${p.name}-${i+1}.jpg`,{type:'image/jpeg'}));
                                                                    if(navigator.canShare?.({files})){try{await navigator.share({files,title:'Liste de '+p.name});return}catch(e){if(e.name==='AbortError')return}}
                                                                    if(await confirmBox('Partage JPG impossible sur cet appareil. Télécharger en PDF ?'))dl(await pdf(blobs),`liste-${p.name}.pdf`)}

                                                                    /* ---------- Démarrage ---------- */
                                                                    (async()=>{D=await open();navigator.storage?.persist?.();home();
                                                                        if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js')})();
