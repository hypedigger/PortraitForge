let S=null, mode='matrix', style=null, popCtx=null;
let todoOnly=false, curStem=null, hoverCell=null, sexFilter='';
function effSexOf(stem){return (S.meta[stem]&&S.meta[stem].sex)||'male';}
function setSexFilter(v){
  sexFilter=v;
  for(const b of document.querySelectorAll('.sfb'))
    b.classList.toggle('on',b.dataset.v===v);
  render();
  if(mode==='prog'){_progWallKey='';progUpdate();}
}

async function refresh(){ S = await (await fetch('/api/state')).json(); }

function visStyles(){
  const hid=(S.settings&&S.settings.hidden_styles)||[];
  return S.styles.filter(st=>!hid.includes(st.key));
}
let styleFilter='';
function buildStyleSel(){
  const sel=document.getElementById('styleSel');
  const prev=style;
  const vs=colStyles().filter(st=>st.label.toLowerCase().includes(styleFilter));
  sel.innerHTML='';
  for(const st of vs){const o=document.createElement('option');o.value=st.key;
    o.textContent=st.label;sel.appendChild(o);}
  style=vs.some(st=>st.key===prev)?prev:(vs[0]?vs[0].key:null);
  if(style) sel.value=style;
}
async function load(){
  await refresh();
  i18nInit((S.settings&&S.settings.lang)||'fr');
  applyThumbSize();
  buildStyleSel();
  document.getElementById('styleSel').onchange=async(e)=>{style=e.target.value;popSyncStyle();const y=window.scrollY;await refresh();render();window.scrollTo(0,y);};
  document.getElementById('styleFilter').oninput=async(e)=>{
    styleFilter=e.target.value.toLowerCase();
    const prev=style;
    buildStyleSel(); updateProgress();
    if(style!==prev){popSyncStyle();await refresh();}
    render();
  };
  document.getElementById('btnGame').textContent='🎮 '+(S.game?S.game.name:'?');
  /* F5 : restaurer l'onglet, le style, les filtres et le defilement */
  let ui=null;
  try{ui=JSON.parse(localStorage.getItem('pf_ui')||'null');}catch(e){}
  if(ui&&ui.game===_uiGameKey()){
    sexFilter=ui.sexFilter||'';
    for(const b of document.querySelectorAll('.sfb')) b.classList.toggle('on',b.dataset.v===sexFilter);
    todoOnly=!!ui.todoOnly;
    document.getElementById('todoChk').checked=todoOnly;
    if(ui.style&&colStyles().some(st=>st.key===ui.style)){
      style=ui.style;
      document.getElementById('styleSel').value=ui.style;
    }
    await setMode(['matrix','detail','mix','prog','tri'].includes(ui.mode)?ui.mode:'matrix');
    setTimeout(()=>{
      window.scrollTo(0,ui.y||0);
      const mw=document.querySelector('.mwrap');
      if(mw){mw.scrollLeft=ui.mx||0;mw.scrollTop=ui.my||0;}
    },250);
  }else{
    setMode('matrix');
  }
  startQueueFeed();
  /* le dernier jeu utilise est reouvert automatiquement ; le choix ne
     s'affiche au demarrage que s'il n'y a aucun jeu configure */
  if(!S.games||!S.games.length){gameOpen();gameAddToggle(true);}
}
function _uiGameKey(){return S&&S.game?(S.game.id||S.game.name||''):'';}
function saveUiState(){
  try{
    const mw=document.querySelector('.mwrap');
    localStorage.setItem('pf_ui',JSON.stringify({
      game:_uiGameKey(), mode:mode, style:style,
      sexFilter:sexFilter, todoOnly:todoOnly,
      y:window.scrollY, mx:mw?mw.scrollLeft:0, my:mw?mw.scrollTop:0}));
  }catch(e){}
}
window.addEventListener('beforeunload',saveUiState);

/* ---------- jeux ---------- */
function gameOpen(){
  const list=document.getElementById('gameList');
  list.innerHTML='';
  if(!S.games.length){
    list.innerHTML='<div style="color:#9ab;font-size:13px;padding:8px 0">Aucun jeu configuré — ajoute ton premier jeu ci-dessous.</div>';
  }
  for(const g of S.games){
    const cur=S.game&&g.id===S.game.id;
    const d=document.createElement('div');
    d.className='gamecard'+(cur?' cur':'');
    d.title=cur?'jeu actuellement ouvert':'ouvrir ce jeu';
    d.innerHTML='<div class="gtitle"><span class="gname">'+g.name+'</span>'+
      (cur?'<span class="gcur">jeu actuel</span>':'')+'</div>'+
      '<div class="gpath"><span class="gk">travail</span>'+g.work_dir+'</div>'+
      (g.pack_dir?('<div class="gpath"><span class="gk">destination</span>'+g.pack_dir+'</div>'):
       '<div class="gpath"><span class="gk">destination</span><i>non définie</i></div>');
    d.onclick=()=>gameSelect(g.id);
    list.appendChild(d);
  }
  document.getElementById('gaErr').textContent='';
  gameAddToggle(false);
  document.getElementById('gamepop').style.display='block';
  document.getElementById('gamepopbg').style.display='block';
}
function gameAddToggle(force){
  const f=document.getElementById('gameAddForm');
  const show=(typeof force==='boolean')?force:(f.style.display==='none');
  f.style.display=show?'flex':'none';
  document.getElementById('btnGameAdd').style.display=show?'none':'';
}
async function pickDir(inputId){
  const r=await (await fetch('/api/pick_dir',{method:'POST',body:'{}'})).json();
  if(r.path) document.getElementById(inputId).value=r.path;
}
function gameClose(){
  document.getElementById('gamepop').style.display='none';
  document.getElementById('gamepopbg').style.display='none';
}
async function gameSelect(id){
  if(S.game&&id===S.game.id){gameClose();return;}
  await fetch('/api/games_select',{method:'POST',body:JSON.stringify({id:id})});
  gameClose();
  await refresh();
  applyThumbSize(); buildStyleSel();
  document.getElementById('btnGame').textContent='🎮 '+(S.game?S.game.name:'?');
  _taggerAsked=false;
  setMode('tri'); /* premier ecran d'un jeu : trier les textures */
  toast('Jeu : '+(S.game?S.game.name:''));
}
async function gameAdd(){
  const r=await (await fetch('/api/games_add',{method:'POST',body:JSON.stringify({
    name:document.getElementById('gaName').value,
    work_dir:document.getElementById('gaWork').value,
    pack_dir:document.getElementById('gaPack').value})})).json();
  if(!r.ok){document.getElementById('gaErr').textContent=r.error||'erreur';return;}
  gameClose();
  await refresh();
  applyThumbSize(); buildStyleSel();
  document.getElementById('btnGame').textContent='🎮 '+(S.game?S.game.name:'?');
  _taggerAsked=false;
  setMode('tri'); /* premier ecran d'un nouveau jeu : trier les textures */
  toast('Jeu ajouté : '+(S.game?S.game.name:''));
}

let _taggerAsked=false;
/* position de defilement memorisee par onglet (fenetre + matrice interne) */
let _scrollByMode={};
function _saveScroll(m){
  const mw=document.querySelector('.mwrap');
  _scrollByMode[m]={y:window.scrollY,mx:mw?mw.scrollLeft:0,my:mw?mw.scrollTop:0};
}
function _restoreScroll(m){
  const s=_scrollByMode[m];
  if(!s) return;
  window.scrollTo(0,s.y);
  const mw=document.querySelector('.mwrap');
  if(mw){mw.scrollLeft=s.mx;mw.scrollTop=s.my;}
}
async function setMode(m){
  const prev=mode;
  _saveScroll(prev);
  mode=m; render();
  _restoreScroll(m);
  if(prev==='tri'&&m!=='tri'&&S&&!S.tags_done&&!_taggerAsked){
    _taggerAsked=true;
    if(confirm(T('Les portraits de ce jeu n\'ont jamais été analysés (tags auto : couleurs de cheveux, yeux, accessoires — améliore la fidélité des générations).\n\nLancer l\'analyse maintenant ? (~1-2 min, en arrière-plan)'))){
      runTagger();
    }
  }
  await refresh(); render();
  _restoreScroll(m);
}

async function navStyle(d){
  const sel=document.getElementById('styleSel');
  const n=sel.options.length;
  sel.selectedIndex=(sel.selectedIndex+d+n)%n;
  style=sel.value;
  popSyncStyle();
  const y=window.scrollY;
  await refresh(); render();
  window.scrollTo(0,y); /* rester au meme niveau de scroll */
}

function visiblePortraits(){
  let ps=S.portraits.filter(p=>!S.excluded.includes(p.stem));
  if(sexFilter) ps=ps.filter(p=>effSexOf(p.stem)===sexFilter);
  if(todoOnly&&mode==='detail') ps=ps.filter(p=>!S.selections[style+'/'+p.stem]);
  else if(todoOnly&&mode==='matrix')
    ps=ps.filter(p=>!visStyles().some(st=>S.selections[st.key+'/'+p.stem]));
  /* "a traiter" en Selection globale : aucune image exportable du tout
     (ni choix explicite ni choix auto) — coherent avec la colonne Choix */
  else if(todoOnly&&mode==='mix') ps=ps.filter(p=>!finalChoice(p.stem));
  return ps;
}
/* message quand le filtre "a traiter" vide entierement la vue */
function todoEmptyHtml(){
  return '<div class="hint" style="margin:40px auto;max-width:520px;text-align:center;font-size:15px;line-height:1.7">'+
    '✅ <b>Rien à traiter</b> — le filtre <b>« à traiter »</b> est actif'+
    (sexFilter?' (et un filtre de sexe aussi)':'')+',<br>et tous les personnages concernés sont déjà traités.'+
    '<br><button class="primary" style="margin-top:12px" '+
    'onclick="document.getElementById(\'todoChk\').checked=false;todoOnly=false;render()">Afficher tous les personnages</button></div>';
}

/* selection explicite uniquement (pas de defaut) */
function effSel(key){
  const files=S.variants[key]||[];
  const ex=S.selections[key];
  return (ex&&files.includes(ex))?ex:null;
}
/* image a AFFICHER pour une cellule : selection explicite sinon la 1ere */
function dispSel(key){
  return effSel(key)||((S.variants[key]||[])[0]||null);
}
/* variante pour la Selection globale : selection explicite sinon la plus recente */
function dispSelMix(key){
  const files=S.variants[key]||[];
  return effSel(key)||(files[files.length-1]||null);
}
/* choix final pour un perso : final explicite, sinon 1er style avec une
   selection explicite */
function finalChoice(stem){
  const ref=S.final[stem];
  if(ref==='__original__')
    return {style:'__original__',file:null,explicit:true,original:true};
  if(ref){
    const [sk,f]=ref.split(/\/(.+)/);
    if((S.variants[sk+'/'+stem]||[]).includes(f)) return {style:sk,file:f,explicit:true};
  }
  for(const st of colStyles()){
    const f=effSel(st.key+'/'+stem);
    if(f) return {style:st.key,file:f,explicit:false};
  }
  return null;
}
function countVersions(stem){
  let n=0;
  for(const st of visStyles()) n+=(S.variants[st.key+'/'+stem]||[]).length;
  return n;
}

function updateProgress(){
  const ps=S.portraits.filter(p=>!S.excluded.includes(p.stem));
  const total=ps.length; let overall=0;
  const sel=document.getElementById('styleSel');
  for(const o of sel.options){
    const n=ps.filter(p=>S.variants[o.value+'/'+p.stem]).length;
    overall+=n;
    o.textContent=styleLabel(o.value)+' — '+n+'/'+total;
  }
  /* le % global de la file est gere par pollStatus (batch en cours) */
}

function selCountUpd(){
  const ps=S.portraits.filter(p=>!S.excluded.includes(p.stem));
  let n=0;
  if(mode==='detail'){
    for(const p of ps) if(effSel(style+'/'+p.stem)) n++;
  }else{
    for(const p of ps) if(finalChoice(p.stem)) n++;
  }
  document.getElementById('selCount').textContent=n;
}

function render(){
  document.getElementById('tabM').className=(mode==='matrix')?'on':'';
  document.getElementById('tabD').className=(mode==='detail')?'on':'';
  document.getElementById('tabX').className=(mode==='mix')?'on':'';
  document.getElementById('tabP').className=(mode==='prog')?'on':'';
  document.getElementById('tabT').className=(mode==='tri')?'on':'';
  document.getElementById('styleWrap').style.display=(mode==='detail')?'':'none';
  document.getElementById('btnMissing').style.display=(mode==='detail')?'':'none';
  document.getElementById('btnAutoSel').style.display=(mode==='detail')?'':'none';
  document.getElementById('btnGenAll').style.display=(mode==='detail')?'':'none';
  document.getElementById('btnDelUnsel').style.display=(mode==='detail')?'':'none';
  document.getElementById('btnDelStyle').style.display=(mode==='detail')?'':'none';
  document.getElementById('genAllN').textContent=(S.settings&&S.settings.gen_all_count)||2;
  document.getElementById('todoWrap').style.display=(mode==='tri'||mode==='prog')?'none':'flex';
  document.getElementById('subbar').style.display='flex'; /* filtre sexe dispo partout */
  document.getElementById('btnExport').style.display=(mode==='detail'||mode==='mix')?'':'none';
  document.getElementById('expLabel').textContent=(mode==='detail')?'Exporter ce style':'Exporter la sélection';
  const sl=document.getElementById('searchLinks');
  sl.style.display=(mode==='detail')?'':'none';
  if(mode==='detail'&&style){
    const q=encodeURIComponent(styleLabel(style)+' artwork');
    document.getElementById('lnkG').href='https://www.google.com/search?tbm=isch&q='+q;
    document.getElementById('lnkY').href='https://yandex.com/images/search?text='+q;
  }
  const hints={
    matrix:"aperçu de tous les styles — clic sur une image ou un nom d'artiste pour ouvrir sa fiche",
    mix:"une image par personnage, tous artistes confondus : clic gauche = choisir l'image exportée pour ce perso (cellule verte), clic droit = menu, badge bleu = versions perso/artiste",
    detail:""};
  document.getElementById('tabHint').textContent=hints[mode]||'';
  selCountUpd(); updateProgress();
  hideCtx();
  const hh=document.querySelector('header').offsetHeight;
  document.documentElement.style.setProperty('--headh',(hh+8)+'px');
  const oldMw=document.querySelector('.mwrap');
  const scroll=oldMw?{t:oldMw.scrollTop,l:oldMw.scrollLeft}:null;
  if(mode==='matrix') renderMatrix();
  else if(mode==='detail') renderDetail();
  else if(mode==='mix') renderMix();
  else if(mode==='prog') renderProg();
  else renderTri();
  if(scroll){
    const mw=document.querySelector('.mwrap');
    if(mw){mw.scrollTop=scroll.t;mw.scrollLeft=scroll.l;}
  }
}

/* ---------- vue d'ensemble (matrice) ---------- */
function cellImage(key){ return dispSel(key); }
/* synchronise la barre horizontale du haut avec le conteneur du tableau */
function setupMwrap(){
  const mw=document.querySelector('.mwrap');
  const hs=document.getElementById('hscroll');
  if(!mw||!hs) return;
  const t=mw.querySelector('table');
  if(t) hs.firstElementChild.style.width=t.scrollWidth+'px';
  hs.onscroll=()=>{mw.scrollLeft=hs.scrollLeft;};
  mw.addEventListener('scroll',()=>{hs.scrollLeft=mw.scrollLeft;});
  hs.scrollLeft=mw.scrollLeft;
  /* garantir que la barre du bas reste dans l'ecran (stats/marges comprises) */
  mw.style.maxHeight=Math.max(200,window.innerHeight-mw.getBoundingClientRect().top-6)+'px';
}
function measureMixSticky(){
  const t=document.querySelector('.mixtbl');
  const mw=document.querySelector('.mwrap');
  if(!t||!t.rows.length) return;
  if(mw&&mw.scrollLeft>0) return; /* offsets faux si les colonnes sont deja epinglees */
  const cells=t.rows[0].cells;
  document.documentElement.style.setProperty('--mixl2',cells[1].offsetLeft+'px');
  document.documentElement.style.setProperty('--mixl3',cells[2].offsetLeft+'px');
}
function renderMatrix(){
  const c=document.getElementById('content');
  if(todoOnly&&!visiblePortraits().length){c.innerHTML=todoEmptyHtml();return;}
  /* en Vue d'ensemble la colonne Custom est TOUJOURS presente : c'est le
     point d'entree de l'upload d'images perso */
  const cols=[{key:'_custom',label:'✨ Custom'}].concat(visStyles());
  let h='<div id="hscroll" class="hscroll"><div></div></div><div class="mwrap"><table class="matrix mixtbl"><tr><th>Perso</th><th>Original</th><th data-tip="image qui sera exportée pour ce personnage">Choix</th>';
  for(const st of cols) h+='<th class="mstyle" onclick="gotoStyle(\''+st.key+'\')" data-tip="clic gauche : ouvrir la vue Par style pour cet artiste">'+st.label+'</th>';
  h+='</tr>';
  for(const p of visiblePortraits()){
    h+='<tr><td class="mstem" onclick="verOpenAll(event,\''+p.stem+'\')" data-tip="clic gauche : toutes les versions de ce portrait (tous styles)">'+p.stem+'</td>';
    h+='<td><img class="oimg thumb" loading="lazy" src="/thumb/original/'+p.stem+'" '+
      'style="cursor:pointer" data-tip="clic gauche : toutes les versions de ce portrait (tous styles) · clic droit : zoom" '+
      'onclick="verOpenAll(event,\''+p.stem+'\')"></td>';
    h+=choiceCell(p.stem,finalChoice(p.stem));
    for(const st of cols){
      const key=st.key+'/'+p.stem;
      const f=cellImage(key);
      const isSel=!!(f&&S.selections[key]===f);
      const isCust=(st.key==='_custom');
      const tip=isCust?'clic gauche : uploader des images dans la catégorie ✨ Custom de ce portrait · clic droit : zoom'
                      :'clic gauche : fiche de l\'artiste sur ce personnage · clic droit : zoom';
      const act=isCust?('uploadFor(\''+p.stem+'\')'):('gotoDetail(\''+st.key+'\',\''+p.stem+'\')');
      if(f){
        const n=(S.variants[key]||[]).length;
        h+='<td class="'+(isSel?'msel':'')+'"><div style="position:relative;display:inline-block">'+
          (n>1?('<span class="vbadge '+badgeClass(n)+'" onclick="verOpen(event,\''+p.stem+'\',\''+st.key+'\')" data-tip="clic gauche : choisir la version pour ce style">'+n+'</span>'):'')+
          '<img class="thumb" loading="lazy" src="/thumb/var/'+key+'/'+f+'" data-ref="'+key+'/'+f+'" data-tip="'+tip+'" onclick="'+act+'">'+
          '</div></td>';
      }
      else if(isCust) h+='<td><div class="mempty mup" data-tip="clic gauche : uploader des images dans la catégorie ✨ Custom de ce portrait" onclick="uploadFor(\''+p.stem+'\')">＋</div></td>';
      else h+='<td><div class="mempty" data-tip="clic gauche : fiche de l\'artiste sur ce personnage" onclick="gotoDetail(\''+st.key+'\',\''+p.stem+'\')">·</div></td>';
    }
    h+='</tr>';
  }
  h+='</table></div>';
  c.innerHTML=h;
  measureMixSticky();
  setupMwrap();
  setTimeout(measureMixSticky,350); /* re-mesure apres stabilisation du layout */
}
/* cellule "Choix" : l'image globale exportée pour ce personnage */
function choiceCell(stem,fc){
  if(fc&&fc.original)
    return '<td class="msel"><img class="thumb" loading="lazy" src="/thumb/original/'+stem+'" '+
      'data-tip="texture originale · clic gauche : toutes les versions · clic droit : zoom" onclick="verOpenAll(event,\''+stem+'\')"></td>';
  if(fc)
    return '<td><img class="thumb" loading="lazy" src="/thumb/var/'+fc.style+'/'+stem+'/'+fc.file+'" '+
      'data-ref="'+fc.style+'/'+stem+'/'+fc.file+'" '+
      'data-tip="'+styleLabel(fc.style)+(fc.explicit?'':' (auto)')+' · clic gauche : toutes les versions · clic droit : zoom" '+
      'onclick="verOpenAll(event,\''+stem+'\')"></td>';
  return '<td><div class="mempty" data-tip="pas d\'image globale · clic gauche : toutes les versions" onclick="verOpenAll(event,\''+stem+'\')">·</div></td>';
}
async function gotoStyle(st){
  style=st; document.getElementById('styleSel').value=st;
  mode='detail'; render();
  window.scrollTo(0,0);
  await refresh(); render();
}
async function gotoDetail(st,stem){
  style=st; document.getElementById('styleSel').value=st;
  mode='detail'; render();
  let el=document.getElementById('row-'+stem);
  if(el) el.scrollIntoView({block:'center'});
  await refresh(); render();
  el=document.getElementById('row-'+stem);
  if(el){el.scrollIntoView({block:'center'});setCur(stem,false);}
}

/* ---------- vue par style ---------- */
function renderDetail(){
  const c=document.getElementById('content');
  if(todoOnly&&!visiblePortraits().length){c.innerHTML=todoEmptyHtml();return;}
  const g=document.createElement('div');g.className='grid';
  const gh=document.createElement('div');gh.className='gridhead';
  gh.innerHTML='<div class="gh-left"></div><div class="gh-orig">original</div><div class="gh-var">variantes</div>';
  g.appendChild(gh);
  for(const p of visiblePortraits()){
    const key=style+'/'+p.stem;
    const row=document.createElement('div');row.className='row'+(curStem===p.stem?' cur':'');row.id='row-'+p.stem;
    row.onmouseenter=()=>{setCur(p.stem,false);};
    const left=document.createElement('div');left.className='stemname';
    const m=S.meta[p.stem]||{};
    const sx=m.sex||'male'; /* defaut : male */
    left.innerHTML=
      '<div class="sxrow">'+
      '<button class="sxb m'+(sx==='male'?' on':'')+'" title="mâle">♂ Mâle</button>'+
      '<button class="sxb f'+(sx==='female'?' on':'')+'" title="femelle">♀ Fem.</button>'+
      '</div>'+
      '<div class="sxrow">'+
      '<button class="sxb o'+(sx==='other'?' on':'')+'" title="autre (texte libre)">✎ Autre</button>'+
      '</div>'+
      '<input class="sxtxt'+(sx==='other'?' show':'')+'" placeholder="ex: monster, furry" value="'+((m.text||'').replace(/"/g,'&quot;'))+'">';
    const bs=left.querySelectorAll('.sxb');
    const sexes=['male','female','other'];
    const clss=['m','f','o'];
    bs.forEach((b,i)=>{b.onclick=async(ev)=>{
      const r=ev.currentTarget.getBoundingClientRect();
      await setSex(p.stem,sexes[i],left.querySelector('.sxtxt').value);
      if(sexes[i]!=='other') advanceScroll(p.stem,clss[i],r);
    };});
    left.querySelector('.sxtxt').onchange=(e)=>setSex(p.stem,'other',e.target.value);
    row.appendChild(left);
    const co=document.createElement('div');co.className='cell orig';
    co.innerHTML='<img class="thumb" loading="lazy" data-tip="texture originale · clic droit : zoom" src="/thumb/original/'+p.stem+'">';
    row.appendChild(co);
    const vs=document.createElement('div');vs.className='vars';
    const files=S.variants[key]||[];
    const chosen=effSel(key);
    /* l'image selectionnee s'affiche en premier, le reste en ordre chronologique */
    const ordered=chosen?[chosen,...files.filter(x=>x!==chosen)]:files;
    const fcRow=finalChoice(p.stem);
    for(const f of ordered){
      const isSel=(f===chosen);
      const isGlob=!!(fcRow&&!fcRow.original&&fcRow.style===style&&fcRow.file===f);
      const cd=document.createElement('div');
      cd.className='cell'+(isSel?' sel':'');
      cd.onmouseenter=()=>{hoverCell={style:style,stem:p.stem,file:f};};
      cd.onmouseleave=()=>{hoverCell=null;};
      cd.innerHTML='<div class="tick">✓</div>'+
        (isGlob?'<div class="gstar" title="image globale de ce personnage">★</div>':'')+
        '<img class="thumb" loading="lazy" data-ref="'+key+'/'+f+'" data-tip="clic gauche : sélectionner (re-clic : désélectionner) · clic droit : zoom" src="/thumb/var/'+key+'/'+f+'">'+
        '<button class="del" title="supprimer">✕ Supprimer</button>';
      cd.querySelector('img').onclick=async()=>{
        const nv=(S.selections[key]===f)?null:f;
        await fetch('/api/select',{method:'POST',body:JSON.stringify({key:key,file:nv})});
        S.selections[key]=nv;
        await syncGlobalWithSelection(p.stem,style,nv);
        render();
      };
      cd.querySelector('.del').onclick=async(ev)=>{
        ev.stopPropagation();
        await deleteVariant(style,p.stem,f);
        await refresh(); render();
      };
      vs.appendChild(cd);
    }
    const bwrap=document.createElement('div');bwrap.className='regenbtns';
    const topRow=document.createElement('div');topRow.className='rgtop';
    if(style==='_custom'){
      /* categorie Custom : pas de generation, seulement l'upload (avec recadrage) */
      const up=document.createElement('button');
      up.textContent='⬆ Uploader…';
      up.title='ajouter une ou plusieurs images dans la catégorie ✨ Custom de ce personnage (recadrage au ratio de la texture)';
      up.onclick=()=>uploadFor(p.stem);
      topRow.appendChild(up);
    }else{
      const rq=document.createElement('button');
      const nrq=(S.settings&&S.settings.regen_count)||2;
      rq.textContent='⟳ Regénération';
      rq.title='régénérer '+nrq+' variante'+(nrq>1?'s':'')+' avec les réglages du style';
      rq.onclick=async()=>{rq.disabled=true;rq.textContent='en file…';
        await fetch('/api/regen',{method:'POST',body:JSON.stringify({style:style,stem:p.stem,count:(S.settings&&S.settings.regen_count)||2})});
        pollPending();};
      const ra=document.createElement('button');
      ra.textContent='⚙ Custom';ra.title='denoise, quantité, prompts + / −';
      ra.onclick=(ev)=>showPop(ev,style,p.stem);
      topRow.appendChild(rq);topRow.appendChild(ra);
    }
    bwrap.appendChild(topRow);
    if(files.length){
      const da=document.createElement('button');da.className='delrow';
      da.textContent='🗑 Supprimer';da.title='supprimer les variantes NON sélectionnées de cette ligne';
      da.onclick=async()=>{
        /* on garde la variante selectionnee (s'il y en a une) */
        const sel=effSel(key);
        const del=(S.variants[key]||[]).filter(f=>f!==sel);
        if(!del.length) return;
        for(const f of del)
          await fetch('/api/delete',{method:'POST',body:JSON.stringify({style:style,stem:p.stem,file:f})});
        await refresh(); render();
      };
      bwrap.appendChild(da);
    }
    row.appendChild(vs);
    row.appendChild(bwrap);
    g.appendChild(row);
  }
  c.innerHTML='';c.appendChild(g);
  syncPendingCells();
}

/* cases "en cours de generation" : squelettes animes en fin de rangee,
   synchronises sur la file (vue Par style) */
let _pendingKeys={};
function syncPendingCells(){
  if(mode!=='detail') return;
  for(const p of visiblePortraits()){
    const row=document.getElementById('row-'+p.stem);
    if(!row) continue;
    const vs=row.querySelector('.vars');
    if(!vs) continue;
    const want=_pendingKeys[style+'/'+p.stem]||0;
    let have=vs.querySelectorAll('.genph').length;
    while(have<want){
      const d=document.createElement('div');
      d.className='cell genph';
      d.title='génération en cours…';
      d.innerHTML='<span>⟳</span>';
      vs.appendChild(d);have++;
    }
    while(have>want){
      vs.querySelector('.genph').remove();have--;
    }
  }
}
async function pollPending(){
  /* feedback immediat apres avoir lance une generation */
  try{
    const q=await (await fetch('/api/queue')).json();
    _pendingKeys=q.pending_keys||{};
  }catch(e){}
  syncPendingCells();
}
/* apres un clic sexe : scroll pour que le meme bouton de la ligne suivante
   arrive exactement sous le curseur -> on peut enchainer sans bouger la souris */
function advanceScroll(stem,cls,prevRect){
  const ps=visiblePortraits();
  const i=ps.findIndex(x=>x.stem===stem);
  if(i<0||i+1>=ps.length) return;
  const nrow=document.getElementById('row-'+ps[i+1].stem);
  if(!nrow) return;
  const nb=nrow.querySelector('.sxb.'+cls);
  if(!nb) return;
  window.scrollBy(0,nb.getBoundingClientRect().top-prevRect.top);
}

/* upload d'images dans la categorie Custom d'un portrait */
let _upStem=null;
function uploadFor(stem){
  _upStem=stem;
  const inp=document.getElementById('upInput');
  inp.value='';
  inp.click();
}
document.getElementById('upInput').addEventListener('change',async e=>{
  const files=[...e.target.files];
  if(!files.length||!_upStem) return;
  const stem=_upStem;_upStem=null;
  /* ratio cible du recadrage = celui de la texture originale du perso */
  let ratio=1;
  try{
    const o=await _loadImg('/img/original/'+stem);
    ratio=o.naturalWidth/o.naturalHeight;
  }catch(err){}
  let ok=0;
  for(const f of files){
    const blob=await cropDialog(f,ratio,stem); /* Blob=recadrée · null=entière · undefined=annulée */
    if(blob===undefined) continue;
    try{
      const r=await (await fetch('/api/upload_custom?stem='+encodeURIComponent(stem),
        {method:'POST',body:blob||f})).json();
      if(r.ok) ok++;
    }catch(err){}
  }
  if(!ok) return;
  await refresh(); render();
  toast('✨ '+ok+' image'+(ok>1?'s':'')+' ajoutée'+(ok>1?'s':'')+' à la catégorie Custom de '+stem);
});

/* ---------- recadrage des uploads au ratio de la texture originale ---------- */
let _crop=null,_cdrag=null;
function _loadImg(src){
  return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src;});
}
function cropDialog(file,ratio,label){
  return new Promise(async resolve=>{
    let img,url=URL.createObjectURL(file);
    try{img=await _loadImg(url);}
    catch(e){URL.revokeObjectURL(url);resolve(undefined);return;}
    /* canvas de travail : recoit rotations, miroirs et baguette magique */
    const wk=document.createElement('canvas');
    wk.width=img.naturalWidth;wk.height=img.naturalHeight;
    wk.getContext('2d').drawImage(img,0,0);
    _crop={img,url,work:wk,ratio,resolve,wand:false};
    _cropFit();
    _cropWandOff();
    document.getElementById('cropTitle').textContent='✂ Recadrer — '+(label||'')+' · '+file.name;
    document.getElementById('croppopbg').style.display='block';
    document.getElementById('croppop').style.display='block';
    cropDraw();
  });
}
/* (re)calcule l'echelle d'affichage et la zone max centree au ratio cible */
function _cropFit(){
  const c=_crop;
  c.iw=c.work.width;c.ih=c.work.height;
  let w=c.iw,h=w/c.ratio;
  if(h>c.ih){h=c.ih;w=h*c.ratio;}
  c.rect={x:(c.iw-w)/2,y:(c.ih-h)/2,w:w,h:h};
  /* garde-fou si la fenetre est cachee : innerWidth=0 */
  const maxW=Math.max(window.innerWidth,340)-120;
  const maxH=Math.max(window.innerHeight,420)-300;
  c.scale=Math.min(1,maxW/c.iw,maxH/c.ih);
  const cv=document.getElementById('cropCanvas');
  cv.width=Math.max(1,Math.round(c.iw*c.scale));
  cv.height=Math.max(1,Math.round(c.ih*c.scale));
}
function cropRotate(dir){ /* dir=1 : 90° horaire, -1 : antihoraire */
  const c=_crop;if(!c)return;
  const w=c.work.width,h=c.work.height;
  const o=document.createElement('canvas');o.width=h;o.height=w;
  const g=o.getContext('2d');
  g.translate(h/2,w/2);g.rotate(dir*Math.PI/2);g.drawImage(c.work,-w/2,-h/2);
  c.work=o;_cropFit();cropDraw();
}
function cropFlip(vert){
  const c=_crop;if(!c)return;
  const w=c.work.width,h=c.work.height;
  const o=document.createElement('canvas');o.width=w;o.height=h;
  const g=o.getContext('2d');
  if(vert){g.translate(0,h);g.scale(1,-1);}else{g.translate(w,0);g.scale(-1,1);}
  g.drawImage(c.work,0,0);
  c.work=o;cropDraw();
}
function cropReset(){
  const c=_crop;if(!c)return;
  const o=document.createElement('canvas');
  o.width=c.img.naturalWidth;o.height=c.img.naturalHeight;
  o.getContext('2d').drawImage(c.img,0,0);
  c.work=o;_cropWandOff();_cropFit();cropDraw();
}
function cropWandToggle(){
  const c=_crop;if(!c)return;
  c.wand=!c.wand;
  document.getElementById('cropWandBtn').classList.toggle('on',c.wand);
  document.getElementById('cropCanvas').style.cursor=c.wand?'crosshair':'default';
}
function _cropWandOff(){
  if(_crop)_crop.wand=false;
  document.getElementById('cropWandBtn').classList.remove('on');
  document.getElementById('cropCanvas').style.cursor='default';
}
/* baguette magique : rend transparente la zone CONTIGUE de couleur proche
   du pixel clique (fond uni) ; tolerance reglable, plusieurs clics possibles */
function _wandApply(px,py){
  const c=_crop;
  const W=c.work.width,H=c.work.height;
  const sx=Math.round(px),sy=Math.round(py);
  if(sx<0||sy<0||sx>=W||sy>=H)return;
  const g=c.work.getContext('2d');
  const id=g.getImageData(0,0,W,H),d=id.data;
  const si=(sy*W+sx)*4;
  if(d[si+3]===0)return; /* deja transparent */
  const sr=d[si],sg2=d[si+1],sb=d[si+2];
  const tol=+document.getElementById('cropTol').value;
  const t2=tol*tol*3;
  const seen=new Uint8Array(W*H);
  const stack=[sy*W+sx];seen[sy*W+sx]=1;
  while(stack.length){
    const i=stack.pop(),j=i*4;
    const dr=d[j]-sr,dg=d[j+1]-sg2,db=d[j+2]-sb;
    if(d[j+3]===0||dr*dr+dg*dg+db*db>t2)continue;
    d[j+3]=0;
    const x=i%W;
    if(x>0&&!seen[i-1]){seen[i-1]=1;stack.push(i-1);}
    if(x<W-1&&!seen[i+1]){seen[i+1]=1;stack.push(i+1);}
    if(i>=W&&!seen[i-W]){seen[i-W]=1;stack.push(i-W);}
    if(i<W*(H-1)&&!seen[i+W]){seen[i+W]=1;stack.push(i+W);}
  }
  g.putImageData(id,0,0);
  cropDraw();
}
function cropDraw(){
  const c=_crop;if(!c)return;
  const cv=document.getElementById('cropCanvas'),g=cv.getContext('2d');
  g.clearRect(0,0,cv.width,cv.height);
  g.drawImage(c.work,0,0,cv.width,cv.height);
  const s=c.scale,r=c.rect;
  const x=r.x*s,y=r.y*s,w=r.w*s,h=r.h*s;
  g.fillStyle='rgba(0,0,0,.55)';
  g.fillRect(0,0,cv.width,y);
  g.fillRect(0,y,x,h);
  g.fillRect(x+w,y,cv.width-(x+w),h);
  g.fillRect(0,y+h,cv.width,cv.height-(y+h));
  g.strokeStyle='#5af';g.lineWidth=2;
  g.strokeRect(x+1,y+1,Math.max(0,w-2),Math.max(0,h-2));
  g.fillStyle='#5af';
  for(const [hx,hy] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]) g.fillRect(hx-5,hy-5,10,10);
  document.getElementById('cropInfo').textContent='zone : '+Math.round(r.w)+'×'+Math.round(r.h)+
    ' px — glisser : déplacer · coins : redimensionner · molette : agrandir/réduire · Entrée : valider · Échap : annuler';
}
function _cpos(e){
  const b=document.getElementById('cropCanvas').getBoundingClientRect();
  return {x:(e.clientX-b.left)/_crop.scale,y:(e.clientY-b.top)/_crop.scale};
}
function _chit(p){
  const r=_crop.rect,t=14/_crop.scale;
  for(const [cx,cy,k] of [[r.x,r.y,'nw'],[r.x+r.w,r.y,'ne'],[r.x,r.y+r.h,'sw'],[r.x+r.w,r.y+r.h,'se']])
    if(Math.abs(p.x-cx)<=t&&Math.abs(p.y-cy)<=t) return k;
  if(p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h) return 'move';
  return null;
}
const _cropCv=document.getElementById('cropCanvas');
_cropCv.addEventListener('pointerdown',e=>{
  if(!_crop)return;
  const p=_cpos(e);
  if(_crop.wand){_wandApply(p.x,p.y);return;}
  const hit=_chit(p);
  if(!hit)return;
  const r=_crop.rect;
  _cdrag={hit,px:p.x,py:p.y,ox:r.x,oy:r.y};
  if(hit!=='move'){ /* ancre = coin oppose, fixe pendant le redimensionnement */
    _cdrag.ax=(hit==='nw'||hit==='sw')?r.x+r.w:r.x;
    _cdrag.ay=(hit==='nw'||hit==='ne')?r.y+r.h:r.y;
  }
  _cropCv.setPointerCapture(e.pointerId);
});
_cropCv.addEventListener('pointermove',e=>{
  if(!_crop)return;
  const p=_cpos(e);
  if(!_cdrag){
    if(_crop.wand){_cropCv.style.cursor='crosshair';return;}
    const hit=_chit(p);
    _cropCv.style.cursor=hit==='move'?'move':(hit==='nw'||hit==='se')?'nwse-resize':(hit?'nesw-resize':'default');
    return;
  }
  const c=_crop,r=c.rect;
  if(_cdrag.hit==='move'){
    r.x=Math.min(Math.max(0,_cdrag.ox+p.x-_cdrag.px),c.iw-r.w);
    r.y=Math.min(Math.max(0,_cdrag.oy+p.y-_cdrag.py),c.ih-r.h);
  }else{
    const ax=_cdrag.ax,ay=_cdrag.ay;
    const sx=p.x>=ax?1:-1,sy=p.y>=ay?1:-1;
    let w=Math.max(Math.abs(p.x-ax),Math.abs(p.y-ay)*c.ratio);
    const availW=sx>0?c.iw-ax:ax, availH=sy>0?c.ih-ay:ay;
    w=Math.max(32,Math.min(w,availW,availH*c.ratio));
    r.w=w;r.h=w/c.ratio;
    r.x=sx>0?ax:ax-r.w;
    r.y=sy>0?ay:ay-r.h;
  }
  cropDraw();
});
_cropCv.addEventListener('pointerup',()=>{_cdrag=null;});
_cropCv.addEventListener('wheel',e=>{
  if(!_crop)return;
  e.preventDefault();
  const c=_crop,r=c.rect;
  const cx=r.x+r.w/2,cy=r.y+r.h/2;
  const w=Math.min(Math.max(32,r.w*(e.deltaY>0?0.95:1.05)),c.iw,c.ih*c.ratio);
  const h=w/c.ratio;
  r.x=Math.min(Math.max(0,cx-w/2),c.iw-w);
  r.y=Math.min(Math.max(0,cy-h/2),c.ih-h);
  r.w=w;r.h=h;
  cropDraw();
},{passive:false});
function _cropClose(){
  document.getElementById('croppop').style.display='none';
  document.getElementById('croppopbg').style.display='none';
  if(_crop) URL.revokeObjectURL(_crop.url);
  _crop=null;_cdrag=null;
}
function cropCancel(){const c=_crop;_cropClose();if(c)c.resolve(undefined);}
function cropFull(){const c=_crop;_cropClose();if(c)c.resolve(null);}
function cropOk(){
  const c=_crop;if(!c||c.busy)return;
  c.busy=true; /* evite un double Valider pendant le toBlob */
  const r=c.rect,o=document.createElement('canvas');
  o.width=Math.max(1,Math.round(r.w));o.height=Math.max(1,Math.round(r.h));
  o.getContext('2d').drawImage(c.work,r.x,r.y,r.w,r.h,0,0,o.width,o.height);
  o.toBlob(b=>{_cropClose();c.resolve(b||undefined);},'image/png');
}
/* popup de recadrage ouvert : il capte tout le clavier (phase capture,
   avant les raccourcis globaux de l'interface en dessous) */
document.addEventListener('keydown',e=>{
  if(!_crop&&document.getElementById('croppop').style.display!=='block')return;
  e.stopPropagation();
  if(e.key==='Enter'){e.preventDefault();cropOk();}
  else if(e.key==='Escape'){e.preventDefault();cropCancel();}
},true);

async function setSex(stem,sex,text){
  await fetch('/api/meta',{method:'POST',body:JSON.stringify({stem:stem,sex:sex,text:text||''})});
  if(sex) S.meta[stem]={sex:sex,text:text||''}; else delete S.meta[stem];
  render();
}

/* ---------- regen popup ---------- */
function popMissing(ev){showPop(ev,style,null,'missing');}
function popAll(ev){showPop(ev,style,null,'all');}
/* remplit les champs dependant du style courant (titre, base, checkpoint, loras, reglages) */
function popFillStyle(){
  if(!popCtx) return;
  const st=popCtx.style, kind=popCtx.kind, stem=popCtx.stem;
  /* mode "perso" : X images dans CHAQUE style actif -> chaque style utilise
     ses propres reglages, on ne montre que quantite + mots */
  document.getElementById('popStyleParams').style.display=(kind==='perso')?'none':'';
  if(kind==='perso'){
    const nSty=visStyles().length;
    document.getElementById('popTitle').textContent=
      'Régénérer chaque style actif ('+nSty+') — '+stem;
    return;
  }
  const isCustom=(st==='_custom');
  const stc=S.styles.find(x=>x.key===st)||{};
  document.getElementById('popBase').textContent=
    isCustom?'libre':((stc.base==='pony')?'Pony':'Illustrious');
  fillPopCkpt(isCustom?(_lastCustomCkpt||(S.settings&&S.settings.checkpoint_pony)||''):stc.checkpoint);
  if(isCustom){
    document.getElementById('popLoras').innerHTML='LoRA (bibliothèque complète, optionnel) :'+
      '<input id="popLoraF" class="selfilter" style="width:100%;box-sizing:border-box;margin-top:3px" placeholder="🔍 filtrer les LoRAs" oninput="fillPopLora()">'+
      '<select id="popLoraSel" style="width:100%;margin-top:3px"></select>';
    fillPopLora();
  }else{
    document.getElementById('popLoras').innerHTML='LoRAs du style :'+
      '<label style="display:flex;align-items:center;gap:6px;margin-top:3px;font-size:12px">'+
      '<input type="checkbox" id="popLoraOn" checked> '+(stc.lora||'(aucun)')+'</label>';
  }
  /* champs supplementaires categorie Custom : source, steps, cfg */
  const xtr=document.getElementById('popCustomXtra');
  if(isCustom){
    let srcOpts='<option value="__original__">Image d\'origine</option>';
    if(kind==='custom'){
      const files=S.variants['_custom/'+stem]||[];
      for(const f of files) srcOpts+='<option value="'+f+'">'+f+'</option>';
      srcOpts='<option value="">Auto (sélectionnée, sinon la + récente, sinon l\'original)</option>'+srcOpts;
    }else{
      srcOpts='<option value="">Auto (sélectionnée / + récente / original, par perso)</option>'+srcOpts;
    }
    xtr.innerHTML='<label>Source img2img :</label>'+
      '<select id="popSrc" style="width:100%;margin:3px 0 6px">'+srcOpts+'</select>'+
      '<div class="qty"><label style="width:110px">Steps</label><input id="popSteps" type="number" min="10" max="60" value="'+((S.settings&&S.settings.gen_steps)||28)+'"></div>'+
      '<div class="qty"><label style="width:110px">CFG</label><input id="popCfg" type="number" step="0.5" min="1" max="15" value="6"></div>';
    xtr.style.display='';
  }else{
    xtr.innerHTML='';
    xtr.style.display='none';
  }
  document.getElementById('popDn').value=stc.denoise||0.7;
  document.getElementById('popLora').value=stc.lora_strength||0.9;
  document.getElementById('popCnet').value=stc.cnet_strength||0.5;
  document.getElementById('popCend').value=stc.cnet_end||0.75;
  const sf=sexFilter?{male:' — filtre ♂',female:' — filtre ♀',other:' — filtre ✎'}[sexFilter]:'';
  const cn=styleLabel(st);
  const titles={custom:(isCustom?'Création custom — ':'Régénérer — ')+stem,
    missing:'Générer les manquants — '+cn+' (par personnage sans sélection'+sf+')',
    all:(isCustom?'Création custom pour toute la catégorie':'Générer pour tous — '+cn)+' (par personnage'+sf+')'};
  document.getElementById('popTitle').textContent=titles[kind];
  dnExplain();
}
let _loraList=null,_lastCustomCkpt=null,_lastCustomLora='';
async function fillPopLora(){
  const sel=document.getElementById('popLoraSel');
  if(!sel) return;
  if(_loraList===null){
    try{_loraList=(await (await fetch('/api/loras')).json()).loras;}
    catch(e){_loraList=[];}
  }
  const keep=sel.value||_lastCustomLora;
  const f=((document.getElementById('popLoraF')||{}).value||'').toLowerCase();
  sel.innerHTML='<option value="">(aucun LoRA)</option>';
  const names=_loraList.filter(c=>c.toLowerCase().includes(f));
  if(keep&&!names.includes(keep)) names.unshift(keep);
  for(const c of names){
    const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);
  }
  sel.value=names.includes(keep)?keep:'';
}
/* si le panneau manquants / X de chaque est ouvert, le recaler sur le style courant */
function popSyncStyle(){
  if(popCtx&&(popCtx.kind==='missing'||popCtx.kind==='all')
     &&document.getElementById('pop').style.display==='block'){
    popCtx.style=style;
    popFillStyle();
  }
}
function showPop(ev,st,stem,kind){
  kind=kind||'custom';
  popCtx={style:st,stem:stem,kind:kind};
  const s=S.settings||{};
  const qty={custom:s.custom_count||5,missing:s.regen_count||2,all:s.gen_all_count||2,perso:s.regen_count||2}[kind];
  document.getElementById('popQty').value=qty;
  document.getElementById('popSeedRow').style.display=(kind==='custom')?'':'none';
  document.getElementById('popSeed').value='';
  document.getElementById('popSeedReuseWrap').style.display='none';
  document.getElementById('popSeedReuse').checked=false;
  delete document.getElementById('popSeed').dataset.imgseed;
  document.getElementById('popMemo').checked=true; /* defaut ; decoche pour une relance ponctuelle */
  document.getElementById('popPrio').style.display=(kind==='custom'||kind==='perso')?'':'none';
  popFillStyle();
  const pop=document.getElementById('pop');
  pop.style.display='block';
  const r=ev.target.getBoundingClientRect();
  const vw=document.documentElement.clientWidth, vh=document.documentElement.clientHeight;
  pop.style.left=Math.max(8,Math.min(vw-350,r.left))+'px';
  /* caler pour que le panneau tienne entierement dans l'ecran */
  const ph=pop.offsetHeight;
  pop.style.top=Math.max(8,Math.min(vh-ph-10,r.bottom+8))+'px';
}
function hidePop(){document.getElementById('pop').style.display='none';popCtx=null;}
/* case "meme seed" : reprendre / relacher la seed de l'image consultee */
function popSeedReuseToggle(){
  const ps=document.getElementById('popSeed');
  ps.value=document.getElementById('popSeedReuse').checked?(ps.dataset.imgseed||''):'';
}
/* fenetre deplacable par son titre */
let _popDrag=null;
document.getElementById('popTitle').addEventListener('mousedown',e=>{
  e.preventDefault();
  const p=document.getElementById('pop').getBoundingClientRect();
  _popDrag={dx:e.clientX-p.left,dy:e.clientY-p.top};
});
document.addEventListener('mousemove',e=>{
  if(!_popDrag) return;
  const pop=document.getElementById('pop');
  pop.style.left=Math.max(0,Math.min(Math.max(innerWidth,300)-100,e.clientX-_popDrag.dx))+'px';
  pop.style.top=Math.max(0,Math.min(Math.max(innerHeight,200)-40,e.clientY-_popDrag.dy))+'px';
});
document.addEventListener('mouseup',()=>{_popDrag=null;});
/* presets du panneau de generation */
let _ckptList=null,_popCkptCur=null;
async function fillPopCkpt(current){
  const sel=document.getElementById('popCkpt');
  if(current!==undefined) _popCkptCur=current;
  else current=sel.value||_popCkptCur; /* refiltre : garder le choix en cours */
  if(_ckptList===null){
    try{_ckptList=(await (await fetch('/api/checkpoints')).json()).checkpoints;}
    catch(e){_ckptList=[];}
  }
  const f=(document.getElementById('popCkptF').value||'').toLowerCase();
  sel.innerHTML='';
  const names=_ckptList.filter(c=>c.toLowerCase().includes(f));
  if(current&&!names.includes(current)) names.unshift(current);
  for(const c of names){
    const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);
  }
  if(current) sel.value=current;
}
function popPreset(kind){
  const stc=(popCtx&&S.styles.find(x=>x.key===popCtx.style))||{};
  if(kind==='boost'){
    document.getElementById('popDn').value=Math.max(0.75,+stc.denoise||0.7);
    document.getElementById('popLora').value=Math.min(1.2,(+stc.lora_strength||0.9)+0.1);
    document.getElementById('popCnet').value=0.35;
    document.getElementById('popCend').value=0.6;
  }else{
    document.getElementById('popDn').value=0.7;
    document.getElementById('popLora').value=0.9;
    document.getElementById('popCnet').value=0.5;
    document.getElementById('popCend').value=0.75;
  }
  dnExplain();
}
function qty(d){const i=document.getElementById('popQty');i.value=Math.max(1,Math.min(10,(+i.value)+d));}
function dnExplain(){
  const v=+document.getElementById('popDn').value;
  document.getElementById('dnval').textContent=v.toFixed(2);
  let t;
  if(v<0.30) t='🪶 Retouche légère : quasi identique à l\'original, style à peine visible.';
  else if(v<0.45) t='🎨 Très fidèle : même portrait, seul le rendu / coup de pinceau change.';
  else if(v<0.60) t='⚖️ Équilibré : personnage bien reconnaissable, style clairement visible.';
  else if(v<0.75) t='🔥 Style prioritaire : le style de l\'artiste domine, légère réinterprétation du personnage.';
  else if(v<0.90) t='🌀 Réinterprétation forte : le personnage peut s\'éloigner de l\'original (garde la pose via ControlNet).';
  else t='🎲 Création quasi libre : ne garde que la silhouette approximative.';
  document.getElementById('dnexpl').textContent=t;
}
async function launchRegen(front){
  const n=+document.getElementById('popQty').value;
  if(popCtx&&popCtx.kind==='perso'){
    /* ce perso dans chaque style actif, reglages propres a chaque style */
    const r=await (await fetch('/api/regen_perso',{method:'POST',body:JSON.stringify({
      stem:popCtx.stem,count:n,
      pos:document.getElementById('popPos').value,
      neg:document.getElementById('popNeg').value,
      front:!!front})})).json();
    hidePop();
    toast(r.queued+' générations mises en file ('+r.styles+' styles actifs)'+(front?' (prioritaires)':''));
    pollPending();
    return;
  }
  const params={
    denoise:+document.getElementById('popDn').value,
    lora_strength:+document.getElementById('popLora').value,
    cnet_strength:+document.getElementById('popCnet').value,
    cnet_end:+document.getElementById('popCend').value};
  if(document.getElementById('popMemo').checked){
    await fetch('/api/style_cfg',{method:'POST',body:JSON.stringify(
      Object.assign({style:popCtx.style},params))});
    const st=S.styles.find(x=>x.key===popCtx.style);
    if(st) Object.assign(st,params);
  }
  const isCustom=(popCtx.style==='_custom');
  const stc=S.styles.find(x=>x.key===popCtx.style)||{};
  const ck=document.getElementById('popCkpt').value;
  const body=Object.assign({style:popCtx.style,count:n,
    pos:document.getElementById('popPos').value,
    neg:document.getElementById('popNeg').value,
    checkpoint:isCustom?(ck||null):((ck&&ck!==stc.checkpoint)?ck:null),
    lora_enabled:document.getElementById('popLoraOn')?document.getElementById('popLoraOn').checked:true},params);
  if(isCustom){
    body.lora=document.getElementById('popLoraSel')?document.getElementById('popLoraSel').value:'';
    body.source=document.getElementById('popSrc')?document.getElementById('popSrc').value:'';
    body.steps=+((document.getElementById('popSteps')||{}).value)||null;
    body.cfg=+((document.getElementById('popCfg')||{}).value)||null;
    _lastCustomCkpt=ck||_lastCustomCkpt;
    _lastCustomLora=body.lora;
  }
  let ep='/api/regen';
  if(popCtx.kind==='missing'){ep='/api/regen_missing';body.sex=sexFilter||null;}
  else if(popCtx.kind==='all'){ep='/api/regen_all';body.sex=sexFilter||null;}
  else{
    body.stem=popCtx.stem;
    body.front=!!front;
    const sd=document.getElementById('popSeed').value;
    if(sd!=='') body.seed=+sd;
  }
  const r=await (await fetch(ep,{method:'POST',body:JSON.stringify(body)})).json();
  hidePop();
  toast(r.queued+' générations mises en file'+(front?' (prioritaires)':''));
  pollPending();
}

/* ---------- selection finale (une image par perso, tous styles) ---------- */
function styleLabel(sk){
  if(sk==='__original__') return 'Texture originale';
  if(sk==='_custom') return '✨ Custom';
  const st=S.styles.find(s=>s.key===sk);return st?st.label:sk;
}
function customExists(){
  return Object.keys(S.variants).some(k=>k.startsWith('_custom/'));
}
/* colonnes des matrices : Custom (si presente) puis les artistes */
function colStyles(){
  return (customExists()?[{key:'_custom',label:'✨ Custom'}]:[]).concat(visStyles());
}
function badgeClass(n){
  if(n<=1) return 'vb1';
  if(n<=3) return 'vb2';
  if(n<=6) return 'vb3';
  if(n<=9) return 'vb4';
  return 'vb5';
}
function renderMix(){
  const c=document.getElementById('content');
  if(todoOnly&&!visiblePortraits().length){c.innerHTML=todoEmptyHtml();return;}
  /* stats : artistes les plus presents dans les choix globaux */
  const counts={};
  let totalSel=0;
  for(const p of visiblePortraits()){
    const fc=finalChoice(p.stem);
    if(fc){counts[fc.style]=(counts[fc.style]||0)+1;totalSel++;}
  }
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  let h='<div class="mixstats">🏆 Artistes les plus sélectionnés ('+totalSel+' persos) : '+
    (top.length?top.map(([k,n])=>'<b>'+styleLabel(k)+'</b> × '+n).join(' · '):'aucune sélection')+'</div>';
  h+='<div id="hscroll" class="hscroll"><div></div></div><div class="mwrap"><table class="matrix mixtbl"><tr><th>Perso</th><th>Original</th><th data-tip="image qui sera exportée pour ce personnage">Choix</th>';
  for(const st of colStyles()) h+='<th class="mstyle" onclick="gotoStyle(\''+st.key+'\')" data-tip="clic gauche : ouvrir la vue Par style">'+st.label+'</th>';
  h+='</tr>';
  for(const p of visiblePortraits()){
    const fc=finalChoice(p.stem);
    const isOrig=!!(fc&&fc.original);
    h+='<tr><td class="mstem" onclick="verOpenAll(event,\''+p.stem+'\')" data-tip="clic gauche : toutes les versions de ce portrait">'+p.stem+'</td>';
    h+='<td class="'+(isOrig?'msel':'')+'"><img class="oimg thumb" loading="lazy" src="/thumb/original/'+p.stem+'" '+
      'style="cursor:pointer" data-tip="clic gauche : garder la texture ORIGINALE pour ce personnage · clic droit : zoom" '+
      'onclick="mixSelect(\''+p.stem+'\',\'__original__\')"></td>';
    h+=choiceCell(p.stem,fc);
    for(const st of colStyles()){
      const key=st.key+'/'+p.stem;
      const f=dispSelMix(key);
      if(f){
        const n=(S.variants[key]||[]).length;
        const isFinal=fc&&fc.style===st.key&&fc.file===f;
        h+='<td class="'+(isFinal?'msel':'')+'"><div style="position:relative;display:inline-block">'+
          (n>1?('<span class="vbadge '+badgeClass(n)+'" onclick="verOpen(event,\''+p.stem+'\',\''+st.key+'\')" data-tip="clic gauche : versions pour ce perso / cet artiste">'+n+'</span>'):'')+
          '<img class="thumb" loading="lazy" src="/thumb/var/'+key+'/'+f+'" '+
          'data-ref="'+key+'/'+f+'" '+
          'data-tip="clic gauche : choisir comme image globale (re-clic : retirer) · clic droit : menu regénération/custom" '+
          'onclick="mixSelect(\''+p.stem+'\',\''+st.key+'/'+f+'\')" '+
          'oncontextmenu="mixCtx(event,\''+p.stem+'\',\''+st.key+'\')">'+
          '</div></td>';
      }else{
        h+='<td><div class="mempty" data-tip="clic droit : menu de génération pour ce style" oncontextmenu="mixCtx(event,\''+p.stem+'\',\''+st.key+'\');return false">·</div></td>';
      }
    }
    h+='</tr>';
  }
  h+='</table></div>';
  c.innerHTML=h;
  measureMixSticky();
  setupMwrap();
  setTimeout(measureMixSticky,350); /* re-mesure apres stabilisation du layout */
}
async function mixSelect(stem,ref){
  const nv=(S.final[stem]===ref)?null:ref;
  await fetch('/api/final',{method:'POST',body:JSON.stringify({stem:stem,ref:nv})});
  if(nv) S.final[stem]=nv; else delete S.final[stem];
  render();
}
function mixCtx(ev,stem,sk){
  ev.preventDefault();ev.stopPropagation();
  const ctx=document.getElementById('ctx');
  ctx.innerHTML='';
  const items=[
    ['⟳ Regénération',async()=>{await fetch('/api/regen',{method:'POST',body:JSON.stringify({style:sk,stem:stem,count:(S.settings&&S.settings.regen_count)||2})});}],
    ['⚙ Custom',(e)=>{showPop(e,sk,stem);}],
    ['👤 Fiche de l\'artiste ('+styleLabel(sk)+')',()=>{gotoDetail(sk,stem);}]
  ];
  for(const [label,fn] of items){
    const b=document.createElement('button');b.textContent=label;
    b.onclick=(e)=>{hideCtx();fn(e);};
    ctx.appendChild(b);
  }
  ctx.style.display='flex';
  ctx.style.left=Math.min(window.innerWidth-240,ev.clientX)+'px';
  ctx.style.top=Math.min(window.innerHeight-160,ev.clientY)+'px';
}
function hideCtx(){const c=document.getElementById('ctx');if(c)c.style.display='none';}

/* ---------- options de l'app ---------- */
function optOpen(){
  const s=S.settings||{};
  document.getElementById('optRegenCount').value=s.regen_count||2;
  document.getElementById('optCustomCount').value=s.custom_count||5;
  document.getElementById('optGenAll').value=s.gen_all_count||2;
  document.getElementById('optPackDir').value=(S.game&&S.game.pack_dir)||'';
  document.getElementById('optComfy').value=s.comfy_url||'';
  document.getElementById('optCivitai').value=s.civitai_api_key||'';
  document.getElementById('optGenSteps').value=s.gen_steps||'';
  document.getElementById('optGenSize').value=s.gen_size||'';
  document.getElementById('optSampler').value=(s.gen_sampler&&s.gen_scheduler)?(s.gen_sampler+'|'+s.gen_scheduler):'';
  document.getElementById('optCfgPony').value=s.cfg_pony||'';
  document.getElementById('optCfgIl').value=s.cfg_illustrious||'';
  document.getElementById('optCnetType').value=s.cnet_type||'canny';
  document.getElementById('optResize').checked=(s.resize_export!==false);
  document.getElementById('optWall').value=s.wall_size||60;
  document.getElementById('optAutoTags').checked=(s.use_auto_tags!==false);
  document.getElementById('optTagThr').value=s.tag_threshold||0.35;
  document.getElementById('optAntiHalo').checked=(s.anti_halo!==false);
  document.getElementById('optNotify').checked=!!s.notify_done;
  document.getElementById('optLang').value=s.lang||'fr';
  document.getElementById('optBackup').checked=(s.pack_backup!==false);
  document.getElementById('optPPrefix').value=(S.defaults&&S.defaults.pony_prefix)||'';
  document.getElementById('optPNeg').value=(S.defaults&&S.defaults.pony_negative)||'';
  document.getElementById('optIPrefix').value=(S.defaults&&S.defaults.il_prefix)||'';
  document.getElementById('optINeg').value=(S.defaults&&S.defaults.il_negative)||'';
  document.getElementById('optSuffix').value=(S.defaults&&S.defaults.suffix)||'';
  fillCheckpoints();
  document.getElementById('optThumb').value=s.thumb_size||'moyennes';
  const useStyleDn=(s.default_denoise===null||s.default_denoise===undefined);
  document.getElementById('optDnStyle').checked=useStyleDn;
  document.getElementById('optDnRow').style.display=useStyleDn?'none':'';
  if(!useStyleDn){document.getElementById('optDn').value=s.default_denoise;
    document.getElementById('optDnVal').textContent=(+s.default_denoise).toFixed(2);}
  const hid=s.hidden_styles||[];
  const box=document.getElementById('optStyles');
  box.innerHTML='';
  for(const st of S.styles){
    const l=document.createElement('label');
    l.innerHTML='<input type="checkbox" '+(hid.includes(st.key)?'':'checked')+'> '+st.label+
      ' <a href="#" class="gotoStyleLnk" title="ouvrir la fiche dans Par style">fiche&nbsp;→</a>';
    l.querySelector('input').onchange=optSave;
    l.querySelector('a').onclick=(e)=>{e.preventDefault();e.stopPropagation();optClose();gotoStyle(st.key);};
    l.dataset.key=st.key;
    box.appendChild(l);
  }
  document.getElementById('optpop').style.display='block';
}
function optClose(){document.getElementById('optpop').style.display='none';}
/* changement de langue : enregistre puis recharge (toute l'UI est retraduite) */
async function optLangChange(){
  const v=document.getElementById('optLang').value;
  await fetch('/api/settings',{method:'POST',body:JSON.stringify({lang:v})});
  location.reload();
}
/* case "notification Windows" : demande la permission navigateur a l'activation */
async function optNotifyToggle(){
  const cb=document.getElementById('optNotify');
  if(cb.checked&&'Notification' in window&&Notification.permission!=='granted'){
    const p=await Notification.requestPermission();
    if(p!=='granted'){cb.checked=false;toast('⚠ Notifications refusées par le navigateur');}
  }
  optSave();
}
function optTab(t){
  for(const k of ['G','N','P','A','C','K']){
    document.getElementById('osec'+k).style.display=(k===t)?'':'none';
    document.getElementById('ot'+k).className=(k===t)?'on':'';
  }
}
async function optSave(){
  const rc=Math.max(1,Math.min(10,+document.getElementById('optRegenCount').value||2));
  const cc=Math.max(1,Math.min(10,+document.getElementById('optCustomCount').value||5));
  const hid=[...document.querySelectorAll('#optStyles label')]
    .filter(l=>!l.querySelector('input').checked).map(l=>l.dataset.key);
  const pd=document.getElementById('optPackDir').value.trim();
  const cu=document.getElementById('optComfy').value.trim();
  const useStyleDn=document.getElementById('optDnStyle').checked;
  document.getElementById('optDnRow').style.display=useStyleDn?'none':'';
  const dn=useStyleDn?null:+document.getElementById('optDn').value;
  const ga=Math.max(1,Math.min(10,+document.getElementById('optGenAll').value||2));
  const payload={regen_count:rc,custom_count:cc,gen_all_count:ga,hidden_styles:hid,
    comfy_url:cu,
    thumb_size:document.getElementById('optThumb').value,default_denoise:dn,
    civitai_api_key:document.getElementById('optCivitai').value.trim(),
    gen_steps:+document.getElementById('optGenSteps').value||null,
    gen_size:+document.getElementById('optGenSize').value||null,
    gen_sampler:(document.getElementById('optSampler').value.split('|')[0])||'',
    gen_scheduler:(document.getElementById('optSampler').value.split('|')[1])||'',
    cfg_pony:+document.getElementById('optCfgPony').value||null,
    cfg_illustrious:+document.getElementById('optCfgIl').value||null,
    checkpoint_pony:document.getElementById('optCkptPony').value||'',
    checkpoint_illustrious:document.getElementById('optCkptIl').value||'',
    cnet_type:document.getElementById('optCnetType').value||'canny',
    resize_export:document.getElementById('optResize').checked,
    wall_size:Math.max(10,Math.min(500,+document.getElementById('optWall').value||60)),
    use_auto_tags:document.getElementById('optAutoTags').checked,
    tag_threshold:+document.getElementById('optTagThr').value||0.35,
    anti_halo:document.getElementById('optAntiHalo').checked,
    notify_done:document.getElementById('optNotify').checked,
    pack_backup:document.getElementById('optBackup').checked};
  await fetch('/api/settings',{method:'POST',body:JSON.stringify(payload)});
  S.settings=Object.assign(S.settings||{},payload);
  if(S.game&&pd!==(S.game.pack_dir||'')){
    await fetch('/api/game_pack',{method:'POST',body:JSON.stringify({pack_dir:pd})});
    S.game.pack_dir=pd;
  }
  await refresh();
  applyThumbSize(); buildStyleSel(); render();
}
async function fillCheckpoints(){
  try{
    if(_ckptList===null)
      _ckptList=(await (await fetch('/api/checkpoints')).json()).checkpoints;
    const s=S.settings||{};
    for(const [id,cur] of [['optCkptPony',s.checkpoint_pony],['optCkptIl',s.checkpoint_illustrious]]){
      const sel=document.getElementById(id);
      const keep=sel.value||cur||'';
      const f=(document.getElementById(id+'F').value||'').toLowerCase();
      sel.innerHTML='<option value="">défaut (styles.json)</option>';
      const names=_ckptList.filter(c=>c.toLowerCase().includes(f));
      if(keep&&!names.includes(keep)) names.unshift(keep);
      for(const c of names){
        const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);
      }
      sel.value=keep;
    }
  }catch(e){}
}
async function defSave(){
  const payload={
    pony_prefix:document.getElementById('optPPrefix').value,
    pony_negative:document.getElementById('optPNeg').value,
    il_prefix:document.getElementById('optIPrefix').value,
    il_negative:document.getElementById('optINeg').value,
    suffix:document.getElementById('optSuffix').value};
  await fetch('/api/defaults_cfg',{method:'POST',body:JSON.stringify(payload)});
  S.defaults=payload;
  toast('Prompts de base enregistrés');
}
let qPaused=false;
async function queueCtl(action){
  const r=await (await fetch('/api/queue_ctl',{method:'POST',body:JSON.stringify({action:action})})).json();
  qPaused=r.paused;
  if(action==='clear') toast('File d\'attente vidée');
}
async function openDir(which){
  await fetch('/api/open_dir',{method:'POST',body:JSON.stringify({which:which})});
}
function applyThumbSize(){
  const sz=(S.settings&&S.settings.thumb_size)||'moyennes';
  const map={petites:[120,76],moyennes:[170,104],grandes:[230,140]};
  const [c,m]=map[sz]||map.moyennes;
  document.documentElement.style.setProperty('--cell',c+'px');
  document.documentElement.style.setProperty('--mcell',m+'px');
}
async function restoreOriginals(){
  const r=await (await fetch('/api/restore_originals',{method:'POST'})).json();
  alert(T(r.pack_found?(r.restored+' portraits d\'origine restaurés dans le pack'):'Répertoire du pack introuvable — vérifie le chemin dans les options'));
}
document.addEventListener('click',e=>{
  if(!e.target.closest('#ctx'))hideCtx();
  /* options : clic en dehors = fermeture (les champs sauvegardent au blur) */
  const op=document.getElementById('optpop');
  if(op.style.display==='block'&&!e.target.closest('#optpop')&&!e.target.closest('#btnOpt'))
    optClose();
});

function verOpen(ev,stem,sk){
  ev.stopPropagation();
  verNavHide();
  const key=sk+'/'+stem;
  const files=S.variants[key]||[];
  const cur=dispSelMix(key);
  let h='<h3><a href="#" onclick="event.preventDefault();verClose();gotoDetail(\''+sk+'\',\''+stem+'\')" data-tip="clic gauche : ouvrir la fiche de l\'artiste sur ce personnage">'+styleLabel(sk)+'</a> — versions de ce personnage</h3>'+vrowOpen(files.length+1);
  h+='<div class="vcell vorigcell" data-tip="texture originale · clic droit : zoom"><img class="thumb" loading="lazy" src="/img/original/'+stem+'"><div class="vtag">original</div></div>';
  for(const f of files){
    h+='<div class="vcell'+(f===cur?' on':'')+'" data-ref="'+key+'/'+f+'" data-tip="clic gauche : choisir la version pour ce style · clic droit : zoom" onclick="verPick(\''+key+'\',\''+f+'\')">'+
      '<button class="vdel" title="supprimer" onclick="verDel(event,\''+key+'\',\''+f+'\',this)">✕ Supprimer</button>'+
      '<img class="thumb" loading="lazy" src="/img/var/'+key+'/'+f+'"></div>';
  }
  h+='</div>';
  document.getElementById('verpop').innerHTML=h;
  document.getElementById('verpop').style.display='block';
  document.getElementById('verpopbg').style.display='block';
}
/* taille des vignettes d'une rangee : la ligne occupe toute la largeur ;
   si les vignettes descendraient sous ~170px, retour a la ligne avec des
   colonnes equilibrees, chaque ligne remplissant la largeur */
function vrowStyle(nImages){
  const avail=window.innerWidth*0.95-70;
  const unit=14; /* gap + bordures autour de chaque vignette */
  const maxCols=Math.max(1,Math.floor(avail/(170+unit)));
  const rows=Math.ceil(nImages/maxCols);
  const cols=Math.ceil(nImages/rows);
  const sz=Math.max(85,Math.min(300,Math.floor(avail/cols)-unit));
  return (rows>1?'class-wrap ':'')+'style="--vsz:'+sz+'px"';
}
function vrowOpen(nImages){
  const s=vrowStyle(nImages);
  return '<div class="vrow'+(s.startsWith('class-wrap')?' wrap':'')+'" '+s.replace('class-wrap ','')+'>';
}
/* si l'image globale EXPLICITE du perso est dans le meme groupe (style),
   elle suit la nouvelle selection */
async function syncGlobalWithSelection(stem,styleKey,newFile){
  if(!newFile) return;
  const ref=S.final[stem];
  if(!ref||ref==='__original__') return;
  const [sk]=ref.split(/\/(.+)/);
  if(sk!==styleKey) return;
  const nv=styleKey+'/'+newFile;
  if(ref===nv) return;
  await fetch('/api/final',{method:'POST',body:JSON.stringify({stem:stem,ref:nv})});
  S.final[stem]=nv;
}
async function verPick(key,f){
  await fetch('/api/select',{method:'POST',body:JSON.stringify({key:key,file:f})});
  S.selections[key]=f;
  const parts=key.split(/\/(.+)/);
  if(mode==='mix'){
    /* en Selection globale : ce choix devient aussi l'image globale du perso */
    const fullref=parts[0]+'/'+f;
    await fetch('/api/final',{method:'POST',body:JSON.stringify({stem:parts[1],ref:fullref})});
    S.final[parts[1]]=fullref;
  }else{
    await syncGlobalWithSelection(parts[1],parts[0],f);
  }
  verClose(); render();
}
function verClose(){
  document.getElementById('verpop').style.display='none';
  document.getElementById('verpopbg').style.display='none';
  verNavHide();
  render();
}
/* navigation entre portraits dans la pop-in "toutes les versions" */
let verAllStem=null;
function verNavHide(){
  verAllStem=null;
  document.getElementById('vnavL').style.display='none';
  document.getElementById('vnavR').style.display='none';
}
function verAllList(){
  return visiblePortraits().map(p=>p.stem)
    .filter(s=>visStyles().some(st=>(S.variants[st.key+'/'+s]||[]).length));
}
function verNav(dir){
  const list=verAllList();
  const i=list.indexOf(verAllStem)+dir;
  if(i<0||i>=list.length) return;
  verOpenAll(null,list[i]);
}
function verNavUpdate(){
  const list=verAllList();
  const i=list.indexOf(verAllStem);
  const L=document.getElementById('vnavL'),R=document.getElementById('vnavR');
  L.style.display='flex';R.style.display='flex';
  L.disabled=(i<=0);
  R.disabled=(i<0||i>=list.length-1);
}

/* toutes les versions d'un portrait, groupees par artiste — un choix par style */
function verOpenAll(ev,stem){
  if(ev) ev.stopPropagation();
  verAllStem=stem;
  let h='<h3>Toutes les versions — '+stem+' <span style="font-size:12px;color:#9ab;font-weight:normal">(clic = sélectionner pour ce style, re-clic = désélectionner)</span> '+
    '<button style="margin-left:14px;font-size:12px;padding:6px 12px" '+
    'onclick="event.stopPropagation();showPop(event,null,\''+stem+'\',\'perso\')" '+
    'title="mettre en file X générations de ce personnage dans chacun des styles actifs (réglages propres à chaque style)">⚙ Regénérer chaque style actif…</button></h3>';
  h+='<div id="vglobrow">'+verGlobRowHtml(stem)+'</div>';
  for(const st of visStyles()){
    const key=st.key+'/'+stem;
    const files=S.variants[key]||[];
    if(!files.length) continue;
    h+='<div class="vsty"><a href="#" onclick="event.preventDefault();verClose();gotoDetail(\''+st.key+'\',\''+stem+'\')" data-tip="clic gauche : ouvrir la fiche de l\'artiste sur ce personnage">'+st.label+'</a></div>'+vrowOpen(files.length+1);
    h+='<div class="vcell vorigcell" data-tip="texture originale · clic droit : zoom"><img class="thumb" loading="lazy" src="/img/original/'+stem+'"><div class="vtag">original</div></div>';
    for(const f of files){
      h+='<div class="vcell'+(effSel(key)===f?' on':'')+'" data-ref="'+key+'/'+f+'" data-tip="clic gauche : sélectionner pour ce style (re-clic : désélectionner) · clic droit : zoom" onclick="verPickAll(\''+key+'\',\''+f+'\',this)">'+
        '<div class="vbtns">'+
        '<button class="vglob" title="définir comme image globale du personnage (re-clic : retirer)" onclick="verSetGlobal(event,\''+key+'\',\''+f+'\')">★</button>'+
        '<button class="vregen" title="regénérer avec les paramètres de cette image (ou custom si l\'image n\'en a pas)" onclick="verRegen(event,\''+key+'\',\''+f+'\')">⟳ Regénérer</button>'+
        '<button class="vdel" title="supprimer" onclick="verDel(event,\''+key+'\',\''+f+'\',this)">✕ Supprimer</button>'+
        '</div>'+
        '<img class="thumb" loading="lazy" src="/img/var/'+key+'/'+f+'"></div>';
    }
    h+='</div>';
  }
  h+='<div style="display:flex;justify-content:flex-end;margin-top:10px"><button onclick="verClose()">Fermer</button></div>';
  const vp=document.getElementById('verpop');
  vp.innerHTML=h;
  vp.style.display='block';
  vp.scrollTop=0;
  document.getElementById('verpopbg').style.display='block';
  verNavUpdate();
}
async function verDel(ev,key,f,btn){
  ev.stopPropagation();ev.preventDefault();
  const [sk,stem]=key.split(/\/(.+)/);
  await deleteVariant(sk,stem,f);
  await refresh();
  const cell=btn.closest('.vcell');
  const row=cell.parentElement;
  cell.remove();
  if(!row.children.length){
    const sty=row.previousElementSibling;
    if(sty&&sty.classList.contains('vsty')) sty.remove();
    row.remove();
  }
}
async function verPickAll(key,f,el){
  const nv=(S.selections[key]===f)?null:f;
  await fetch('/api/select',{method:'POST',body:JSON.stringify({key:key,file:nv})});
  S.selections[key]=nv;
  const row=el.parentElement;
  for(const c of row.children) c.classList.remove('on');
  if(nv) el.classList.add('on');
  const [sk,stem]=key.split(/\/(.+)/);
  await syncGlobalWithSelection(stem,sk,nv);
  /* la selection peut changer l'image globale (choix auto ou suivi) : rafraichir la 1re ligne */
  const g=document.getElementById('vglobrow');
  if(g&&verAllStem) g.innerHTML=verGlobRowHtml(verAllStem);
}
/* premiere ligne de la pop-in "toutes les versions" : l'image globale */
function verGlobRowHtml(stem){
  const fc=finalChoice(stem);
  if(!fc) return '';
  const src=fc.original?('/img/original/'+stem):('/img/var/'+fc.style+'/'+stem+'/'+fc.file);
  const lbl=fc.original?'texture originale':styleLabel(fc.style)+(fc.explicit?'':' (auto)');
  return '<div class="vsty">★ Image globale — '+lbl+'</div>'+
    '<div class="vrow" style="--vsz:170px"><div class="vcell vorigcell"'+
    (fc.original?'':' data-ref="'+fc.style+'/'+stem+'/'+fc.file+'"')+
    ' data-tip="image exportée pour ce personnage · clic droit : zoom">'+
    '<img class="thumb" loading="lazy" src="'+src+'"><div class="vtag">globale</div></div></div>';
}

/* ---------- progression de la generation ---------- */
function renderProg(){
  const c=document.getElementById('content');
  c.innerHTML='<div class="progwrap">'+
    '<div id="progQueue" class="progq">chargement…</div>'+
    '<h3 class="progh">Dernières images générées <span style="font-size:12px;color:#9ab;font-weight:normal">(clic = fiche du perso, clic droit = zoom)</span> '+
    '<button onclick="openDir(\'stylized\')" style="font-size:12px;padding:5px 10px" title="ouvrir le répertoire des images générées dans l\'explorateur">📂 Ouvrir le dossier des images</button></h3>'+
    '<div id="progWall" class="progwall"></div></div>';
  _progWallKey='';
  progUpdate();
}
let _progWallKey='';
async function progUpdate(){
  if(mode!=='prog') return;
  try{
    const q=await (await fetch('/api/queue')).json();
    let h='';
    if(q.current){
      h+='<div class="pgcur">⚙ En cours : <b>'+q.current+'</b> ⏱'+fmtDur(q.elapsed||0)+
        (q.avg?(' / ~'+fmtDur(q.avg)):'')+'</div>';
    }else{
      h+='<div class="pgcur" style="color:#9ab">Aucune génération en cours</div>';
    }
    if(q.batch_total&&(q.pending||q.current)){
      const pct=Math.round(100*q.batch_done/q.batch_total);
      h+='<div class="pgbarwrap"><div class="pgbar" style="width:'+pct+'%"></div></div>'+
        '<div>Lot : '+q.batch_done+'/'+q.batch_total+' ('+pct+'%)'+
        (q.avg?(' — reste ~'+fmtDur(q.pending*q.avg+(q.current?Math.max(5,q.avg-(q.elapsed||0)):0))):'')+'</div>';
    }
    const pby=q.pending_by_style||{};
    if(Object.keys(pby).length){
      h+='<div class="pgpend">En attente : '+
        Object.entries(pby).map(([k,v])=>'<b>'+styleLabel(k)+'</b> × '+v).join(' · ')+'</div>';
    }
    if(q.errors&&q.errors.length){
      h+='<div class="pgerr">Dernières erreurs :<br>'+q.errors.slice(-3).join('<br>')+'</div>';
    }
    const r=await (await fetch('/api/recent?n='+(((S.settings||{}).wall_size)||60))).json();
    if(r.counts){
      h+='<div class="pgpend">🖼 Images générées : <b>'+r.counts.minute+
        '</b> depuis 1 min · <b>'+r.counts.hour+'</b> depuis 1 h · <b>'+r.counts.day+'</b> depuis 24 h</div>';
    }
    const el=document.getElementById('progQueue');
    if(el) el.innerHTML=h;
    let items=r.items;
    if(sexFilter) items=items.filter(it=>effSexOf(it.stem)===sexFilter);
    const key=items.map(i=>i.file).join(',');
    if(key!==_progWallKey){
      _progWallKey=key;
      const wall=document.getElementById('progWall');
      if(wall){
        /* mise a jour incrementale : on REUTILISE les cellules existantes
           (leurs vignettes deja chargees ne sont pas rechargees) et on ne
           cree que les nouvelles — sinon chaque image generee relançait le
           chargement de tout le mur */
        const byKey={};
        for(const c of wall.children) byKey[c.dataset.k]=c;
        const frag=document.createDocumentFragment();
        for(const it of items){
          const k=it.style+'/'+it.stem+'/'+it.file;
          let cell=byKey[k];
          if(!cell){
            cell=document.createElement('div');
            cell.className='pgcell';
            cell.dataset.k=k;
            cell.setAttribute('data-ref',k);
            cell.setAttribute('data-tip','clic gauche : fiche du perso · clic droit : zoom');
            cell.onclick=((st,sm)=>()=>gotoDetail(st,sm))(it.style,it.stem);
            cell.innerHTML='<button class="pgdel" title="supprimer cette image (annulable : lien du toast ou Ctrl+Z)" onclick="progDel(event,this)">✕</button>'+
              '<img class="thumb" loading="lazy" src="/thumb/var/'+k+'">'+
              '<div class="pgcap">'+styleLabel(it.style)+'</div>';
          }
          frag.appendChild(cell);
        }
        wall.replaceChildren(frag);
      }
    }
  }catch(e){}
}
/* bouton ✕ d'une vignette du mur Génération : suppression (corbeille, annulable) */
async function progDel(ev,btn){
  ev.stopPropagation();ev.preventDefault();
  const cell=btn.closest('.pgcell');
  const [sk,stem,f]=cell.dataset.k.split('/');
  cell.remove();            /* retrait immediat, le poll resynchronise ensuite */
  _progWallKey='';
  await deleteVariant(sk,stem,f);
}

/* ---------- tri ---------- */
function renderTri(){
  const c=document.getElementById('content');
  const sortMode=(S.settings&&S.settings.sort_portraits)||'date';
  const sort2=(S.settings&&S.settings.sort_secondary)||'date';
  let h='<div class="hint">Clique sur une vignette pour basculer : '+
   '<b style="color:#8fc">Stylisé</b> = sera régénéré dans les styles / '+
   '<b style="color:#fc8">Garder l\'original</b> = texture non-personnage, laissée telle quelle '+
   '(ignorée des autres vues, de la génération et de l\'export). '+
   '<button id="btnTagger" onclick="runTagger()" title="détecte couleurs de cheveux/yeux, lunettes, casques... injectés dans les prompts pour la fidélité (~1-2 min, en arrière-plan)">🏷 Analyser les portraits (tags auto)</button>'+
   (S.tags_done?' <span style="color:#4c4">✓ déjà analysés</span>':'')+
   '</div>'+
   '<div class="hint" style="display:flex;gap:10px;align-items:center">Ordre des portraits (toutes les vues) : '+
   '<select id="triSortSel" onchange="triSetSort(this.value)">'+
    '<option value="date"'+(sortMode==='date'?' selected':'')+'>par date de création</option>'+
    '<option value="sexe"'+(sortMode==='sexe'?' selected':'')+'>par sexe</option>'+
    '<option value="name"'+((sortMode==='name'||sortMode==='nom')?' selected':'')+'>par nom de texture</option>'+
    '<option value="custom"'+(sortMode==='custom'?' selected':'')+'>custom (glisser-déposer)</option>'+
   '</select>'+
   (sortMode==='sexe'?(' puis <select id="triSortSel2" onchange="triSetSort2(this.value)">'+
    '<option value="date"'+(sort2==='date'?' selected':'')+'>par date de création</option>'+
    '<option value="name"'+((sort2==='name'||sort2==='nom')?' selected':'')+'>par nom de texture</option>'+
    '<option value="custom"'+(sort2==='custom'?' selected':'')+'>custom (glisser-déposer)</option>'+
   '</select>'):'')+
   '<span style="color:#8fd;font-size:12px">✋ glisse une vignette sur une autre pour la déplacer — au premier déplacement le tri passe en custom et l\'ordre affiché devient la base, mémorisée pour toutes les vues</span>'+
   '</div><div class="triwrap" id="triwrap">';
  for(const p of S.portraits){
    if(sexFilter&&effSexOf(p.stem)!==sexFilter) continue;
    const ex=S.excluded.includes(p.stem);
    h+='<div class="tcard '+(ex?'keep':'gen')+'" draggable="true" data-stem="'+p.stem+'" '+
      'data-tip="'+p.stem+' · clic : basculer Stylisé / Garder l\'original · glisser : réordonner" '+
      'onclick="toggleEx(\''+p.stem+'\')">'+
      '<img class="thumb" loading="lazy" src="/thumb/original/'+p.stem+'">'+
      '<div class="tst">'+(ex?'Garder l\'original':'Stylisé')+'</div></div>';
  }
  h+='</div>';
  c.innerHTML=h;
  triBindDnD();
}
/* changement du mode de tri (persiste et s'applique a toutes les vues) */
async function triSetSort(v){
  if(v==='custom'&&!(S.order&&S.order.length)){
    /* premier passage en custom : on capture l'ordre affiche actuel */
    S.order=S.portraits.map(p=>p.stem);
    await fetch('/api/order',{method:'POST',body:JSON.stringify({order:S.order})});
  }
  await fetch('/api/settings',{method:'POST',body:JSON.stringify({sort_portraits:v})});
  (S.settings=S.settings||{}).sort_portraits=v;
  await refresh(); render();
}
/* tri secondaire (a l'interieur des groupes de sexe) */
async function triSetSort2(v){
  if(v==='custom'&&!(S.order&&S.order.length)){
    S.order=S.portraits.map(p=>p.stem);
    await fetch('/api/order',{method:'POST',body:JSON.stringify({order:S.order})});
  }
  await fetch('/api/settings',{method:'POST',body:JSON.stringify({sort_secondary:v})});
  (S.settings=S.settings||{}).sort_secondary=v;
  await refresh(); render();
}
/* glisser-deposer des cartes en mode custom */
let _dragStem=null;
function triBindDnD(){
  for(const card of document.querySelectorAll('#triwrap .tcard')){
    card.ondragstart=e=>{_dragStem=card.dataset.stem;e.dataTransfer.effectAllowed='move';};
    card.ondragover=e=>{e.preventDefault();card.classList.add('dragover');};
    card.ondragleave=()=>card.classList.remove('dragover');
    card.ondrop=e=>{e.preventDefault();card.classList.remove('dragover');triDrop(card.dataset.stem);};
  }
}
async function triDrop(target){
  if(!_dragStem||_dragStem===target){_dragStem=null;return;}
  const stems=S.portraits.map(p=>p.stem);
  const from=stems.indexOf(_dragStem), toOrig=stems.indexOf(target);
  if(from<0||toOrig<0){_dragStem=null;return;}
  stems.splice(from,1);
  stems.splice(stems.indexOf(target)+(from<toOrig?1:0),0,_dragStem);
  _dragStem=null;
  /* appliquer localement (toutes les vues suivent) puis persister */
  const byStem={}; for(const p of S.portraits) byStem[p.stem]=p;
  S.portraits=stems.map(s=>byStem[s]);
  S.order=stems;
  /* premier deplacement hors mode custom : l'ordre affiche (issu des tris)
     devient la base custom, et le tri bascule automatiquement */
  if(((S.settings||{}).sort_portraits||'date')!=='custom'){
    (S.settings=S.settings||{}).sort_portraits='custom';
    await fetch('/api/settings',{method:'POST',body:JSON.stringify({sort_portraits:'custom'})});
    toast('✋ Tri passé en custom — ordre mémorisé pour toutes les vues');
  }
  render();
  await fetch('/api/order',{method:'POST',body:JSON.stringify({order:stems})});
}
async function runTagger(){
  const r=await (await fetch('/api/tagger_run',{method:'POST',body:'{}'})).json();
  if(r.ok){toast('🏷 Analyse des portraits lancée en arrière-plan (~1-2 min)');taggerPoll();}
  else toast(r.error||'erreur');
}
async function taggerPoll(){
  try{
    const r=await (await fetch('/api/tagger_status')).json();
    if(r.running){setTimeout(taggerPoll,4000);return;}
    await refresh();
    toast('🏷 Analyse terminée : '+r.tagged+' portraits taggés');
    if(mode==='tri') render();
  }catch(e){}
}
async function toggleEx(stem){
  const ex=S.excluded.includes(stem);
  await fetch('/api/exclude',{method:'POST',body:JSON.stringify({stem:stem,excluded:!ex})});
  if(ex) S.excluded=S.excluded.filter(s=>s!==stem); else S.excluded.push(stem);
  render();
}

/* ---------- divers ---------- */
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.style.opacity='1';
  t.style.pointerEvents='none';
  clearTimeout(t._tm);
  t._tm=setTimeout(()=>{t.style.opacity='0';},2500);
}
/* ---------- suppression annulable (corbeille serveur) ---------- */
const _delStack=[];
async function deleteVariant(styleKey,stem,file){
  const wasSel=(S.selections[styleKey+'/'+stem]===file);
  await fetch('/api/delete',{method:'POST',body:JSON.stringify({style:styleKey,stem:stem,file:file})});
  const entry={style:styleKey,stem:stem,file:file,wasSel:wasSel};
  _delStack.push(entry);
  toastUndo('Image supprimée',entry);
}
function toastUndo(msg,entry){
  const t=document.getElementById('toast');
  t.innerHTML=_esc(msg)+' — <a href="#" style="color:#bff;font-weight:bold">annuler</a> <span style="color:#9dc;font-size:12px">(Ctrl+Z)</span>';
  t.querySelector('a').onclick=(e)=>{e.preventDefault();undoDelete(entry);};
  t.style.opacity='1';
  t.style.pointerEvents='auto';
  clearTimeout(t._tm);
  t._tm=setTimeout(()=>{t.style.opacity='0';t.style.pointerEvents='none';},6000);
}
async function undoDelete(entry){
  entry=entry||_delStack[_delStack.length-1];
  if(!entry){toast('Rien à annuler');return;}
  const i=_delStack.indexOf(entry);
  if(i>=0) _delStack.splice(i,1);
  let r={};
  try{r=await (await fetch('/api/undelete',{method:'POST',body:JSON.stringify(entry)})).json();}catch(e){}
  if(!r.ok){toast('Annulation impossible (déjà restaurée ou purgée)');return;}
  /* si l'image supprimee etait la selection du style, la re-selectionner */
  if(entry.wasSel){
    const nf=r.file||entry.file;
    await fetch('/api/select',{method:'POST',body:JSON.stringify({key:entry.style+'/'+entry.stem,file:nf})});
  }
  await refresh(); render();
  toast('✅ Image restaurée');
  /* zoom ouvert sur ce groupe : re-integrer la restauree */
  if(lbCtx&&lbCtx.style===entry.style&&lbCtx.stem===entry.stem&&document.getElementById('lb').style.display==='block'){
    lbCtx.files=[...(S.variants[entry.style+'/'+entry.stem]||[])];
    const j=lbCtx.files.indexOf(r.file||entry.file);
    lbCtx.idx=j>=0?j:Math.min(lbCtx.idx,lbCtx.files.length-1);
    if(lbCtx.files.length) lbShow('/img/var/'+entry.style+'/'+entry.stem+'/'+lbCtx.files[lbCtx.idx]);
  }
  /* pop-in "toutes les versions" ouverte : re-render */
  const vp=document.getElementById('verpop');
  if(verAllStem&&vp.style.display==='block'){
    const sc=vp.scrollTop;verOpenAll(null,verAllStem);vp.scrollTop=sc;
  }
}
async function autoSelect(){
  const r=await (await fetch('/api/select_auto',{method:'POST',body:JSON.stringify({style:style})})).json();
  await refresh(); render();
  toast(r.selected+' personnages sélectionnés automatiquement (variante la plus récente)');
}
async function genAll(){
  const r=await (await fetch('/api/regen_all',{method:'POST',body:JSON.stringify({style:style})})).json();
  alert(T(r.queued+' générations mises en file (tous les personnages)'));
}
async function deleteStyleImages(onlyUnselected){
  let total=0,selected=0;
  for(const p of visiblePortraits()){
    const key=style+'/'+p.stem;
    const files=S.variants[key]||[];
    total+=files.length;
    if(effSel(key)) selected++;
  }
  const toDelete=onlyUnselected?(total-selected):total;
  if(!toDelete){toast('Rien à supprimer');return;}
  const msg=onlyUnselected
    ?('Supprimer les '+toDelete+' images NON sélectionnées de « '+styleLabel(style)+' » ?\n(les '+selected+' images sélectionnées sont conservées)\n\nElles vont dans la corbeille de l\'app (restaurables 7 jours).')
    :('Supprimer TOUTES les images générées de « '+styleLabel(style)+' » ('+toDelete+' images) ?\nLes originaux sont conservés.\n\nElles vont dans la corbeille de l\'app (restaurables 7 jours).');
  if(!confirm(T(msg))) return;
  const r=await (await fetch('/api/delete_style',{method:'POST',body:JSON.stringify(
    {style:style,only_unselected:onlyUnselected})})).json();
  await refresh(); render();
  toast('🗑 '+r.deleted+' images mises à la corbeille (_appdata/trash, 7 jours)');
}
async function regenMissing(){
  const r=await (await fetch('/api/regen_missing',{method:'POST',body:JSON.stringify({style:style})})).json();
  alert(T(r.queued+' générations mises en file (personnages sans sélection)'));
}
/* rapport de complétude : persos sans aucune image exportable (ni choix
   explicite ni choix auto) — proposé avant un export global */
function showExportReport(missing){
  let h='<h3>⚠ Export incomplet — '+missing.length+' personnage'+(missing.length>1?'s':'')+' sans image choisie'+
    ' <span style="font-size:12px;color:#9ab;font-weight:normal">(clic sur un personnage : ouvrir toutes ses versions)</span></h3>'+
    '<div style="display:flex;flex-wrap:wrap;gap:10px">';
  for(const p of missing){
    h+='<div class="vcell" style="width:110px;text-align:center" onclick="verOpenAll(event,\''+p.stem+'\')">'+
      '<img class="thumb" loading="lazy" src="/thumb/original/'+p.stem+'" style="width:110px;height:110px;object-fit:contain">'+
      '<div style="font-size:10px;color:#9ab;overflow:hidden;text-overflow:ellipsis">'+p.stem+'</div></div>';
  }
  h+='</div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">'+
    '<button onclick="verClose()">Annuler</button>'+
    '<button class="primary" onclick="verClose();exportSel(true)">Exporter quand même ('+
      (S.portraits.length-missing.length)+' portraits)</button></div>';
  const vp=document.getElementById('verpop');
  vp.innerHTML=h; vp.style.display='block'; vp.scrollTop=0;
  document.getElementById('verpopbg').style.display='block';
}
async function exportSel(force){
  const btn=document.getElementById('btnExport');
  if(btn.disabled) return;
  const lbl=document.getElementById('expLabel');
  const old=lbl.textContent;
  /* export global : verifier la completude d'abord */
  if(mode!=='detail'&&!force){
    const missing=S.portraits.filter(p=>!finalChoice(p.stem));
    if(missing.length){showExportReport(missing);return;}
  }
  btn.disabled=true;btn.style.opacity='.55';
  lbl.textContent='⏳ Export en cours…';
  try{
    const body=(mode==='detail')?{scope:'style',style:style}:{scope:'final'};
    const r=await (await fetch('/api/export',{method:'POST',body:JSON.stringify(body)})).json();
    let msg='✅ '+r.count+' portraits exportés';
    if(r.pack_found) msg+=' — '+r.installed+' installés dans le pack ('+r.backed_up+' backups créés)';
    else msg+=' — pack introuvable, installation ignorée';
    toast(msg);
  }catch(e){
    toast('❌ Erreur pendant l\'export');
  }
  btn.disabled=false;btn.style.opacity='';
  lbl.textContent=old;
}

/* ---------- raccourcis clavier (vue par style) ---------- */
function setCur(stem,scroll){
  if(curStem===stem) return;
  const prev=document.getElementById('row-'+curStem);
  if(prev) prev.classList.remove('cur');
  curStem=stem;
  const el=document.getElementById('row-'+stem);
  if(el){el.classList.add('cur');if(scroll)el.scrollIntoView({block:'center'});}
}
document.addEventListener('keydown',async e=>{
  if(mode!=='detail'||e.target.tagName==='INPUT') return;
  if(document.getElementById('lb').style.display==='block') return;
  const ps=visiblePortraits();
  if(!ps.length) return;
  let i=ps.findIndex(p=>p.stem===curStem);
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
    /* hors zoom : fleches gauche/droite = style precedent/suivant */
    e.preventDefault();
    navStyle(e.key==='ArrowRight'?1:-1);
  }else if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    i=(e.key==='ArrowDown')?Math.min(ps.length-1,i+1):Math.max(0,i<0?0:i-1);
    setCur(ps[i].stem,true);
  }else if(e.key>='1'&&e.key<='9'&&curStem){
    const key=style+'/'+curStem;
    const files=S.variants[key]||[];
    const f=files[+e.key-1];
    if(!f) return;
    const nv=(S.selections[key]===f)?null:f;
    await fetch('/api/select',{method:'POST',body:JSON.stringify({key:key,file:nv})});
    S.selections[key]=nv; render();
  }else if(e.key==='Delete'&&hoverCell){
    await fetch('/api/delete',{method:'POST',body:JSON.stringify(hoverCell)});
    hoverCell=null; await refresh(); render();
  }
});
let lastQ=-1,_resumeToastShown=false;
function fmtDur(s){
  s=Math.round(s);
  if(s>=86400) return Math.floor(s/86400)+'j '+Math.floor((s%86400)/3600)+'h';
  if(s>=3600) return Math.floor(s/3600)+'h '+String(Math.floor((s%3600)/60)).padStart(2,'0')+'min';
  return s>=60?(Math.floor(s/60)+'min '+String(s%60).padStart(2,'0')+'s'):(s+'s');
}
/* flux temps reel : SSE (/api/events) pousse l'etat des que la file change ;
   repli sur le polling 2 s si EventSource indisponible */
let _es=null;
function startQueueFeed(){
  if(!window.EventSource){pollStatus();return;}
  _es=new EventSource('/api/events');
  _es.onmessage=e=>{try{applyQueueStatus(JSON.parse(e.data));}catch(_){}};
  /* en cas d'erreur, EventSource retente tout seul (serveur redemarre...) */
}
async function pollStatus(){
  try{
    const q=await (await fetch('/api/queue')).json();
    await applyQueueStatus(q);
  }catch(e){}
  setTimeout(pollStatus,2000);
}
async function applyQueueStatus(q){
  try{
    qPaused=!!q.paused;
    const active=q.pending>0||q.current;
    document.getElementById('btnPause').style.display=active?'inline-block':'none';
    document.getElementById('btnClear').style.display=(q.pending>0)?'inline-block':'none';
    document.getElementById('btnPause').textContent=qPaused?'▶':'⏸';
    let txt=qPaused?'⏸ EN PAUSE | ':'';
    if(q.current){
      txt='génère : '+q.current+' ⏱'+fmtDur(q.elapsed||0);
      if(q.avg) txt+=' / ~'+fmtDur(q.avg);
      txt+=' | ';
    }
    txt+=q.pending+' en attente';
    if(q.avg&&(q.current||q.pending)){
      const rem=q.pending*q.avg+(q.current?Math.max(5,q.avg-(q.elapsed||0)):0);
      txt+=' | reste ~'+fmtDur(rem);
    }
    if(q.errors.length) txt+=' | erreur : '+q.errors[q.errors.length-1];
    document.getElementById('status').textContent=txt;
    const pr=document.getElementById('prog');
    if(q.batch_total&&(q.pending||q.current)){
      pr.textContent='génération : '+q.batch_done+'/'+q.batch_total+' ('+
        Math.round(100*q.batch_done/q.batch_total)+'%)'+
        (q.avg?(' — reste ~'+fmtDur(q.pending*q.avg+(q.current?Math.max(5,q.avg-(q.elapsed||0)):0))):'');
    }else{
      pr.textContent='';
    }
    const now=q.pending+(q.current?1:0);
    _pendingKeys=q.pending_keys||{};
    if(mode==='detail') syncPendingCells();
    /* file restauree apres redemarrage (en pause) : proposer de reprendre */
    if(!_resumeToastShown&&q.paused&&now>0){
      _resumeToastShown=true;
      const t=document.getElementById('toast');
      t.innerHTML='⏸ '+now+' génération(s) en attente — file en pause · <a href="#" style="color:#bff;font-weight:bold">reprendre</a>';
      t.querySelector('a').onclick=(e)=>{e.preventDefault();queueCtl('resume');t.style.opacity='0';t.style.pointerEvents='none';};
      t.style.opacity='1';t.style.pointerEvents='auto';
      clearTimeout(t._tm);
      t._tm=setTimeout(()=>{t.style.opacity='0';t.style.pointerEvents='none';},15000);
    }
    if(now===0&&lastQ>0){playDone();notifyDone();} /* toutes les generations sont terminees */
    document.getElementById('tabP').innerHTML='Génération'+(now>0?' <span class="busyDot">⏳</span>':'');
    if(mode==='prog'){progUpdate();}
    else if(now===0&&lastQ!==0&&lastQ!==-1){await refresh();render();}
    else if(now<lastQ){await refresh();render();}
    lastQ=now;
  }catch(e){}
}
/* notification systeme (Windows) en fin de file — optionnelle (Options) */
function notifyDone(){
  if(!(S.settings&&S.settings.notify_done)) return;
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  try{
    const n=new Notification('PortraitForge',{
      body:'✅ Toutes les générations sont terminées.',
      icon:'/app.ico', tag:'pf-done'});
    n.onclick=()=>{window.focus();n.close();};
  }catch(e){}
}
/* carillon doux (do-mi-sol) quand toute la file de generation est terminee */
let _audioCtx=null;
function playDone(){
  try{
    if(!_audioCtx) _audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const ctx=_audioCtx;
    if(ctx.state==='suspended') ctx.resume();
    const t0=ctx.currentTime;
    [[523.25,0],[659.25,0.18],[783.99,0.36]].forEach(([f,dt])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type='sine';o.frequency.value=f;
      g.gain.setValueAtTime(0,t0+dt);
      g.gain.linearRampToValueAtTime(0.10,t0+dt+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t0+dt+1.4);
      o.connect(g);g.connect(ctx.destination);
      o.start(t0+dt);o.stop(t0+dt+1.5);
    });
  }catch(e){}
}
/* clic droit sur une vignette = image en taille reelle */
let lbCtx=null;
function lbClose(){document.getElementById('lb').style.display='none';
  document.getElementById('lbimg').src='';lbCtx=null;
  /* la pop-in "toutes les versions" restee derriere : rafraichir selections + image globale */
  const vp=document.getElementById('verpop');
  if(verAllStem&&vp&&vp.style.display==='block'){
    const sc=vp.scrollTop;
    verOpenAll(null,verAllStem);
    vp.scrollTop=sc;
  }
}
async function lbOpen(mode){
  const src=document.getElementById('lbimg').getAttribute('src');
  if(src) await fetch('/api/open',{method:'POST',body:JSON.stringify({url:src,mode:mode})});
}
function lbShow(full){
  const lbi=document.getElementById('lbimg');
  const ob=document.getElementById('lborigbox');
  lbApplyMode();
  if(lbCtx){
    document.getElementById('lborig').src='/img/original/'+lbCtx.stem;
    document.getElementById('lborigcap').textContent='original';
    ob.style.display='';
    /* sous l'original : l'image actuellement selectionnee pour ce style */
    const selbox=document.getElementById('lbselbox');
    const selF=effSel(lbCtx.style+'/'+lbCtx.stem);
    if(selF){
      const cur=(selF===lbCtx.files[lbCtx.idx]);
      const si=document.getElementById('lbsel');
      si.src='/img/var/'+lbCtx.style+'/'+lbCtx.stem+'/'+selF;
      /* dore uniquement si la selection est aussi l'image globale */
      const fcs=finalChoice(lbCtx.stem);
      si.className=(fcs&&!fcs.original&&fcs.style===lbCtx.style&&fcs.file===selF)?'isglob':'';
      document.getElementById('lbselcap').textContent=
        cur?'sélection actuelle (= image affichée)':'sélection actuelle';
      selbox.style.display='';
    }else{
      selbox.style.display='none';
    }
  }else{
    ob.style.display='none';
    lbi.className='';
    lbi.removeAttribute('data-ref');
    lbWordsUpdate(null);
    document.getElementById('lbdartist').textContent='';
    document.getElementById('lbRowNav').style.display='none';
  }
  lbi.src=full;
  /* chemin + resolution + date + mots : via l'infobulle stylee (data-tip/data-ref) */
  lbi.removeAttribute('title');
  lbi.setAttribute('data-tip',decodeURIComponent(full.replace('/img/','')));
  if(lbCtx) lbi.setAttribute('data-ref',lbCtx.style+'/'+lbCtx.stem+'/'+lbCtx.files[lbCtx.idx]);
  lbi.onload=()=>{
    const res=lbi.naturalWidth+'×'+lbi.naturalHeight+' (100%)';
    const base=decodeURIComponent(full.replace('/img/',''));
    lbi.setAttribute('data-tip',base+' — '+res);
    const D=document.getElementById('lbdD');
    if(D&&D.getAttribute('data-ref')===lbi.getAttribute('data-ref'))
      D.setAttribute('data-tip','consultée — '+base+' — '+res);
  };
  const nav=lbCtx&&lbCtx.files.length>1;
  document.getElementById('lbPrev').style.display=nav?'':'none';
  document.getElementById('lbNext').style.display=nav?'':'none';
  document.getElementById('lbCount').style.display=lbCtx?'':'none';
  document.getElementById('lbCount').textContent=lbCtx?((lbCtx.idx+1)+' / '+lbCtx.files.length):'';
  document.getElementById('lbDel').style.display=lbCtx?'':'none';
  const sb=document.getElementById('lbSel');
  sb.style.display=lbCtx?'':'none';
  document.getElementById('lbRegen').style.display=lbCtx?'':'none';
  document.getElementById('lbCustom').style.display=lbCtx?'':'none';
  /* pas d'infos de generation dans le PNG (upload/custom) : cacher Regeneration */
  if(lbCtx){
    const cur=full;
    fetch('/api/geninfo?path='+encodeURIComponent(lbCtx.style+'/'+lbCtx.stem+'/'+lbCtx.files[lbCtx.idx]))
      .then(r=>r.json()).then(d=>{
        if(document.getElementById('lbimg').getAttribute('src')===cur)
          document.getElementById('lbRegen').style.display=d.has_info?'':'none';
      }).catch(()=>{});
  }
  if(lbCtx){
    const f=lbCtx.files[lbCtx.idx];
    const isSel=(effSel(lbCtx.style+'/'+lbCtx.stem)===f);
    const gb=document.getElementById('lbGlobal');
    const ref=lbCtx.style+'/'+f;
    const fc=finalChoice(lbCtx.stem);
    const isGlob=!!(fc&&fc.style===lbCtx.style&&fc.file===f);
    /* cadre vert = image affichee selectionnee ; + dore = aussi image globale */
    lbi.className=isSel?('issel'+(isGlob?' isglob':'')):'';
    /* le groupe (style) affiche porte l'image globale du perso : selectionner
       la rend aussi globale -> un seul bouton fusionne */
    const groupGlob=!!(fc&&!fc.original&&fc.style===lbCtx.style);
    if(groupGlob){
      gb.style.display='none';
      sb.textContent=isSel?(isGlob?'✓ Sélectionnée · ★ globale':'✓ Sélectionnée'):'✓ Sélectionner (devient ★ globale)';
      sb.title='l\'image globale du personnage est dans ce groupe : la sélection l\'emporte avec elle';
    }else{
      gb.style.display='';
      sb.textContent=isSel?'✓ Sélectionnée':'✓ Sélectionner cette image';
      sb.title='raccourci : Entrée ou ↑';
      const explicit=(S.final[lbCtx.stem]===ref);
      gb.textContent=isGlob?('★ Image globale'+(explicit?'':' (auto)')):'☆ Définir comme globale';
      gb.className=isGlob?'isglobal':'';
    }
    sb.className=isSel?'seldone':'selaction';
    document.getElementById('lbdartist').textContent=styleLabel(lbCtx.style);
    /* navigation entre personnages (haut-gauche) : etat des boutons */
    document.getElementById('lbRowNav').style.display='flex';
    document.getElementById('lbRowPrev').disabled=!lbNextRow(lbCtx.stem,-1,1);
    document.getElementById('lbRowNext').disabled=!lbNextRow(lbCtx.stem,1,1);
    /* mode dense : remplir la grille A (original) B (globale) C (selection) D (consultee) */
    if(S.settings&&S.settings.lb_dense){
      document.getElementById('lbdA').src='/img/original/'+lbCtx.stem;
      const B=document.getElementById('lbdB'),eB=document.getElementById('lbdemptyB');
      if(fc){
        B.src=fc.original?('/img/original/'+lbCtx.stem):('/img/var/'+fc.style+'/'+lbCtx.stem+'/'+fc.file);
        B.title='★ globale — '+(fc.original?'texture originale':styleLabel(fc.style))+' · clic : afficher';
        B.style.display='';eB.style.display='none';
      }else{B.style.display='none';B.removeAttribute('src');eB.style.display='flex';}
      const selF2=effSel(lbCtx.style+'/'+lbCtx.stem);
      const C=document.getElementById('lbdC'),eC=document.getElementById('lbdemptyC');
      if(selF2){
        C.src='/img/var/'+lbCtx.style+'/'+lbCtx.stem+'/'+selF2;
        C.title='sélection — '+styleLabel(lbCtx.style)+' · clic : afficher';
        C.style.display='';eC.style.display='none';
      }else{C.style.display='none';C.removeAttribute('src');eC.style.display='flex';}
      const D=document.getElementById('lbdD');
      D.src=full;
      D.removeAttribute('title');
      D.setAttribute('data-tip','consultée — '+decodeURIComponent(full.replace('/img/','')));
      D.setAttribute('data-ref',lbCtx.style+'/'+lbCtx.stem+'/'+f);
      D.className=lbi.className; /* cadres vert (selection) / dore (globale) */
    }
    lbWordsUpdate(lbCtx.style+'/'+lbCtx.stem+'/'+f);
  }
  if(!lbCtx) document.getElementById('lbGlobal').style.display='none';
  document.getElementById('lb').style.display='block';
}
function lbNav(d){
  if(!lbCtx||lbCtx.files.length<2) return;
  const n=lbCtx.files.length;
  lbCtx.idx=(lbCtx.idx+d+n)%n;
  lbShow('/img/var/'+lbCtx.style+'/'+lbCtx.stem+'/'+lbCtx.files[lbCtx.idx]);
}
/* ligne suivante / precedente (meme style) ayant au moins minImgs variantes */
function lbNextRow(afterStem,dir,minImgs){
  dir=dir||1;
  minImgs=minImgs||1;
  const ps=visiblePortraits();
  let i=ps.findIndex(p=>p.stem===afterStem);
  for(let j=i+dir;j>=0&&j<ps.length;j+=dir){
    if((S.variants[lbCtx.style+'/'+ps[j].stem]||[]).length>=minImgs) return ps[j].stem;
  }
  return null;
}
/* ---------- mode d'affichage du zoom : classique / dense (A B / C D) ---------- */
/* cadre "mots de la generation" : extras + prompt complet de l'image consultee */
const _esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function lbWordsUpdate(ref){
  const el=document.getElementById('lbwords');
  el.dataset.ref=ref||'';
  if(!ref){el.style.display='none';return;}
  let gp=_gpCache[ref];
  if(gp===undefined||gp===null){
    try{gp=await (await fetch('/api/genparams?path='+encodeURIComponent(ref))).json();}catch(e){gp={};}
    _gpCache[ref]=gp;
  }
  if(el.dataset.ref!==ref) return; /* on a navigue entre-temps */
  if(!gp.positive){el.style.display='none';return;}
  el.style.display='';
  let h='';
  if(gp.pos_extra) h+='<div><span class="lbwlbl">mots ajoutés :</span> '+_esc(gp.pos_extra)+'</div>';
  if(gp.neg_extra) h+='<div><span class="lbwlbl">négatif :</span> '+_esc(gp.neg_extra)+'</div>';
  h+='<div style="color:#9ab'+((gp.pos_extra||gp.neg_extra)?';margin-top:6px':'')+'">'+_esc(gp.positive)+'</div>';
  el.innerHTML=h;
}
/* couleur du fond derriere les images du zoom (blanc / gris / noir) */
const _LBBG={white:'#fff',grey:'#3a3f48',black:'#000'};
function lbApplyBg(){
  const v=(S&&S.settings&&S.settings.lb_bg)||'grey';
  document.getElementById('lb').style.setProperty('--lbbg',_LBBG[v]||_LBBG.grey);
  for(const b of document.querySelectorAll('#lbBgSel button'))
    b.classList.toggle('on',b.dataset.bg===v);
}
function lbSetBg(v){
  (S.settings=S.settings||{}).lb_bg=v;
  lbApplyBg();
  fetch('/api/settings',{method:'POST',body:JSON.stringify({lb_bg:v})}).catch(()=>{});
}
function lbApplyMode(){
  const dense=!!(S&&S.settings&&S.settings.lb_dense);
  lbApplyBg();
  /* cadre des mots de generation : colonne de droite en dense (aligne avec le
     haut de l'image D), flottant bas-droite en classique */
  const w=document.getElementById('lbwords');
  w.classList.toggle('lbwclassic',!dense);
  if(dense) document.getElementById('lbdlow').insertBefore(w,document.getElementById('lbdbtns'));
  else document.getElementById('lbwrap').appendChild(w); /* classique : colonne a droite de l'image */
  document.getElementById('lbwrap').style.display=dense?'none':'';
  document.getElementById('lbbar').style.display=dense?'none':'';
  document.getElementById('lbdense').style.display=dense?'flex':'none';
  document.getElementById('lbModeBtn').textContent=dense?'▭':'▦';
  if(dense){
    const btns=document.getElementById('lbdbtns');
    for(const id of ['lbSel','lbGlobal','lbRegen','lbCustom','lbDel'])
      btns.appendChild(document.getElementById(id));
    let nav=document.getElementById('lbdnav');
    if(!nav){nav=document.createElement('div');nav.id='lbdnav';}
    for(const id of ['lbPrev','lbCount','lbNext']) nav.appendChild(document.getElementById(id));
    btns.appendChild(nav);
    document.getElementById('lbdcellD').appendChild(document.getElementById('lbicons'));
  }else{
    const bar=document.querySelector('#lbbar .lbrow');
    for(const id of ['lbPrev','lbCount','lbNext','lbSel','lbGlobal','lbRegen','lbCustom','lbDel'])
      bar.appendChild(document.getElementById(id));
    document.getElementById('lbimgbox').appendChild(document.getElementById('lbicons'));
  }
}
async function lbToggleMode(){
  const nv=!(S.settings&&S.settings.lb_dense);
  (S.settings=S.settings||{}).lb_dense=nv;
  lbApplyMode();
  if(lbCtx) lbShow('/img/var/'+lbCtx.style+'/'+lbCtx.stem+'/'+lbCtx.files[lbCtx.idx]);
  fetch('/api/settings',{method:'POST',body:JSON.stringify({lb_dense:nv})}).catch(()=>{});
}
/* boutons haut-gauche : personnage precedent / suivant (meme liste que Ctrl+fleches) */
function lbRowNav(d){
  if(!lbCtx) return;
  const nxt=lbNextRow(lbCtx.stem,d,1);
  if(nxt) lbGotoRow(nxt);
}
/* clic sur B (globale) ou C (selection) en mode dense : afficher cette image en D */
function lbdGoto(which){
  if(!lbCtx) return;
  let f=null;
  if(which==='C') f=effSel(lbCtx.style+'/'+lbCtx.stem);
  else{
    const fc=finalChoice(lbCtx.stem);
    if(fc&&!fc.original&&fc.style===lbCtx.style) f=fc.file;
  }
  const i=f?lbCtx.files.indexOf(f):-1;
  if(i<0) return;
  lbCtx.idx=i;
  lbShow('/img/var/'+lbCtx.style+'/'+lbCtx.stem+'/'+f);
}
/* survol de l'original : apercu de l'image globale du personnage */
function lbOrigHover(on){
  if(!lbCtx) return;
  const o=document.getElementById('lborig');
  const cap=document.getElementById('lborigcap');
  if(on){
    const fc=finalChoice(lbCtx.stem);
    if(!fc){cap.textContent='original (pas d\'image globale)';return;}
    if(fc.original){cap.textContent='image globale = originale';return;}
    o.src='/img/var/'+fc.style+'/'+lbCtx.stem+'/'+fc.file;
    cap.textContent='image globale — '+styleLabel(fc.style);
  }else{
    o.src='/img/original/'+lbCtx.stem;
    cap.textContent='original';
  }
}
/* clic sur la vignette "selection actuelle" : afficher cette image */
function lbGotoSel(){
  if(!lbCtx) return;
  const selF=effSel(lbCtx.style+'/'+lbCtx.stem);
  const i=selF?lbCtx.files.indexOf(selF):-1;
  if(i<0) return;
  lbCtx.idx=i;
  lbShow('/img/var/'+lbCtx.style+'/'+lbCtx.stem+'/'+selF);
}
/* ouvre les images d'une ligne : par defaut l'image selectionnee si elle existe */
function lbGotoRow(stem){
  const key=lbCtx.style+'/'+stem;
  const files=S.variants[key]||[];
  if(!files.length){lbClose();return;}
  const sel=effSel(key);
  lbCtx={style:lbCtx.style,stem:stem,files:files,
         idx:sel?Math.max(0,files.indexOf(sel)):0};
  lbShow('/img/var/'+key+'/'+lbCtx.files[lbCtx.idx]);
  const row=document.getElementById('row-'+stem);
  if(row) row.scrollIntoView({block:'center'});
}
/* prochaine ligne restant "a trier" : plusieurs images (selectionnee ou pas),
   ou une seule image non selectionnee. Les lignes a 1 image deja selectionnee
   sont sautees. */
function lbNextRowToSort(afterStem){
  const ps=visiblePortraits();
  let i=ps.findIndex(p=>p.stem===afterStem);
  for(let j=i+1;j<ps.length;j++){
    const key=lbCtx.style+'/'+ps[j].stem;
    const files=S.variants[key]||[];
    if(!files.length) continue;
    if(files.length>1) return ps[j].stem;
    if(effSel(key)!==files[0]) return ps[j].stem;
  }
  return null;
}
async function lbSelect(){
  if(!lbCtx) return;
  const sk=lbCtx.style;
  const key=sk+'/'+lbCtx.stem;
  const f=lbCtx.files[lbCtx.idx];
  await fetch('/api/select',{method:'POST',body:JSON.stringify({key:key,file:f})});
  S.selections[key]=f;
  await syncGlobalWithSelection(lbCtx.stem,sk,f);
  render();
  const nxt=lbNextRowToSort(lbCtx.stem);
  if(nxt){lbGotoRow(nxt);}
  else{lbClose();toast('🎉 Tri terminé pour '+styleLabel(sk)+' !');}
}
async function lbSetGlobal(){
  if(!lbCtx) return;
  const ref=lbCtx.style+'/'+lbCtx.files[lbCtx.idx];
  const nv=(S.final[lbCtx.stem]===ref)?null:ref;
  await fetch('/api/final',{method:'POST',body:JSON.stringify({stem:lbCtx.stem,ref:nv})});
  if(nv) S.final[lbCtx.stem]=nv; else delete S.final[lbCtx.stem];
  render(); /* rafraichir la vue derriere (etoile globale, colonne Choix...) */
  lbShow('/img/var/'+lbCtx.style+'/'+lbCtx.stem+'/'+lbCtx.files[lbCtx.idx]);
  render();
  toast(nv?'★ Image globale définie pour ce personnage':'Image globale retirée (retour automatique)');
}
/* pre-remplit le popup (deja ouvert via showPop) avec les parametres de
   generation d'une image (reponse de /api/genparams) */
function popApplyGenParams(gp){
  document.getElementById('popTitle').textContent='Régénérer (paramètres de cette image)';
  if(gp.denoise!=null){document.getElementById('popDn').value=gp.denoise;dnExplain();}
  if(gp.lora_strength!=null) document.getElementById('popLora').value=gp.lora_strength;
  if(gp.cnet_strength!=null) document.getElementById('popCnet').value=gp.cnet_strength;
  if(gp.cnet_end!=null) document.getElementById('popCend').value=gp.cnet_end;
  if(gp.seed!=null){
    /* proposer la reutilisation de la seed, DESACTIVEE par defaut (aleatoire) */
    const ps=document.getElementById('popSeed');
    ps.value='';
    ps.dataset.imgseed=gp.seed;
    document.getElementById('popSeedReuseWrap').style.display='';
    document.getElementById('popSeedReuse').checked=false;
  }
  /* mots ajoutes aux prompts lors de la generation de cette image */
  document.getElementById('popPos').value=gp.pos_extra||'';
  document.getElementById('popNeg').value=gp.neg_extra||'';
  /* quantite : celle configuree (les seeds s'incrementent par exemplaire) */
  if(gp.model){
    /* recaler le checkpoint sur celui de l'image (nom sans extension) */
    const base=c=>{
      let s=c;
      const i=Math.max(s.lastIndexOf('/'),s.lastIndexOf(String.fromCharCode(92)));
      if(i>=0) s=s.slice(i+1);
      const j=s.lastIndexOf('.');
      return j>0?s.slice(0,j):s;
    };
    if(_ckptList){const hit=_ckptList.find(c=>base(c)===gp.model);if(hit) fillPopCkpt(hit);}
    else fetch('/api/checkpoints').then(r=>r.json()).then(d=>{
      _ckptList=d.checkpoints;const hit=_ckptList.find(c=>base(c)===gp.model);
      if(hit) fillPopCkpt(hit);}).catch(()=>{});
  }
  /* relance ponctuelle : ne pas memoriser ces valeurs dans le style */
  document.getElementById('popMemo').checked=false;
}
async function lbRegen(ev){
  if(!lbCtx) return;
  /* ouvre le popup pre-rempli avec les parametres de generation de CETTE image */
  const f=lbCtx.files[lbCtx.idx];
  let gp={};
  try{
    gp=await (await fetch('/api/genparams?path='+
      encodeURIComponent(lbCtx.style+'/'+lbCtx.stem+'/'+f))).json();
  }catch(e){}
  showPop(ev,lbCtx.style,lbCtx.stem,'custom');
  popApplyGenParams(gp);
}
/* bouton ⟳ d'une vignette de "toutes les versions" : popup pre-rempli avec
   les parametres de CETTE image, ou popup custom vierge si l'image n'a pas
   d'infos de generation (upload, categorie Custom...) */
async function verRegen(ev,key,f){
  ev.stopPropagation();ev.preventDefault();
  const [sk,stem]=key.split(/\/(.+)/);
  let gp={};
  try{
    gp=await (await fetch('/api/genparams?path='+encodeURIComponent(key+'/'+f))).json();
  }catch(e){}
  showPop(ev,sk,stem,'custom');
  if(Object.keys(gp).length) popApplyGenParams(gp);
}
/* bouton ★ d'une vignette selectionnee : en faire l'image globale du perso */
async function verSetGlobal(ev,key,f){
  ev.stopPropagation();ev.preventDefault();
  const [sk,stem]=key.split(/\/(.+)/);
  const ref=sk+'/'+f;
  const nv=(S.final[stem]===ref)?null:ref;
  await fetch('/api/final',{method:'POST',body:JSON.stringify({stem:stem,ref:nv})});
  if(nv) S.final[stem]=ref; else delete S.final[stem];
  const g=document.getElementById('vglobrow');
  if(g&&verAllStem) g.innerHTML=verGlobRowHtml(verAllStem);
  toast(nv?'★ Image globale définie pour '+stem:'Image globale retirée (retour automatique)');
}
function lbCustom(ev){
  if(!lbCtx) return;
  showPop(ev,lbCtx.style,lbCtx.stem,'custom');
}
async function lbDelete(){
  if(!lbCtx) return;
  const stem=lbCtx.stem, idx=lbCtx.idx, sk=lbCtx.style;
  const key=sk+'/'+stem;
  const f=lbCtx.files[idx];
  /* optimiste : image suivante affichee IMMEDIATEMENT, suppression et
     resynchronisation en arriere-plan */
  lbCtx.files.splice(idx,1);
  const local=S.variants[key];
  if(local){
    const i=local.indexOf(f);
    if(i>=0) local.splice(i,1);
    if(!local.length) delete S.variants[key];
  }
  if(S.selections[key]===f) S.selections[key]=null;
  if(lbCtx.files.length){
    lbCtx.idx=Math.min(idx,lbCtx.files.length-1);
    lbShow('/img/var/'+key+'/'+lbCtx.files[lbCtx.idx]);
  }else{
    /* plus d'image pour ce personnage : retour a l'affichage precedent */
    lbClose();
  }
  deleteVariant(sk,stem,f).then(()=>refresh()).then(()=>render()).catch(()=>{});
}
document.addEventListener('contextmenu',e=>{
  const im=e.target;
  if(im.tagName!=='IMG') return;
  const src=im.getAttribute('src')||'';
  if(!src.startsWith('/thumb/')&&!src.startsWith('/img/')) return;
  e.preventDefault();
  const full=src.replace('/thumb/','/img/');
  lbCtx=null;
  const m=full.match(/^\/img\/var\/([^/]+)\/([^/]+)\/(.+)$/);
  if(m){
    const files=S.variants[m[1]+'/'+m[2]]||[];
    if(files.length) lbCtx={style:m[1],stem:m[2],files:files,idx:Math.max(0,files.indexOf(m[3]))};
  }
  lbShow(full);
});
window.addEventListener('resize',()=>{const h=document.querySelector('header').offsetHeight;
  document.documentElement.style.setProperty('--headh',(h+8)+'px');
  measureMixSticky();setupMwrap();});
/* fleches du clavier : defilement des matrices (Vue d'ensemble / Selection globale) */
document.addEventListener('keydown',e=>{
  if(mode!=='mix'&&mode!=='matrix') return;
  if(document.getElementById('lb').style.display==='block') return;
  if(document.getElementById('verpop').style.display==='block') return;
  if(document.getElementById('pop').style.display==='block') return;
  if(document.getElementById('optpop').style.display==='block') return;
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT') return;
  const step={ArrowLeft:[-240,0],ArrowRight:[240,0],ArrowUp:[0,-200],ArrowDown:[0,200]}[e.key];
  if(!step) return;
  const mw=document.querySelector('.mwrap');
  if(!mw) return;
  e.preventDefault();
  mw.scrollLeft+=step[0];
  mw.scrollTop+=step[1];
});

/* molette dans le zoom : image precedente / suivante */
document.getElementById('lb').addEventListener('wheel',e=>{
  if(lbCtx&&lbCtx.files.length>1){
    e.preventDefault();
    lbNav(e.deltaY>0?1:-1);
  }
},{passive:false});
document.addEventListener('keydown',e=>{
  /* popup Regenerer/Custom (ou Options) ouvert : aucun raccourci de
     l'interface en dessous ne doit reagir (Suppr, fleches, Entree...) ;
     Echap ne ferme que ce popup */
  if(document.getElementById('pop').style.display==='block'||
     document.getElementById('optpop').style.display==='block'){
    if(e.key==='Escape'){hidePop();optClose();hideCtx();}
    return;
  }
  /* saisie dans un champ : laisser le clavier au champ */
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')){
    if(e.key==='Escape') e.target.blur();
    return;
  }
  if(e.key==='Escape'){hidePop();lbClose();hideCtx();verClose();optClose();helpClose();return;}
  if(e.key==='?'){e.preventDefault();helpOpen();return;}
  /* Ctrl+Z : restaurer la derniere image supprimee */
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&(e.key==='z'||e.key==='Z')){
    e.preventDefault();undoDelete();return;
  }
  if(document.getElementById('lb').style.display==='block'){
    if(e.ctrlKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
      /* Ctrl+→ : ligne suivante (>=1 image) / Ctrl+← : precedente.
         Avec Alt : seulement les lignes ayant >=2 images. */
      e.preventDefault();
      if(lbCtx){
        const dir=(e.key==='ArrowRight')?1:-1;
        const nxt=lbNextRow(lbCtx.stem,dir,e.altKey?2:1);
        if(nxt) lbGotoRow(nxt);
      }
    }
    else if(e.key==='ArrowLeft'){e.preventDefault();lbNav(-1);}
    else if(e.key==='ArrowRight'){e.preventDefault();lbNav(1);}
    else if(e.key==='Enter'||e.key==='ArrowUp'){e.preventDefault();lbSelect();}
    else if(e.key==='Delete'||e.key==='ArrowDown'){e.preventDefault();lbDelete();}
  }
  else if(verAllStem&&document.getElementById('verpop').style.display==='block'){
    /* pop-in "toutes les versions" : fleches = portrait precedent / suivant */
    if(e.key==='ArrowLeft'){e.preventDefault();verNav(-1);}
    else if(e.key==='ArrowRight'){e.preventDefault();verNav(1);}
  }
});
/* ---------- aide : raccourcis clavier (bouton ? ou touche ?) ---------- */
function helpOpen(){
  const row=(k,txt)=>'<tr><td class="hk">'+k+'</td><td>'+txt+'</td></tr>';
  document.getElementById('helppop').innerHTML=
    '<h3>⌨ Raccourcis clavier</h3>'+
    '<h4>Partout</h4><table class="helptbl">'+
    row('Échap','fermer le popup / zoom / menu ouvert')+
    row('Ctrl+Z','restaurer la dernière image supprimée')+
    row('?','cette aide')+
    '</table><h4>Vue d\'ensemble / Sélection globale</h4><table class="helptbl">'+
    row('↑ ↓ ← →','faire défiler le tableau')+
    '</table><h4>Par style</h4><table class="helptbl">'+
    row('↑ / ↓','personnage précédent / suivant')+
    row('← / →','style précédent / suivant')+
    row('1 … 9','sélectionner la variante n°N du personnage courant (re-appui : désélectionner)')+
    row('Suppr','supprimer la vignette survolée')+
    '</table><h4>Zoom (comparaison)</h4><table class="helptbl">'+
    row('← / →','image précédente / suivante')+
    row('Entrée ou ↑','sélectionner l\'image affichée')+
    row('Suppr ou ↓','supprimer l\'image affichée')+
    row('Ctrl+← / Ctrl+→','personnage précédent / suivant (Alt : seulement ceux à ≥2 images)')+
    row('molette','image précédente / suivante')+
    '</table><h4>Toutes les versions</h4><table class="helptbl">'+
    row('← / →','portrait précédent / suivant')+
    '</table>'+
    '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button onclick="helpClose()">Fermer</button></div>';
  document.getElementById('helppop').style.display='block';
  document.getElementById('helppopbg').style.display='block';
}
function helpClose(){
  const h=document.getElementById('helppop');
  if(h){h.style.display='none';document.getElementById('helppopbg').style.display='none';}
}

/* ---------- info-bulle retardee (2 s) : actions des clics (attribut data-tip)
   + date de generation relative (attribut data-ref = style/stem/fichier) ---------- */
const _ageCache={};
const _gpCache={}; /* parametres de generation par image (mots, prompt...) */
function fmtAge(ts){
  const s=Math.max(0,Date.now()/1000-ts);
  if(s<60) return "à l'instant";
  const m=Math.floor(s/60); if(m<60) return 'il y a '+m+' minute'+(m>1?'s':'');
  const h=Math.floor(m/60); if(h<24) return 'il y a '+h+' heure'+(h>1?'s':'');
  const d=Math.floor(h/24); if(d<30) return 'il y a '+d+' jour'+(d>1?'s':'');
  const mo=Math.floor(d/30); if(mo<12) return 'il y a '+mo+' mois';
  const y=Math.floor(d/365); return 'il y a '+y+' an'+(y>1?'s':'');
}
function _tipText(t){
  const parts=[];
  const ref=t.getAttribute('data-ref');
  if(ref&&typeof _ageCache[ref]==='number') parts.push('🕒 générée '+fmtAge(_ageCache[ref]));
  const gp=ref?_gpCache[ref]:null;
  if(gp&&gp.pos_extra) parts.push('✎ mots : '+gp.pos_extra);
  if(gp&&gp.neg_extra) parts.push('⊘ négatif : '+gp.neg_extra);
  const d=t.getAttribute('data-tip');
  if(d) parts.push(d);
  return parts.join('\n');
}
let _tipTimer=null,_tipTarget=null;
function hideTip(){
  if(_tipTimer){clearTimeout(_tipTimer);_tipTimer=null;}
  _tipTarget=null;
  document.getElementById('clicktip').style.display='none';
}
document.addEventListener('mouseover',e=>{
  const t=e.target&&e.target.closest?e.target.closest('[data-tip]'):null;
  if(t===_tipTarget) return;
  hideTip();
  if(!t) return;
  /* jamais d'info-bulle dans les popups de reglages */
  if(t.closest('#pop')||t.closest('#optpop')) return;
  _tipTarget=t;
  /* precharger date + mots de generation pendant le delai des 2 s */
  const ref=t.getAttribute('data-ref');
  const _tipRefresh=()=>{
    const tip=document.getElementById('clicktip');
    if(_tipTarget===t&&tip.style.display==='block') tip.textContent=_tipText(t);
  };
  if(ref&&_ageCache[ref]===undefined){
    _ageCache[ref]=null;
    fetch('/api/fmtime?path='+encodeURIComponent(ref)).then(r=>r.json()).then(d=>{
      if(d.mtime) _ageCache[ref]=d.mtime;
      _tipRefresh();
    }).catch(()=>{});
  }
  if(ref&&_gpCache[ref]===undefined){
    _gpCache[ref]=null;
    fetch('/api/genparams?path='+encodeURIComponent(ref)).then(r=>r.json()).then(d=>{
      _gpCache[ref]=d||{};
      _tipRefresh();
    }).catch(()=>{});
  }
  _tipTimer=setTimeout(()=>{
    if(_tipTarget!==t) return;
    const tip=document.getElementById('clicktip');
    tip.textContent=_tipText(t);
    if(!tip.textContent){hideTip();return;}
    tip.style.display='block';
    const r=t.getBoundingClientRect();
    let x=r.left+Math.min(30,r.width/2), y=r.bottom+8;
    if(x+tip.offsetWidth>window.innerWidth-8) x=window.innerWidth-8-tip.offsetWidth;
    if(y+tip.offsetHeight>window.innerHeight-8) y=r.top-tip.offsetHeight-8;
    tip.style.left=Math.max(4,x)+'px';
    tip.style.top=Math.max(4,y)+'px';
  },+t.getAttribute('data-tipdelay')||2000); /* delai par element (image consultee : rapide) */
});
document.addEventListener('mouseout',e=>{
  if(_tipTarget&&_tipTarget.contains(e.target)&&!_tipTarget.contains(e.relatedTarget)) hideTip();
});
document.addEventListener('mousedown',hideTip,true);
document.addEventListener('scroll',hideTip,true);

load();
